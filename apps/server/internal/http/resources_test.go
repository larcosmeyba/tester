package serverhttp

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
)

// The nearby-lookup handler's pure logic, without any network: the
// category→query contract, the distance math, and the unconfigured-key
// behavior. The proxy path itself runs against a stub Places server.

func TestResourceCategoryMapping(t *testing.T) {
	tests := []struct {
		category  string
		wantQuery string
		wantTag   string
	}{
		{"food", "food pantry", "Food Pantry"},
		{"housing", "homeless shelter", "Housing Support"},
		{"healthcare", "free clinic", "Healthcare"},
		{"utility", "LIHEAP utility assistance office", "Energy Assistance"},
		{"job", "job training center", "Job Training"},
	}
	for _, tt := range tests {
		if got := resourceCategoryQueries[tt.category]; got != tt.wantQuery {
			t.Errorf("resourceCategoryQueries[%q] = %q, want %q", tt.category, got, tt.wantQuery)
		}
		if got := resourceCategoryTags[tt.category]; got != tt.wantTag {
			t.Errorf("resourceCategoryTags[%q] = %q, want %q", tt.category, got, tt.wantTag)
		}
	}
	// Every searchable category has a tag, and vice versa: the two maps are
	// the two halves of one contract.
	for category := range resourceCategoryQueries {
		if resourceCategoryTags[category] == "" {
			t.Errorf("category %q has a search query but no tag", category)
		}
	}
	for category := range resourceCategoryTags {
		if resourceCategoryQueries[category] == "" {
			t.Errorf("category %q has a tag but no search query", category)
		}
	}
}

func TestHaversineMi(t *testing.T) {
	tests := []struct {
		name                  string
		lat1, lng1, lat2, lng float64
		want                  float64
		tolerance             float64
	}{
		// Same point: zero, not NaN or noise.
		{"same point", 34.0522, -118.2437, 34.0522, -118.2437, 0, 0.001},
		// One degree of longitude at 40°N is about 53.0 miles.
		{"one degree at 40N", 40.0, -74.0, 40.0, -73.0, 53.0, 0.5},
		// New York to Los Angeles, great-circle, roughly 2446 miles.
		{"coast to coast", 40.7128, -74.0060, 34.0522, -118.2437, 2446, 5},
	}
	for _, tt := range tests {
		got := haversineMi(tt.lat1, tt.lng1, tt.lat2, tt.lng)
		if diff := got - tt.want; diff < -tt.tolerance || diff > tt.tolerance {
			t.Errorf("haversineMi(%v) = %v, want about %v", tt.name, got, tt.want)
		}
	}
}

func TestRoundDistanceMi(t *testing.T) {
	tests := []struct {
		in   float64
		want float64
	}{
		{12.344, 12.3},
		{12.349, 12.3},
		{12.351, 12.4},
		{0.04, 0.0},
	}
	for _, tt := range tests {
		if got := roundDistanceMi(tt.in); got != tt.want {
			t.Errorf("roundDistanceMi(%v) = %v, want %v", tt.in, got, tt.want)
		}
	}
}

func TestResourcesNearbyNotConfigured(t *testing.T) {
	for _, apiKey := range []string{"", "   "} {
		request := httptest.NewRequest(http.MethodGet, "/resources/nearby?lat=34&lng=-118", nil)
		recorder := httptest.NewRecorder()

		ResourcesNearby(ResourcesDeps{APIKey: apiKey})(recorder, request)

		if recorder.Code != http.StatusServiceUnavailable {
			t.Fatalf("status = %d, want %d (apiKey=%q)", recorder.Code, http.StatusServiceUnavailable, apiKey)
		}
		body := recorder.Body.String()
		if !strings.Contains(body, `"error":"resource lookup not configured"`) {
			t.Fatalf("body missing the unconfigured error: %q", body)
		}
		if !strings.Contains(body, "not configured on the server yet") {
			t.Fatalf("body missing the honest message: %q", body)
		}
	}
}

