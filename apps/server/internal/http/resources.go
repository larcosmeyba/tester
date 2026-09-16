package serverhttp

// Community resource lookup.
//
// GET /resources/nearby proxies the Google Places API (new) Text Search so
// the app's Resources screen can show real nearby food pantries, shelters,
// clinics and other assistance — never a hardcoded list of places that goes
// stale. The key lives in Secret Manager and reaches the process as
// RESOURCES_PLACES_API_KEY; with it unset the endpoint returns 503 and the
// app renders the lookup as honestly unavailable, exactly like the other
// optional integrations.

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"math"
	"net/http"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5/middleware"
)

// ResourcesDeps is what the nearby-lookup route needs.
type ResourcesDeps struct {
	// APIKey is the Google Places API key. Empty disables the lookup.
	APIKey string
	// BaseURL overrides the Places endpoint; tests point it at a stub.
	BaseURL string
	// Client overrides the default 10s-timeout HTTP client (tests).
	Client *http.Client
	Logger *slog.Logger
}

// Category → Google Places text query. The app sends one of these values;
// absent means "everything". Keep this mapping in one place: it is the
// contract between the mobile category picker and the search terms.
var resourceCategoryQueries = map[string]string{
	"food":       "food pantry",
	"housing":    "homeless shelter",
	"healthcare": "free clinic",
	"utility":    "LIHEAP utility assistance office",
	"job":        "job training center",
}

// Humanized tags for the app's resource cards.
var resourceCategoryTags = map[string]string{
	"food":       "Food Pantry",
	"housing":    "Housing Support",
	"healthcare": "Healthcare",
	"utility":    "Energy Assistance",
	"job":        "Job Training",
}

const (
	resourcesPlacesHost    = "https://places.googleapis.com"
	resourcesDefaultRadius = 25.0
	resourcesMinRadius     = 1.0
	resourcesMaxRadius     = 100.0
	resourcesMetersPerMile = 1609.34
)

var resourceZipPattern = regexp.MustCompile(`^\d{5}$`)

// resourceResult is one place the app can show on the Resources screen.
// DistanceMi is omitted when the request carried no lat/lng to measure from.
type resourceResult struct {
	ID         string   `json:"id"`
	Name       string   `json:"name"`
	Tag        string   `json:"tag"`
	Address    string   `json:"address"`
	Phone      string   `json:"phone,omitempty"`
	Website    string   `json:"website,omitempty"`
	Hours      string   `json:"hours,omitempty"`
	DistanceMi *float64 `json:"distanceMi,omitempty"`
	Latitude   *float64 `json:"latitude,omitempty"`
	Longitude  *float64 `json:"longitude,omitempty"`
}

