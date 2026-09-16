package kroger

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

// krogerServer is an httptest stand-in for api.kroger.com.
type krogerServer struct {
	t            *testing.T
	tokenHits    atomic.Int64
	productHits  atomic.Int64
	locationHits atomic.Int64
	failProducts bool

	tokenAuth string // captured Authorization header on the token endpoint
	srv       *httptest.Server
}

const testProductPayload = `{"data":[{"productId":"011110000000","upc":"011110000000","brand":"Kroger","description":"Kroger Whole Milk, 1 Gal","images":[{"featured":true,"sizes":[{"url":"https://example.com/milk.jpg"}]}],"items":[{"itemId":"1","price":{"regular":4.19,"promo":3.99}}]}]}`
const testLocationPayload = `{"data":[{"locationId":"70600001","chain":"Kroger","name":"Kroger","address":{"city":"Santa Monica","state":"CA","zipCode":"90401"},"geolocation":{"latitude":34.0195,"longitude":-118.4912}}]}`

func newKrogerServer(t *testing.T) *krogerServer {
	s := &krogerServer{t: t}
	s.srv = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch r.URL.Path {
		case "/v1/connect/oauth2/token":
			s.tokenHits.Add(1)
			s.tokenAuth = r.Header.Get("Authorization")
			if r.FormValue("grant_type") != "client_credentials" {
				http.Error(w, "bad grant", http.StatusBadRequest)
				return
			}
			_ = json.NewEncoder(w).Encode(map[string]any{"access_token": "test-token", "expires_in": 1800})
		case "/v1/products":
			s.productHits.Add(1)
			if r.Header.Get("Authorization") != "Bearer test-token" {
				http.Error(w, "bad token", http.StatusUnauthorized)
				return
			}
			if s.failProducts {
				http.Error(w, "boom", http.StatusInternalServerError)
				return
			}
			_, _ = w.Write([]byte(testProductPayload))
		case "/v1/locations":
			s.locationHits.Add(1)
			_, _ = w.Write([]byte(testLocationPayload))
		default:
			http.NotFound(w, r)
		}
	}))
	return s
}

func newTestClient(t *testing.T, srv *krogerServer, opts ...Option) *Client {
	t.Helper()
	base := []Option{
		WithHTTPClient(srv.srv.Client()),
		withClock(time.Now),
		withMinRequestInterval(0),
	}
	c, err := New(Config{ClientID: "id", ClientSecret: "secret", BaseURL: srv.srv.URL}, append(base, opts...)...)
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	return c
}

func TestNewWithoutCredentialsFails(t *testing.T) {
	if _, err := New(Config{}); !errors.Is(err, ErrNotConfigured) {
		t.Fatalf("expected ErrNotConfigured, got %v", err)
	}
	if _, err := New(Config{ClientID: "id"}); !errors.Is(err, ErrNotConfigured) {
		t.Fatalf("half-configured must fail, got %v", err)
	}
}

func TestUnconfigured(t *testing.T) {
	var u Unconfigured
	if u.Available() {
		t.Error("Unconfigured must not report available")
	}
	ctx := context.Background()
	if _, err := u.SearchProducts(ctx, "milk", "x", 5); !errors.Is(err, ErrNotConfigured) {
		t.Errorf("SearchProducts: expected ErrNotConfigured, got %v", err)
	}
	if _, err := u.ProductByUPC(ctx, "123", "x"); !errors.Is(err, ErrNotConfigured) {
		t.Errorf("ProductByUPC: expected ErrNotConfigured, got %v", err)
	}
	if _, err := u.NearbyStores(ctx, "90401", 5); !errors.Is(err, ErrNotConfigured) {
		t.Errorf("NearbyStores: expected ErrNotConfigured, got %v", err)
	}
	// Unconfigured.Quote degrades to the USDA fallback rather than erroring.
	q, err := u.Quote(ctx, QuoteRequest{Term: "whole milk", LocationID: "x"})
	if err != nil {
		t.Fatalf("Unconfigured Quote: %v", err)
	}
	if q.Live || !q.Price.Estimated || q.Price.Label != "Est." {
		t.Errorf("fallback quote must be labeled Est.: %+v", q)
	}
	if _, err := u.Quote(ctx, QuoteRequest{Term: "unobtainium"}); !errors.Is(err, ErrNoPrice) {
		t.Errorf("expected ErrNoPrice for unmatched term, got %v", err)
	}
}

func TestTokenIsCached(t *testing.T) {
	srv := newKrogerServer(t)
	defer srv.srv.Close()
	c := newTestClient(t, srv)
	ctx := context.Background()

	for i := 0; i < 3; i++ {
		if _, err := c.SearchProducts(ctx, "milk", "70600001", 5); err != nil {
			t.Fatalf("SearchProducts: %v", err)
		}
	}
	if got := srv.tokenHits.Load(); got != 1 {
		t.Errorf("expected 1 token request for 3 calls, got %d", got)
	}
	if !strings.HasPrefix(srv.tokenAuth, "Basic ") {
		t.Errorf("token request must use Basic auth, got %q", srv.tokenAuth)
	}
}

