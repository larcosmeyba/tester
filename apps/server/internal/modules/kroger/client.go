package kroger

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"
)

// Config is everything needed to reach the Kroger public API.
//
// ClientID and ClientSecret are server secrets for the Help The Hive
// developer app (developer.kroger.com). They come from the server
// environment only — never expose them via an EXPO_PUBLIC_* variable, which
// would put them in the mobile bundle that anyone who installs the app can
// read.
type Config struct {
	ClientID     string
	ClientSecret string
	// BaseURL is https://api.kroger.com in production and a test server's
	// address in tests.
	BaseURL string
	// TokenTTL bounds the OAuth token cache. Kroger tokens live ~30 minutes;
	// the default stays a couple of minutes under that.
	TokenTTL time.Duration
	// PriceTTL bounds the store-price cache. Prices move slowly; 4 hours
	// keeps the quota spend sane.
	PriceTTL time.Duration
	// MinRequestInterval is the rate gate. The free developer tier allows
	// 10,000 calls/day; 1/second is deliberately far inside that.
	MinRequestInterval time.Duration
}

const (
	defaultBaseURL        = "https://api.kroger.com"
	defaultTokenTTL       = 28 * time.Minute
	defaultPriceTTL       = 4 * time.Hour
	defaultMinReqInterval = time.Second
)

// ConfigFromEnv reads the Kroger settings from the server environment. The
// credentials are stubbed until the Help The Hive developer app is approved
// (~1–2 weeks); until then nothing here makes a network call.
func ConfigFromEnv() Config {
	return Config{
		ClientID:           strings.TrimSpace(os.Getenv("KROGER_CLIENT_ID")),
		ClientSecret:       strings.TrimSpace(os.Getenv("KROGER_CLIENT_SECRET")),
		BaseURL:            defaultBaseURL,
		TokenTTL:           defaultTokenTTL,
		PriceTTL:           defaultPriceTTL,
		MinRequestInterval: defaultMinReqInterval,
	}
}

// Configured reports whether live Kroger pricing is switched on. It is
// optional: without credentials the server prices from USDA averages and
// labels them "Est.", exactly as it does today.
func (c Config) Configured() bool { return c.ClientID != "" && c.ClientSecret != "" }

func (c Config) withDefaults() Config {
	if c.BaseURL == "" {
		c.BaseURL = defaultBaseURL
	}
	if c.TokenTTL <= 0 {
		c.TokenTTL = defaultTokenTTL
	}
	if c.PriceTTL <= 0 {
		c.PriceTTL = defaultPriceTTL
	}
	if c.MinRequestInterval < 0 {
		c.MinRequestInterval = defaultMinReqInterval
	}
	return c
}

// Provider is what the rest of the server needs from Kroger. An interface so
// grocery pricing can be tested without a network, and so a deployment with
// no credentials degrades to the USDA fallback rather than a panic.
type Provider interface {
	Available() bool
	// SearchProducts searches the catalog by free text, priced for
	// locationID (a Kroger locationId; empty means national catalog data,
	// which may not include prices).
	SearchProducts(ctx context.Context, term, locationID string, limit int) ([]Product, error)
	// ProductByUPC fetches one product by its UPC, priced for locationID.
	ProductByUPC(ctx context.Context, upc, locationID string) (Product, error)
	// NearbyStores resolves a zip code to Kroger-family stores, so the phone
	// location picks the store — users never need Kroger accounts.
	NearbyStores(ctx context.Context, zip string, limit int) ([]Store, error)
	// Quote returns the price of one term at one store: live when Kroger
	// answers, a labeled USDA estimate when it does not.
	Quote(ctx context.Context, req QuoteRequest) (Quote, error)
}

// QuoteRequest is one price lookup.
type QuoteRequest struct {
	Term       string
	UPC        string
	LocationID string
}

// Unconfigured is the default. Help The Hive prices from USDA averages with
// no credentials: every Quote reports the fallback rather than an error, and
// nothing else in the product changes.
type Unconfigured struct{}

func (Unconfigured) Available() bool { return false }

func (Unconfigured) SearchProducts(context.Context, string, string, int) ([]Product, error) {
	return nil, ErrNotConfigured
}

func (Unconfigured) ProductByUPC(context.Context, string, string) (Product, error) {
	return Product{}, ErrNotConfigured
}

func (Unconfigured) NearbyStores(context.Context, string, int) ([]Store, error) {
	return nil, ErrNotConfigured
}

func (Unconfigured) Quote(_ context.Context, req QuoteRequest) (Quote, error) {
	price, ok := estimateUSDA(req.Term)
	if !ok {
		return Quote{}, ErrNoPrice
	}
	return Quote{LocationID: req.LocationID, Term: req.Term, Price: price, Live: false}, nil
}

