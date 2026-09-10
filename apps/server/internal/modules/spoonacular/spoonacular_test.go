package spoonacular

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"
)

func TestToRecipeMapping(t *testing.T) {
	var wire wireRecipe
	err := json.Unmarshal([]byte(`{
		"id": 654959,
		"title": "Pasta With Chicken and Mushrooms",
		"image": "https://img.spoonacular.com/recipes/654959-556x370.jpg",
		"readyInMinutes": 45,
		"servings": 6,
		"pricePerServing": 175.49,
		"dishTypes": ["main course", "dinner"],
		"cuisines": ["italian"],
		"diets": ["dairy free"],
		"extendedIngredients": [
			{"id": 1001, "nameClean": "chicken breast", "amount": 1.5, "unit": "lb", "original": "1.5 lb chicken breast"}
		],
		"instructions": "Cook the pasta.",
		"sourceUrl": "https://spoonacular.com/pasta-with-chicken-and-mushrooms-654959"
	}`), &wire)
	if err != nil {
		t.Fatalf("unmarshal wire payload: %v", err)
	}

	r := wire.toRecipe()
	if r.ID != 654959 || r.Title != "Pasta With Chicken and Mushrooms" {
		t.Errorf("id/title not mapped: %+v", r)
	}
	if r.ImageURL == nil || *r.ImageURL != "https://img.spoonacular.com/recipes/654959-556x370.jpg" {
		t.Errorf("image not mapped: %+v", r.ImageURL)
	}
	if r.ReadyInMinutes == nil || *r.ReadyInMinutes != 45 || r.Servings != 6 {
		t.Errorf("times/servings not mapped: %+v", r)
	}
	if r.PricePerServingUSD == nil || *r.PricePerServingUSD < 1.754 || *r.PricePerServingUSD > 1.756 {
		t.Errorf("pricePerServing 175.49 cents should map to ~1.75 USD, got %+v", r.PricePerServingUSD)
	}
	if len(r.DishTypes) != 2 || r.DishTypes[0] != "main course" {
		t.Errorf("dishTypes not mapped: %v", r.DishTypes)
	}
	if len(r.Cuisines) != 1 || r.Cuisines[0] != "italian" {
		t.Errorf("cuisines not mapped: %v", r.Cuisines)
	}
	if len(r.Diets) != 1 || r.Diets[0] != "dairy free" {
		t.Errorf("diets not mapped: %v", r.Diets)
	}
	if r.Instructions == nil || *r.Instructions != "Cook the pasta." {
		t.Errorf("instructions not mapped: %+v", r.Instructions)
	}
	if r.Provenance != ProvenanceSpoonacular {
		t.Errorf("provenance: got %q", r.Provenance)
	}
	if len(r.ExtendedIngredients) != 1 {
		t.Fatalf("ingredients not mapped: %+v", r.ExtendedIngredients)
	}
	got := r.ExtendedIngredients[0]
	if got.ID != 1001 || got.Original != "1.5 lb chicken breast" ||
		got.NameClean == nil || *got.NameClean != "chicken breast" ||
		got.Amount != 1.5 || got.Unit != "lb" {
		t.Errorf("ingredient fields not mapped: %+v", got)
	}
}

func TestToRecipeCopiesSlices(t *testing.T) {
	wire := wireRecipe{DishTypes: []string{"dinner"}}
	r := wire.toRecipe()
	r.DishTypes[0] = "mutated"
	if wire.DishTypes[0] != "dinner" {
		t.Error("toRecipe aliased the wire slice; mutation leaked back")
	}
}

func TestToRecipeZeroPrice(t *testing.T) {
	r := wireRecipe{PricePerServing: 0}.toRecipe()
	if r.PricePerServingUSD != nil {
		t.Errorf("missing price must map to nil, got %v", *r.PricePerServingUSD)
	}
	r = wireRecipe{}.toRecipe()
	if r.ImageURL != nil || r.ReadyInMinutes != nil || r.Instructions != nil {
		t.Errorf("missing optional fields must map to nil: %+v", r)
	}
}