func TestTokenRefreshesAfterTTL(t *testing.T) {
	srv := newKrogerServer(t)
	defer srv.srv.Close()

	now := time.Now()
	clock := func() time.Time { return now }
	c := newTestClient(t, srv, withClock(clock), withMinRequestInterval(0))
	c.cfg.TokenTTL = time.Minute
	ctx := context.Background()

	if _, err := c.SearchProducts(ctx, "milk", "70600001", 5); err != nil {
		t.Fatalf("SearchProducts: %v", err)
	}
	now = now.Add(2 * time.Minute) // past the 1-minute TTL
	if _, err := c.SearchProducts(ctx, "milk", "70600001", 5); err != nil {
		t.Fatalf("SearchProducts after TTL: %v", err)
	}
	if got := srv.tokenHits.Load(); got != 2 {
		t.Errorf("expected token refresh after TTL, got %d token requests", got)
	}
}

func TestPriceCacheTTL(t *testing.T) {
	srv := newKrogerServer(t)
	defer srv.srv.Close()

	now := time.Now()
	clock := func() time.Time { return now }
	c := newTestClient(t, srv, withClock(clock), withMinRequestInterval(0))
	c.cfg.PriceTTL = time.Hour
	ctx := context.Background()
	req := QuoteRequest{Term: "milk", LocationID: "70600001"}

	q1, err := c.Quote(ctx, req)
	if err != nil {
		t.Fatalf("Quote: %v", err)
	}
	if !q1.Live || q1.Price.Source != SourceKroger {
		t.Errorf("expected live Kroger quote, got %+v", q1)
	}
	if q1.Price.Cents != 399 { // promo 3.99 beats regular 4.19
		t.Errorf("expected promo price 399 cents, got %d", q1.Price.Cents)
	}

	if _, err := c.Quote(ctx, req); err != nil {
		t.Fatalf("cached Quote: %v", err)
	}
	if got := srv.productHits.Load(); got != 1 {
		t.Errorf("expected 1 products request for 2 quotes, got %d", got)
	}

	now = now.Add(5 * time.Hour) // past the 4-hour default window
	if _, err := c.Quote(ctx, req); err != nil {
		t.Fatalf("Quote after price TTL: %v", err)
	}
	if got := srv.productHits.Load(); got != 2 {
		t.Errorf("expected refetch after price TTL expiry, got %d", got)
	}
}

func TestQuoteFallsBackToUSDA(t *testing.T) {
	srv := newKrogerServer(t)
	defer srv.srv.Close()
	srv.failProducts = true

	c := newTestClient(t, srv)
	ctx := context.Background()

	q, err := c.Quote(ctx, QuoteRequest{Term: "whole milk", LocationID: "70600001"})
	if err != nil {
		t.Fatalf("Quote with failing products endpoint: %v", err)
	}
	if q.Live {
		t.Error("fallback quote must not claim to be live")
	}
	if q.Product != nil {
		t.Error("fallback quote must not name a product")
	}
	p := q.Price
	if !p.Estimated || p.Source != SourceUSDA || p.Label != "Est." {
		t.Errorf("fallback price must be labeled Est.: %+v", p)
	}
	if p.Cents != 420 || p.PerUnit != "gallon" {
		t.Errorf("unexpected USDA milk price: %+v", p)
	}

	// The fallback answer is cached too: one failure, one cached answer.
	if _, err := c.Quote(ctx, QuoteRequest{Term: "whole milk", LocationID: "70600001"}); err != nil {
		t.Fatalf("cached fallback Quote: %v", err)
	}
	if got := srv.productHits.Load(); got != 1 {
		t.Errorf("expected 1 products request for 2 fallback quotes, got %d", got)
	}
}

func TestQuoteNoPriceWhenNothingMatches(t *testing.T) {
	srv := newKrogerServer(t)
	defer srv.srv.Close()
	srv.failProducts = true

	c := newTestClient(t, srv)
	if _, err := c.Quote(context.Background(), QuoteRequest{Term: "unobtainium", LocationID: "x"}); !errors.Is(err, ErrNoPrice) {
		t.Errorf("expected ErrNoPrice, got %v", err)
	}
}