func TestResourcesNearbyValidation(t *testing.T) {
	deps := ResourcesDeps{APIKey: "test-key"}
	tests := []struct {
		name string
		url  string
	}{
		{"no params", "/resources/nearby"},
		{"empty q", "/resources/nearby?q="},
		{"bad lat", "/resources/nearby?lat=abc&lng=-118"},
		{"bad lng", "/resources/nearby?lat=34&lng=east"},
		{"lat without lng", "/resources/nearby?lat=34"},
		{"lat out of range", "/resources/nearby?lat=91&lng=-118"},
		{"lng out of range", "/resources/nearby?lat=34&lng=-181"},
		{"bad radius", "/resources/nearby?lat=34&lng=-118&radiusMi=many"},
		{"short zip", "/resources/nearby?zip=1234"},
		{"long zip", "/resources/nearby?zip=123456"},
		{"alpha zip", "/resources/nearby?zip=abcde"},
		{"unknown category", "/resources/nearby?lat=34&lng=-118&category=plumbing"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			request := httptest.NewRequest(http.MethodGet, tt.url, nil)
			recorder := httptest.NewRecorder()

			ResourcesNearby(deps)(recorder, request)

			if recorder.Code != http.StatusBadRequest {
				t.Fatalf("status = %d, want %d", recorder.Code, http.StatusBadRequest)
			}
		})
	}
}

// placesStub is a fake Google Places API: it records what the handler asked
// for and answers with canned places, so the proxy and mapping logic run
// without network.
type placesStub struct {
	t          *testing.T
	mu         sync.Mutex
	apiKey     string
	fieldMask  string
	searchBody placesSearchRequest
	status     int
	response   string
}

func (s *placesStub) handler(w http.ResponseWriter, r *http.Request) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.apiKey = r.Header.Get("X-Goog-Api-Key")
	s.fieldMask = r.Header.Get("X-Goog-FieldMask")
	body, err := io.ReadAll(io.LimitReader(r.Body, 1<<20))
	if err != nil {
		s.t.Fatalf("reading stub request body: %v", err)
	}
	if err := json.Unmarshal(body, &s.searchBody); err != nil {
		s.t.Fatalf("stub request body is not JSON: %v", err)
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(s.status)
	_, _ = w.Write([]byte(s.response))
}

func newPlacesStub(t *testing.T, status int, response string) (*httptest.Server, *placesStub) {
	t.Helper()
	stub := &placesStub{t: t, status: status, response: response}
	server := httptest.NewServer(http.HandlerFunc(stub.handler))
	t.Cleanup(server.Close)
	return server, stub
}

const stubPlacesResponse = `{"places":[
  {"id":"place-far","displayName":{"text":"Far Pantry"},"formattedAddress":"1 Far St, Los Angeles, CA",
   "nationalPhoneNumber":"(555) 111-2222","websiteUri":"https://far.example.org",
   "regularOpeningHours":{"weekdayDescriptions":["Monday: 9:00 AM – 5:00 PM","Tuesday: 9:00 AM – 5:00 PM","Wednesday: 9:00 AM – 5:00 PM"]},
   "location":{"latitude":34.2000,"longitude":-118.5000},"primaryType":"food_bank"},
  {"id":"place-near","displayName":{"text":"Near Pantry"},"formattedAddress":"2 Near St, Los Angeles, CA",
   "location":{"latitude":34.0600,"longitude":-118.2500},"primaryType":"food_bank"}
]}`

func TestResourcesNearbySuccess(t *testing.T) {
	server, stub := newPlacesStub(t, http.StatusOK, stubPlacesResponse)

	request := httptest.NewRequest(http.MethodGet, "/resources/nearby?lat=34.0522&lng=-118.2437&category=food", nil)
	recorder := httptest.NewRecorder()

	ResourcesNearby(ResourcesDeps{APIKey: "test-key", BaseURL: server.URL})(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d: %s", recorder.Code, http.StatusOK, recorder.Body.String())
	}
	if stub.apiKey != "test-key" {
		t.Errorf("X-Goog-Api-Key = %q, want test-key", stub.apiKey)
	}
	if !strings.Contains(stub.fieldMask, "places.location") || !strings.Contains(stub.fieldMask, "places.regularOpeningHours") {
		t.Errorf("X-Goog-FieldMask = %q, missing required fields", stub.fieldMask)
	}
	if stub.searchBody.TextQuery != "food pantry" {
		t.Errorf("textQuery = %q, want %q", stub.searchBody.TextQuery, "food pantry")
	}
	if stub.searchBody.LocationBias == nil {
		t.Fatal("expected a locationBias circle for a lat/lng request")
	}
	if stub.searchBody.MaxResultCount != 20 {
		t.Errorf("maxResultCount = %d, want 20", stub.searchBody.MaxResultCount)
	}

	var results []resourceResult
	if err := json.Unmarshal(recorder.Body.Bytes(), &results); err != nil {
		t.Fatalf("response is not a resource array: %v", err)
	}
	if len(results) != 2 {
		t.Fatalf("got %d results, want 2", len(results))
	}
	// Nearest first: Near Pantry (~0.6 mi) before Far Pantry (~20 mi).
	if results[0].ID != "place-near" || results[1].ID != "place-far" {
		t.Fatalf("results not sorted by distance: %v, %v", results[0].ID, results[1].ID)
	}
	near, far := results[0], results[1]
	if near.Tag != "Food Pantry" {
		t.Errorf("tag = %q, want %q", near.Tag, "Food Pantry")
	}
	if near.DistanceMi == nil || *near.DistanceMi <= 0 {
		t.Errorf("near distanceMi = %v, want a positive rounded value", near.DistanceMi)
	}
	if far.DistanceMi == nil || *far.DistanceMi <= *near.DistanceMi {
		t.Errorf("far distanceMi = %v, want larger than %v", far.DistanceMi, near.DistanceMi)
	}
	if far.Hours != "Monday: 9:00 AM – 5:00 PM; Tuesday: 9:00 AM – 5:00 PM; …" {
		t.Errorf("hours = %q, want the first two entries plus …", far.Hours)
	}
	if far.Phone != "(555) 111-2222" || far.Website != "https://far.example.org" {
		t.Errorf("phone/website = %q / %q, want the Places values", far.Phone, far.Website)
	}
	// Absent fields are omitted, never nulled or invented: the near place has
	// no phone, website or hours.
	raw := recorder.Body.String()
	if strings.Contains(raw, `"phone":null`) || strings.Contains(raw, `"hours":null`) || strings.Contains(raw, `"website":null`) {
		t.Errorf("absent fields must be omitted, not null: %s", raw)
	}
	if near.Latitude == nil || near.Longitude == nil {
		t.Errorf("expected lat/lng on the near result")
	}
}