// ResourcesNearby returns an http.HandlerFunc answering
// GET /resources/nearby?lat=&lng=&radiusMi=&category=, plus the ?zip= and ?q=
// variants on the same path. The route itself is behind the user auth
// middleware in the router.
func ResourcesNearby(deps ResourcesDeps) http.HandlerFunc {
	logger := deps.Logger
	if logger == nil {
		logger = slog.Default()
	}
	baseURL := strings.TrimSuffix(deps.BaseURL, "/")
	if baseURL == "" {
		baseURL = resourcesPlacesHost
	}
	client := deps.Client
	if client == nil {
		client = &http.Client{Timeout: 10 * time.Second}
	}

	return func(w http.ResponseWriter, r *http.Request) {
		if strings.TrimSpace(deps.APIKey) == "" {
			writeJSON(w, http.StatusServiceUnavailable, map[string]string{
				"error":   "resource lookup not configured",
				"message": "Community resource lookup is not configured on the server yet.",
			})
			return
		}

		query := r.URL.Query()

		category := strings.TrimSpace(query.Get("category"))
		categoryQuery, ok := resourceCategoryQueries[category]
		if category != "" && !ok {
			writeError(w, http.StatusBadRequest, "unknown category")
			return
		}
		if category == "" {
			categoryQuery = "community assistance resources"
		}

		zip := strings.TrimSpace(query.Get("zip"))
		if zip != "" && !resourceZipPattern.MatchString(zip) {
			writeError(w, http.StatusBadRequest, "zip must be 5 digits")
			return
		}

		// Both or neither: one without the other is a client bug worth a 400,
		// not a silent half-search.
		latRaw := strings.TrimSpace(query.Get("lat"))
		lngRaw := strings.TrimSpace(query.Get("lng"))
		var lat, lng float64
		hasCoords := latRaw != "" || lngRaw != ""
		if hasCoords {
			var err error
			if lat, err = strconv.ParseFloat(latRaw, 64); err != nil {
				writeError(w, http.StatusBadRequest, "lat must be a number")
				return
			}
			if lng, err = strconv.ParseFloat(lngRaw, 64); err != nil {
				writeError(w, http.StatusBadRequest, "lng must be a number")
				return
			}
			if lat < -90 || lat > 90 {
				writeError(w, http.StatusBadRequest, "lat must be between -90 and 90")
				return
			}
			if lng < -180 || lng > 180 {
				writeError(w, http.StatusBadRequest, "lng must be between -180 and 180")
				return
			}
		}

		radiusMi := resourcesDefaultRadius
		if raw := strings.TrimSpace(query.Get("radiusMi")); raw != "" {
			parsed, err := strconv.ParseFloat(raw, 64)
			if err != nil {
				writeError(w, http.StatusBadRequest, "radiusMi must be a number")
				return
			}
			radiusMi = parsed
		}
		radiusMi = math.Min(math.Max(radiusMi, resourcesMinRadius), resourcesMaxRadius)

		// Query precedence: an explicit ?q= wins; otherwise the ZIP form
		// searches "<category query> near <zip>" with no location bias —
		// geocoding the ZIP ourselves would add a failure mode for no
		// benefit; otherwise the category search, biased by lat/lng.
		searchText := strings.TrimSpace(query.Get("q"))
		if searchText == "" && zip != "" {
			searchText = fmt.Sprintf("%s near %s", categoryQuery, zip)
		}
		if searchText == "" && !hasCoords {
			writeError(w, http.StatusBadRequest, "lat and lng, zip, or q are required")
			return
		}
		if searchText == "" {
			searchText = categoryQuery
		}
		useBias := hasCoords && zip == ""

		searchBody := placesSearchRequest{
			TextQuery:      searchText,
			MaxResultCount: 20,
		}
		if useBias {
			searchBody.LocationBias = &placesCircleBias{
				Circle: placesCircle{
					Center: placesLatLng{Latitude: lat, Longitude: lng},
					Radius: radiusMi * resourcesMetersPerMile,
				},
			}
		}
		encoded, err := json.Marshal(searchBody)
		if err != nil {
			logger.ErrorContext(r.Context(), "places search body encode failed",
				"error", err, "request_id", middleware.GetReqID(r.Context()))
			writeError(w, http.StatusBadGateway, "resource lookup unavailable")
			return
		}

		upstream, err := http.NewRequestWithContext(r.Context(), http.MethodPost,
			baseURL+"/v1/places:searchText", bytes.NewReader(encoded))
		if err != nil {
			logger.ErrorContext(r.Context(), "places search request build failed",
				"error", err, "request_id", middleware.GetReqID(r.Context()))
			writeError(w, http.StatusBadGateway, "resource lookup unavailable")
			return
		}
		upstream.Header.Set("Content-Type", "application/json")
		upstream.Header.Set("X-Goog-Api-Key", deps.APIKey)
		upstream.Header.Set("X-Goog-FieldMask", "places.id,places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.websiteUri,places.regularOpeningHours,places.location,places.primaryType")

		resp, err := client.Do(upstream)
		if err != nil {
			logger.ErrorContext(r.Context(), "places text search failed",
				"error", err, "request_id", middleware.GetReqID(r.Context()))
			writeError(w, http.StatusBadGateway, "resource lookup unavailable")
			return
		}
		defer resp.Body.Close()
		if resp.StatusCode < 200 || resp.StatusCode > 299 {
			logger.ErrorContext(r.Context(), "places text search upstream error",
				"status", resp.StatusCode, "request_id", middleware.GetReqID(r.Context()))
			writeError(w, http.StatusBadGateway, "resource lookup unavailable")
			return
		}

		var searchResp placesSearchResponse
		// Capped: the upstream body is not trusted to bound itself.
		if err := json.NewDecoder(io.LimitReader(resp.Body, 1<<20)).Decode(&searchResp); err != nil {
			logger.ErrorContext(r.Context(), "places text search decode failed",
				"error", err, "request_id", middleware.GetReqID(r.Context()))
			writeError(w, http.StatusBadGateway, "resource lookup unavailable")
			return
		}

		results := make([]resourceResult, 0, len(searchResp.Places))
		for _, place := range searchResp.Places {
			results = append(results, mapResourcePlace(place, category, hasCoords, lat, lng))
		}
		// Nearest first; places we cannot measure (no lat/lng in the request,
		// or no location from Places) sort last.
		sort.SliceStable(results, func(i, j int) bool {
			di, dj := results[i].DistanceMi, results[j].DistanceMi
			if di == nil {
				return false
			}
			if dj == nil {
				return true
			}
			return *di < *dj
		})
		writeJSON(w, http.StatusOK, results)
	}
}