// Client is the HTTP implementation of Provider.
type Client struct {
	cfg  Config
	http *http.Client
	log  *slog.Logger
	now  func() time.Time

	mu       sync.Mutex
	token    string
	tokenExp time.Time
	prices   map[string]cacheEntry[Quote]
	lastReq  time.Time
	gateInit bool
}

type cacheEntry[T any] struct {
	value   T
	expires time.Time
}

type Option func(*Client)

// WithHTTPClient replaces the transport. Tests point it at an httptest
// server.
func WithHTTPClient(hc *http.Client) Option {
	return func(c *Client) { c.http = hc }
}

func WithLogger(l *slog.Logger) Option {
	return func(c *Client) { c.log = l }
}

// withClock makes the TTL caches testable.
func withClock(fn func() time.Time) Option {
	return func(c *Client) { c.now = fn }
}

// withMinRequestInterval shrinks the rate gate for tests.
func withMinRequestInterval(d time.Duration) Option {
	return func(c *Client) { c.cfg.MinRequestInterval = d }
}

// New builds a Kroger client. Without client credentials it returns
// ErrNotConfigured: the decision is made here, not at some later call where
// the absence would be a surprise.
func New(cfg Config, opts ...Option) (*Client, error) {
	if !cfg.Configured() {
		return nil, ErrNotConfigured
	}
	cfg = cfg.withDefaults()
	c := &Client{
		cfg:    cfg,
		http:   &http.Client{Timeout: 15 * time.Second},
		log:    slog.Default(),
		now:    time.Now,
		prices: map[string]cacheEntry[Quote]{},
	}
	for _, opt := range opts {
		opt(c)
	}
	return c, nil
}

func (c *Client) Available() bool { return true }

// token fetches an OAuth2 client-credentials token and caches it for
// Config.TokenTTL. Client credentials is app-level: it authorizes Help The
// Hive's app, never a user, which is why users do not need Kroger accounts.
func (c *Client) accessToken(ctx context.Context) (string, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.token != "" && c.now().Before(c.tokenExp) {
		return c.token, nil
	}

	form := url.Values{}
	form.Set("grant_type", "client_credentials")
	form.Set("scope", "product.compact")

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.cfg.BaseURL+"/v1/connect/oauth2/token", strings.NewReader(form.Encode()))
	if err != nil {
		return "", fmt.Errorf("kroger: build token request: %w", err)
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	// Basic auth, not the body: the secret never lands in a form field a
	// proxy might log as a parameter.
	req.SetBasicAuth(c.cfg.ClientID, c.cfg.ClientSecret)

	resp, err := c.http.Do(req)
	if err != nil {
		return "", fmt.Errorf("kroger: token request failed: %w", err)
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return "", fmt.Errorf("kroger: read token response: %w", err)
	}
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("kroger: token request returned status %d", resp.StatusCode)
	}
	var payload wireToken
	if err := json.Unmarshal(body, &payload); err != nil {
		return "", fmt.Errorf("kroger: decode token response: %w", err)
	}
	if payload.AccessToken == "" {
		return "", fmt.Errorf("kroger: token response had no access token")
	}

	ttl := c.cfg.TokenTTL
	if payload.ExpiresIn > 0 {
		// Stay a margin under the provider's lifetime so we never hand out a
		// token that dies mid-request.
		if providerTTL := time.Duration(payload.ExpiresIn-120) * time.Second; providerTTL < ttl {
			ttl = providerTTL
		}
	}
	if ttl < time.Minute {
		ttl = time.Minute
	}
	c.token = payload.AccessToken
	c.tokenExp = c.now().Add(ttl)
	return c.token, nil
}

// waitRateGate enforces at most one Kroger request per MinRequestInterval.
// It is deliberately conservative: the free tier's 10,000 calls/day is a
// daily budget, and a burst of retries on a bad day should not spend it.
func (c *Client) waitRateGate(ctx context.Context) error {
	c.mu.Lock()
	if !c.gateInit {
		c.gateInit = true
		c.lastReq = c.now().Add(-c.cfg.MinRequestInterval)
	}
	since := c.now().Sub(c.lastReq)
	need := c.cfg.MinRequestInterval - since
	c.mu.Unlock()

	if need <= 0 {
		return nil
	}
	timer := time.NewTimer(need)
	defer timer.Stop()
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-timer.C:
		return nil
	}
}

// markRequest records a completed request for the rate gate.
func (c *Client) markRequest() {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.lastReq = c.now()
}

