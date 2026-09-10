package spoonacular

import (
	"context"
	"encoding/json"
	"errors"
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

// Config is everything needed to reach Spoonacular.
//
// APIKey is a server secret. Read it from SPOONACULAR_API_KEY and never
// expose it via an EXPO_PUBLIC_* variable: anyone who installs the mobile app
// can read that bundle.
type Config struct {
	APIKey string
	// BaseURL is https://api.spoonacular.com in production and a test
	// server's address in tests.
	BaseURL string
	// CacheTTL bounds how long search results and recipe details are kept in
	// the in-memory cache. Spoonacular's free tier counts calls per day, so
	// repeated views of the same recipe must not cost a call each.
	CacheTTL time.Duration
}

const (
	defaultBaseURL = "https://api.spoonacular.com"
	defaultTTL     = 6 * time.Hour
)

// ConfigFromEnv reads the Spoonacular settings from the server environment.
func ConfigFromEnv() Config {
	return Config{
		APIKey:   strings.TrimSpace(os.Getenv("SPOONACULAR_API_KEY")),
		BaseURL:  defaultBaseURL,
		CacheTTL: defaultTTL,
	}
}

// Configured reports whether Spoonacular calls are switched on. It is
// optional: with no key the server runs exactly as it does today, and the
// recipe views report the integration as unavailable rather than failing.
func (c Config) Configured() bool { return c.APIKey != "" }

func (c Config) withDefaults() Config {
	if c.BaseURL == "" {
		c.BaseURL = defaultBaseURL
	}
	if c.CacheTTL <= 0 {
		c.CacheTTL = defaultTTL
	}
	return c
}

// Recipes is what the rest of the server needs from Spoonacular. An
// interface so recipe views can be tested without a network, and so a
// deployment with no key configured degrades to a stated fallback rather
// than a panic.
type Recipes interface {
	Available() bool
	// Search finds recipes by free text. The returned Recipes carry image
	// URLs; call Detail for full data including price per serving.
	Search(ctx context.Context, params SearchParams) ([]Recipe, error)
	// Detail returns one recipe: images, times, servings, price per
	// serving and ingredients.
	Detail(ctx context.Context, id int) (Recipe, error)
}

// Unconfigured is the default. Help The Hive runs with no Spoonacular key:
// the recipe database answers from its own library and says the enrichment
// is unavailable, and nothing else changes.
type Unconfigured struct{}

func (Unconfigured) Available() bool { return false }

func (Unconfigured) Search(context.Context, SearchParams) ([]Recipe, error) {
	return nil, ErrNotConfigured
}

func (Unconfigured) Detail(context.Context, int) (Recipe, error) {
	return Recipe{}, ErrNotConfigured
}

// Client is the HTTP implementation of Recipes.
type Client struct {
	cfg  Config
	http *http.Client
	log  *slog.Logger
	now  func() time.Time

	mu     sync.Mutex
	search map[string]cacheEntry[[]Recipe]
	detail map[string]cacheEntry[Recipe]
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

// withClock makes the TTL cache testable.
func withClock(fn func() time.Time) Option {
	return func(c *Client) { c.now = fn }
}

// New builds a Spoonacular client. Without an API key it returns
// ErrNotConfigured: constructing the client is where the decision happens,
// not at some later call where the absence would be a surprise.
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
		search: map[string]cacheEntry[[]Recipe]{},
		detail: map[string]cacheEntry[Recipe]{},
	}
	for _, opt := range opts {
		opt(c)
	}
	return c, nil
}

func (c *Client) Available() bool { return true }

// Search finds recipes matching params.Query. Results are cached in memory
// for Config.CacheTTL keyed on the query parameters.
func (c *Client) Search(ctx context.Context, params SearchParams) ([]Recipe, error) {
	key := searchCacheKey(params)
	if cached, ok := c.getSearch(key); ok {
		return cached, nil
	}

	query := url.Values{}
	query.Set("query", params.Query)
	if params.Type != "" {
		query.Set("type", params.Type)
	}
	if params.Diet != "" {
		query.Set("diet", params.Diet)
	}
	limit := params.MaxResult
	if limit <= 0 {
		limit = 10
	}
	query.Set("number", strconv.Itoa(limit))
	// Images and times come back in the search payload, so one call serves
	// the database grid without a follow-up per recipe.
	query.Set("addRecipeInformation", "true")

	var payload wireSearchResponse
	if err := c.get(ctx, "/recipes/complexSearch", query, &payload); err != nil {
		return nil, err
	}

	out := make([]Recipe, 0, len(payload.Results))
	for _, r := range payload.Results {
		out = append(out, r.toRecipe())
	}
	c.putSearch(key, out)
	return out, nil
}

// Detail returns the full recipe for id, cached for Config.CacheTTL.
func (c *Client) Detail(ctx context.Context, id int) (Recipe, error) {
	key := strconv.Itoa(id)
	if cached, ok := c.getDetail(key); ok {
		return cached, nil
	}

	query := url.Values{}
	query.Set("includeNutrition", "false")

	var payload wireRecipe
	if err := c.get(ctx, "/recipes/"+strconv.Itoa(id)+"/information", query, &payload); err != nil {
		return Recipe{}, err
	}
	recipe := payload.toRecipe()
	c.putDetail(key, recipe)
	return recipe, nil
}

// get performs one authenticated Spoonacular request. The key travels in the
// apiKey query parameter because Spoonacular documents key-in-query as its
// primary authentication; it never appears in a response body or an error
// message we return.
func (c *Client) get(ctx context.Context, path string, query url.Values, out any) error {
	query.Set("apiKey", c.cfg.APIKey)
	reqURL := c.cfg.BaseURL + path + "?" + query.Encode()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, reqURL, nil)
	if err != nil {
		return fmt.Errorf("spoonacular: build request: %w", err)
	}

	resp, err := c.http.Do(req)
	if err != nil {
		return fmt.Errorf("spoonacular: request failed: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(io.LimitReader(resp.Body, 4<<20))
	if err != nil {
		return fmt.Errorf("spoonacular: read response: %w", err)
	}

	if resp.StatusCode == http.StatusTooManyRequests {
		return errors.New("spoonacular: daily quota exhausted")
	}
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("spoonacular: unexpected status %d", resp.StatusCode)
	}

	if err := json.Unmarshal(body, out); err != nil {
		return fmt.Errorf("spoonacular: decode response: %w", err)
	}
	return nil
}

func searchCacheKey(params SearchParams) string {
	return strings.Join([]string{
		strings.ToLower(strings.TrimSpace(params.Query)),
		strings.ToLower(params.Type),
		strings.ToLower(params.Diet),
		strconv.Itoa(params.MaxResult),
	}, "|")
}

func (c *Client) getSearch(key string) ([]Recipe, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	e, ok := c.search[key]
	if !ok || !c.now().Before(e.expires) {
		delete(c.search, key)
		return nil, false
	}
	return e.value, true
}

func (c *Client) putSearch(key string, v []Recipe) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.search[key] = cacheEntry[[]Recipe]{value: v, expires: c.now().Add(c.cfg.CacheTTL)}
}

func (c *Client) getDetail(key string) (Recipe, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	e, ok := c.detail[key]
	if !ok || !c.now().Before(e.expires) {
		delete(c.detail, key)
		return Recipe{}, false
	}
	return e.value, true
}

func (c *Client) putDetail(key string, v Recipe) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.detail[key] = cacheEntry[Recipe]{value: v, expires: c.now().Add(c.cfg.CacheTTL)}
}