// mapResourcePlace converts one Places result into the app's resource shape.
// No fields are invented: absent phone/website/hours/location are omitted,
// never nulled in or fabricated.
func mapResourcePlace(place placesPlace, category string, hasCoords bool, lat, lng float64) resourceResult {
	tag := resourceCategoryTags[category]
	if tag == "" {
		tag = humanizePrimaryType(place.PrimaryType)
		if tag == "" {
			tag = "Community Resource"
		}
	}
	out := resourceResult{
		ID:      place.ID,
		Name:    place.DisplayName.Text,
		Tag:     tag,
		Address: place.FormattedAddress,
		Phone:   place.NationalPhoneNumber,
		Website: place.WebsiteURI,
		Hours:   summarizeHours(place.RegularOpeningHours.WeekdayDescriptions),
	}
	if place.Location != nil {
		placeLat, placeLng := place.Location.Latitude, place.Location.Longitude
		out.Latitude = &placeLat
		out.Longitude = &placeLng
		if hasCoords {
			distance := roundDistanceMi(haversineMi(lat, lng, placeLat, placeLng))
			out.DistanceMi = &distance
		}
	}
	return out
}

// haversineMi is the great-circle distance in miles between two points.
func haversineMi(lat1, lng1, lat2, lng2 float64) float64 {
	const earthRadiusMi = 3958.8
	toRad := math.Pi / 180
	dLat := (lat2 - lat1) * toRad
	dLng := (lng2 - lng1) * toRad
	a := math.Sin(dLat/2)*math.Sin(dLat/2) +
		math.Cos(lat1*toRad)*math.Cos(lat2*toRad)*math.Sin(dLng/2)*math.Sin(dLng/2)
	return 2 * earthRadiusMi * math.Atan2(math.Sqrt(a), math.Sqrt(1-a))
}

func roundDistanceMi(mi float64) float64 { return math.Round(mi*10) / 10 }

// humanizePrimaryType turns a Places primaryType like "food_bank" into
// "Food Bank" for the card tag when the request carried no category.
func humanizePrimaryType(primaryType string) string {
	words := strings.FieldsFunc(primaryType, func(r rune) bool { return r == '_' || r == '-' })
	if len(words) == 0 {
		return ""
	}
	for i, word := range words {
		words[i] = strings.ToUpper(word[:1]) + word[1:]
	}
	return strings.Join(words, " ")
}

// summarizeHours keeps the opening hours short: the first two weekday
// entries, with "…" when there is more. Empty stays empty (omitted in JSON).
func summarizeHours(descriptions []string) string {
	switch {
	case len(descriptions) == 0:
		return ""
	case len(descriptions) <= 2:
		return strings.Join(descriptions, "; ")
	default:
		return strings.Join(descriptions[:2], "; ") + "; …"
	}
}

// --- Google Places API (new) Text Search shapes -----------------------------

type placesSearchRequest struct {
	TextQuery      string            `json:"textQuery"`
	LocationBias   *placesCircleBias `json:"locationBias,omitempty"`
	MaxResultCount int               `json:"maxResultCount"`
}

type placesCircleBias struct {
	Circle placesCircle `json:"circle"`
}

type placesCircle struct {
	Center placesLatLng `json:"center"`
	Radius float64      `json:"radius"`
}

type placesLatLng struct {
	Latitude  float64 `json:"latitude"`
	Longitude float64 `json:"longitude"`
}

type placesSearchResponse struct {
	Places []placesPlace `json:"places"`
}

type placesPlace struct {
	ID                  string             `json:"id"`
	DisplayName         placesDisplayName  `json:"displayName"`
	FormattedAddress    string             `json:"formattedAddress"`
	NationalPhoneNumber string             `json:"nationalPhoneNumber"`
	WebsiteURI          string             `json:"websiteUri"`
	RegularOpeningHours placesOpeningHours `json:"regularOpeningHours"`
	Location            *placesLatLng      `json:"location"`
	PrimaryType         string             `json:"primaryType"`
}

type placesDisplayName struct {
	Text string `json:"text"`
}

type placesOpeningHours struct {
	WeekdayDescriptions []string `json:"weekdayDescriptions"`
}