// callGET performs one authenticated, rate-limited GET against the Kroger
// API. The bearer token is the app's own; error bodies are never returned
// to callers because they may carry request echoes.
func (c *Client) callGET(ctx context.Context, path string, query url.Values, out any) error {
	if err := c.waitRateGate(ctx); err != nil {
		return err
	}
	defer c.markRequest()

	tok, err := c.accessToken(ctx)
	if err != nil {
		return err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.cfg.BaseURL+path+"?"+query.Encode(), nil)
	if err != nil {
		return fmt.Errorf("kroger: build request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+tok)
	req.Header.Set("Accept", "application/json")

	resp, err := c.http.Do(req)
	if err != nil {
		return fmt.Errorf("kroger: request failed: %w", err)
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(io.LimitReader(resp.Body, 4<<20))
	if err != nil {
		return fmt.Errorf("kroger: read response: %w", err)
	}
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("kroger: unexpected status %d", resp.StatusCode)
	}
	if err := json.Unmarshal(body, out); err != nil {
		return fmt.Errorf("kroger: decode response: %w", err)
	}
	return nil
}

func (c *Client) SearchProducts(ctx context.Context, term, locationID string, limit int) ([]Product, error) {
	if limit <= 0 {
		limit = 10
	}
	query := url.Values{}
	query.Set("filter.term", term)
	if locationID != "" {
		query.Set("filter.locationId", locationID)
	}
	query.Set("filter.limit", strconv.Itoa(limit))

	var payload wireProductsResponse
	if err := c.callGET(ctx, "/v1/products", query, &payload); err != nil {
		return nil, err
	}
	out := make([]Product, 0, len(payload.Data))
	for _, wp := range payload.Data {
		out = append(out, wp.toProduct())
	}
	return out, nil
}

func (c *Client) ProductByUPC(ctx context.Context, upc, locationID string) (Product, error) {
	query := url.Values{}
	query.Set("filter.productId", upc)
	if locationID != "" {
		query.Set("filter.locationId", locationID)
	}
	query.Set("filter.limit", "1")

	var payload wireProductsResponse
	if err := c.callGET(ctx, "/v1/products", query, &payload); err != nil {
		return Product{}, err
	}
	if len(payload.Data) == 0 {
		return Product{}, fmt.Errorf("kroger: no product for upc %s", upc)
	}
	return payload.Data[0].toProduct(), nil
}

func (c *Client) NearbyStores(ctx context.Context, zip string, limit int) ([]Store, error) {
	if limit <= 0 {
		limit = 10
	}
	query := url.Values{}
	query.Set("filter.zipCode.near", zip)
	query.Set("filter.limit", strconv.Itoa(limit))

	var payload wireLocationsResponse
	if err := c.callGET(ctx, "/v1/locations", query, &payload); err != nil {
		return nil, err
	}
	out := make([]Store, 0, len(payload.Data))
	for _, wl := range payload.Data {
		out = append(out, wl.toStore())
	}
	return out, nil
}

// Quote returns the live price when Kroger answers and the call succeeds,
// otherwise a USDA average labeled "Est.". The fallback is the ordinary
// path, not an error: an unavailable integration must degrade the number,
// not the feature. The 4-hour price cache covers both paths — a fallback
// answer is also worth reusing.
func (c *Client) Quote(ctx context.Context, req QuoteRequest) (Quote, error) {
	key := strings.Join([]string{req.LocationID, strings.ToLower(strings.TrimSpace(req.Term)), req.UPC}, "|")
	if cached, ok := c.getQuote(key); ok {
		return cached, nil
	}

	quote, err := c.liveQuote(ctx, req)
	if err != nil {
		c.log.Warn("kroger live pricing unavailable, using USDA estimate", "term", req.Term, "err", err)
		price, ok := estimateUSDA(req.Term)
		if !ok {
			return Quote{}, ErrNoPrice
		}
		quote = Quote{LocationID: req.LocationID, Term: req.Term, Price: price, Live: false}
	}
	c.putQuote(key, quote)
	return quote, nil
}

func (c *Client) liveQuote(ctx context.Context, req QuoteRequest) (Quote, error) {
	var products []Product
	var err error
	if req.UPC != "" {
		var p Product
		p, err = c.ProductByUPC(ctx, req.UPC, req.LocationID)
		if err == nil {
			products = []Product{p}
		}
	} else {
		products, err = c.SearchProducts(ctx, req.Term, req.LocationID, 1)
	}
	if err != nil {
		return Quote{}, err
	}
	if len(products) == 0 {
		return Quote{}, fmt.Errorf("kroger: no products matched %q", req.Term)
	}
	p := products[0]
	if p.Price.Cents <= 0 {
		return Quote{}, fmt.Errorf("kroger: product %s has no store price", p.ProductID)
	}
	return Quote{LocationID: req.LocationID, Term: req.Term, Product: &p, Price: p.Price, Live: true}, nil
}

func (c *Client) getQuote(key string) (Quote, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	e, ok := c.prices[key]
	if !ok || !c.now().Before(e.expires) {
		delete(c.prices, key)
		return Quote{}, false
	}
	return e.value, true
}

func (c *Client) putQuote(key string, v Quote) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.prices[key] = cacheEntry[Quote]{value: v, expires: c.now().Add(c.cfg.PriceTTL)}
}