func TestNewWithoutKeyFails(t *testing.T) {
	if _, err := New(Config{}); !errors.Is(err, ErrNotConfigured) {
		t.Fatalf("expected ErrNotConfigured, got %v", err)
	}
	if _, err := New(Config{APIKey: ""}); !errors.Is(err, ErrNotConfigured) {
		t.Fatalf("expected ErrNotConfigured for empty key, got %v", err)
	}
}

func TestUnconfigured(t *testing.T) {
	var u Unconfigured
	if u.Available() {
		t.Error("Unconfigured must not report available")
	}
	if _, err := u.Search(context.Background(), SearchParams{Query: "pasta"}); !errors.Is(err, ErrNotConfigured) {
		t.Errorf("Search: expected ErrNotConfigured, got %v", err)
	}
	if _, err := u.Detail(context.Background(), 1); !errors.Is(err, ErrNotConfigured) {
		t.Errorf("Detail: expected ErrNotConfigured, got %v", err)
	}
}

// searchServer is an httptest server that counts hits and requires the key.
type searchServer struct {
	t    *testing.T
	hits atomic.Int64
	srv  *httptest.Server
}

func newSearchServer(t *testing.T, payload string) *searchServer {
	s := &searchServer{t: t}
	s.srv = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		s.hits.Add(1)
		if r.URL.Query().Get("apiKey") == "" {
			http.Error(w, "missing apiKey", http.StatusUnauthorized)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(payload))
	}))
	return s
}

const searchPayload = `{"results":[{"id":1,"title":"Pasta","image":"https://img.spoonacular.com/recipes/1-556x370.jpg","readyInMinutes":30,"servings":4,"pricePerServing":120.2,"dishTypes":["dinner"],"extendedIngredients":[]}],"totalResults":1}`
const detailPayload = `{"id":1,"title":"Pasta","image":"https://img.spoonacular.com/recipes/1-556x370.jpg","readyInMinutes":30,"servings":4,"pricePerServing":120.2,"dishTypes":["dinner"],"extendedIngredients":[]}`

func newTestClient(t *testing.T, srv *searchServer, now func() time.Time) *Client {
	t.Helper()
	c, err := New(Config{APIKey: "test-key", BaseURL: srv.srv.URL, CacheTTL: time.Hour}, WithHTTPClient(srv.srv.Client()), withClock(now))
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	return c
}

func TestSearchCachesRepeatedQueries(t *testing.T) {
	srv := newSearchServer(t, searchPayload)
	defer srv.srv.Close()

	c := newTestClient(t, srv, time.Now)
	ctx := context.Background()

	first, err := c.Search(ctx, SearchParams{Query: "pasta"})
	if err != nil {
		t.Fatalf("Search: %v", err)
	}
	if len(first) != 1 || first[0].Title != "Pasta" {
		t.Fatalf("unexpected search result: %+v", first)
	}
	if first[0].PricePerServingUSD == nil || *first[0].PricePerServingUSD < 1.199 || *first[0].PricePerServingUSD > 1.203 {
		t.Errorf("expected ~1.20 USD, got %+v", first[0].PricePerServingUSD)
	}

	// Same query twice more: the server must not see them.
	for i := 0; i < 2; i++ {
		if _, err := c.Search(ctx, SearchParams{Query: "pasta"}); err != nil {
			t.Fatalf("cached Search: %v", err)
		}
	}
	if got := srv.hits.Load(); got != 1 {
		t.Errorf("expected 1 HTTP request for 3 identical searches, got %d", got)
	}

	// A different query is a different cache key.
	if _, err := c.Search(ctx, SearchParams{Query: "tacos"}); err != nil {
		t.Fatalf("Search tacos: %v", err)
	}
	if got := srv.hits.Load(); got != 2 {
		t.Errorf("expected 2 HTTP requests after a new query, got %d", got)
	}
}