func TestResourcesNearbyZipQuery(t *testing.T) {
	server, stub := newPlacesStub(t, http.StatusOK, `{"places":[]}`)

	request := httptest.NewRequest(http.MethodGet, "/resources/nearby?zip=90210&category=food", nil)
	recorder := httptest.NewRecorder()

	ResourcesNearby(ResourcesDeps{APIKey: "test-key", BaseURL: server.URL})(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d: %s", recorder.Code, http.StatusOK, recorder.Body.String())
	}
	if want := "food pantry near 90210"; stub.searchBody.TextQuery != want {
		t.Errorf("textQuery = %q, want %q", stub.searchBody.TextQuery, want)
	}
	if stub.searchBody.LocationBias != nil {
		t.Errorf("zip form must not send a locationBias")
	}
	var results []resourceResult
	if err := json.Unmarshal(recorder.Body.Bytes(), &results); err != nil {
		t.Fatalf("response is not a resource array: %v", err)
	}
	if results == nil || len(results) != 0 {
		t.Errorf("expected an empty array, got %v", results)
	}
}

func TestResourcesNearbyUpstreamError(t *testing.T) {
	server, _ := newPlacesStub(t, http.StatusBadRequest, `{"error":{"message":"bad"}}`)

	request := httptest.NewRequest(http.MethodGet, "/resources/nearby?lat=34&lng=-118", nil)
	recorder := httptest.NewRecorder()

	ResourcesNearby(ResourcesDeps{APIKey: "test-key", BaseURL: server.URL})(recorder, request)

	if recorder.Code != http.StatusBadGateway {
		t.Fatalf("status = %d, want %d", recorder.Code, http.StatusBadGateway)
	}
	if body := recorder.Body.String(); !strings.Contains(body, "resource lookup unavailable") {
		t.Errorf("body should carry the generic message, got: %q", body)
	}
}

func TestResourcesNearbyUncategorizedTag(t *testing.T) {
	server, _ := newPlacesStub(t, http.StatusOK, `{"places":[
		{"id":"x","displayName":{"text":"Clinic"},"formattedAddress":"3 Main St",
		 "location":{"latitude":34.05,"longitude":-118.24},"primaryType":"medical_clinic"}
	]}`)

	request := httptest.NewRequest(http.MethodGet, "/resources/nearby?lat=34.0522&lng=-118.2437", nil)
	recorder := httptest.NewRecorder()

	ResourcesNearby(ResourcesDeps{APIKey: "test-key", BaseURL: server.URL})(recorder, request)

	var results []resourceResult
	if err := json.Unmarshal(recorder.Body.Bytes(), &results); err != nil {
		t.Fatalf("response is not a resource array: %v", err)
	}
	if len(results) != 1 {
		t.Fatalf("got %d results, want 1", len(results))
	}
	if results[0].Tag != "Medical Clinic" {
		t.Errorf("tag = %q, want %q (humanized primaryType)", results[0].Tag, "Medical Clinic")
	}
}