func TestSearchProductsMapping(t *testing.T) {
	srv := newKrogerServer(t)
	defer srv.srv.Close()
	c := newTestClient(t, srv)

	products, err := c.SearchProducts(context.Background(), "milk", "70600001", 5)
	if err != nil {
		t.Fatalf("SearchProducts: %v", err)
	}
	if len(products) != 1 {
		t.Fatalf("expected 1 product, got %d", len(products))
	}
	p := products[0]
	if p.Description != "Kroger Whole Milk, 1 Gal" || p.Brand != "Kroger" || p.UPC != "011110000000" {
		t.Errorf("product fields not mapped: %+v", p)
	}
	if p.ImageURL != "https://example.com/milk.jpg" {
		t.Errorf("image not mapped: %q", p.ImageURL)
	}
}

func TestProductByUPC(t *testing.T) {
	srv := newKrogerServer(t)
	defer srv.srv.Close()
	c := newTestClient(t, srv)

	p, err := c.ProductByUPC(context.Background(), "011110000000", "70600001")
	if err != nil {
		t.Fatalf("ProductByUPC: %v", err)
	}
	if p.ProductID != "011110000000" {
		t.Errorf("wrong product: %+v", p)
	}
}

func TestNearbyStores(t *testing.T) {
	srv := newKrogerServer(t)
	defer srv.srv.Close()
	c := newTestClient(t, srv)

	stores, err := c.NearbyStores(context.Background(), "90401", 5)
	if err != nil {
		t.Fatalf("NearbyStores: %v", err)
	}
	if len(stores) != 1 || stores[0].LocationID != "70600001" || stores[0].Chain != "Kroger" {
		t.Fatalf("unexpected stores: %+v", stores)
	}
	if stores[0].ZipCode != "90401" || stores[0].City != "Santa Monica" {
		t.Errorf("store address not mapped: %+v", stores[0])
	}
}

func TestWirePriceMapping(t *testing.T) {
	if p := wirePriceToPrice(wirePrice{Regular: 4.19, Promo: 3.99}); p.Cents != 399 {
		t.Errorf("promo should win: %+v", p)
	}
	if p := wirePriceToPrice(wirePrice{Regular: 4.19}); p.Cents != 419 {
		t.Errorf("regular should be used when no promo: %+v", p)
	}
	if p := wirePriceToPrice(wirePrice{Regular: 4.19, Promo: 5.00}); p.Cents != 419 {
		t.Errorf("promo above regular should be ignored: %+v", p)
	}
	if p := wirePriceToPrice(wirePrice{Regular: 4.19, Promo: 3.99}); p.Source != SourceKroger {
		t.Errorf("live price source: %+v", p)
	}
}

func TestEstimateUSDA(t *testing.T) {
	p, ok := estimateUSDA("Whole Milk")
	if !ok {
		t.Fatal("milk should match the USDA table")
	}
	if p.Cents != 420 || p.PerUnit != "gallon" || !p.Estimated || p.Label != "Est." || p.Source != SourceUSDA {
		t.Errorf("unexpected USDA price: %+v", p)
	}
	if _, ok := estimateUSDA("unobtainium"); ok {
		t.Error("unknown food must not match")
	}
}

func TestRateGateLimits(t *testing.T) {
	srv := newKrogerServer(t)
	defer srv.srv.Close()
	c := newTestClient(t, srv, withMinRequestInterval(100*time.Millisecond))

	start := time.Now()
	ctx := context.Background()
	for i := 0; i < 3; i++ {
		if _, err := c.SearchProducts(ctx, "milk", "70600001", 5); err != nil {
			t.Fatalf("SearchProducts: %v", err)
		}
	}
	if elapsed := time.Since(start); elapsed < 200*time.Millisecond {
		t.Errorf("3 requests at 1 per 100ms should take >=200ms, took %v", elapsed)
	}
}

func TestConfigFromEnv(t *testing.T) {
	t.Setenv("KROGER_CLIENT_ID", "")
	t.Setenv("KROGER_CLIENT_SECRET", "")
	if cfg := ConfigFromEnv(); cfg.Configured() {
		t.Error("empty credentials must not count as configured")
	}
	t.Setenv("KROGER_CLIENT_ID", "id")
	t.Setenv("KROGER_CLIENT_SECRET", "secret")
	if cfg := ConfigFromEnv(); !cfg.Configured() {
		t.Error("set credentials must count as configured")
	}
}

func TestMockFixture(t *testing.T) {
	m := NewMock()
	ctx := context.Background()
	q, err := m.Quote(ctx, QuoteRequest{Term: "milk", LocationID: "70600001"})
	if err != nil {
		t.Fatalf("mock Quote: %v", err)
	}
	if !q.Live || q.Product == nil {
		t.Errorf("mock quote should be live: %+v", q)
	}
	m.UseFallback = true
	q, err = m.Quote(ctx, QuoteRequest{Term: "eggs", LocationID: "70600001"})
	if err != nil {
		t.Fatalf("mock fallback Quote: %v", err)
	}
	if q.Live || !q.Price.Estimated || q.Price.Label != "Est." {
		t.Errorf("mock fallback quote must be labeled Est.: %+v", q)
	}
}