func TestSearchCacheExpires(t *testing.T) {
	srv := newSearchServer(t, searchPayload)
	defer srv.srv.Close()

	now := time.Now()
	clock := func() time.Time { return now }
	c := newTestClient(t, srv, clock)
	ctx := context.Background()

	if _, err := c.Search(ctx, SearchParams{Query: "pasta"}); err != nil {
		t.Fatalf("Search: %v", err)
	}
	now = now.Add(2 * time.Hour) // past the 1h TTL
	if _, err := c.Search(ctx, SearchParams{Query: "pasta"}); err != nil {
		t.Fatalf("Search after TTL: %v", err)
	}
	if got := srv.hits.Load(); got != 2 {
		t.Errorf("expected refetch after TTL expiry, got %d requests", got)
	}
}

func TestDetailCaches(t *testing.T) {
	srv := newSearchServer(t, detailPayload)
	defer srv.srv.Close()

	c := newTestClient(t, srv, time.Now)
	ctx := context.Background()

	first, err := c.Detail(ctx, 1)
	if err != nil {
		t.Fatalf("Detail: %v", err)
	}
	if first.ReadyInMinutes == nil || *first.ReadyInMinutes != 30 || first.Servings != 4 {
		t.Errorf("unexpected detail: %+v", first)
	}
	if _, err := c.Detail(ctx, 1); err != nil {
		t.Fatalf("cached Detail: %v", err)
	}
	if got := srv.hits.Load(); got != 1 {
		t.Errorf("expected 1 HTTP request for 2 identical details, got %d", got)
	}
}

func TestSearchSendsKeyAndParams(t *testing.T) {
	var gotQuery, gotType, gotNumber string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		q := r.URL.Query()
		if q.Get("apiKey") != "test-key" {
			http.Error(w, "bad key", http.StatusUnauthorized)
			return
		}
		gotQuery, gotType, gotNumber = q.Get("query"), q.Get("type"), q.Get("number")
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(searchPayload))
	}))
	defer srv.Close()

	c, err := New(Config{APIKey: "test-key", BaseURL: srv.URL}, WithHTTPClient(srv.Client()))
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	if _, err := c.Search(context.Background(), SearchParams{Query: "pasta", Type: "main course", MaxResult: 5}); err != nil {
		t.Fatalf("Search: %v", err)
	}
	if gotQuery != "pasta" || gotType != "main course" || gotNumber != "5" {
		t.Errorf("params not forwarded: query=%q type=%q number=%q", gotQuery, gotType, gotNumber)
	}
}

func TestMockFixture(t *testing.T) {
	m := NewMock()
	if !m.Available() {
		t.Error("mock must report available")
	}
	ctx := context.Background()
	recipes, err := m.Search(ctx, SearchParams{Query: "anything"})
	if err != nil {
		t.Fatalf("mock Search: %v", err)
	}
	if len(recipes) == 0 {
		t.Fatal("mock must return fixtures")
	}
	for _, r := range recipes {
		if r.ImageURL == nil || *r.ImageURL == "" {
			t.Errorf("fixture %q has no image URL", r.Title)
		}
		if r.Provenance != ProvenanceMock {
			t.Errorf("fixture %q provenance: got %q", r.Title, r.Provenance)
		}
	}
	one, err := m.Detail(ctx, recipes[0].ID)
	if err != nil {
		t.Fatalf("mock Detail: %v", err)
	}
	if one.Title != recipes[0].Title {
		t.Errorf("mock Detail returned %q, want %q", one.Title, recipes[0].Title)
	}
	if _, err := m.Detail(ctx, 999999); !errors.Is(err, ErrNotFound) {
		t.Errorf("expected ErrNotFound for unknown id, got %v", err)
	}
}

func TestConfigFromEnv(t *testing.T) {
	t.Setenv("SPOONACULAR_API_KEY", "")
	if cfg := ConfigFromEnv(); cfg.Configured() {
		t.Error("empty key must not count as configured")
	}
	t.Setenv("SPOONACULAR_API_KEY", "k")
	if cfg := ConfigFromEnv(); !cfg.Configured() {
		t.Error("set key must count as configured")
	}
}
