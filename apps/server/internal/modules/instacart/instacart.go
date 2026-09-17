// Package instacart is Help The Hive's Instacart Developer Platform handoff.
//
// The mobile app never touches Instacart directly: it posts a plan id to
// /api/instacart/handoff, this package turns the plan's finished grocery
// list into a products_link call, and the app opens the products_link_url it
// gets back. That URL is an Instacart-hosted landing page where the user
// picks a store, reviews the matched products, and checks out — prices and
// substitutions are decided on Instacart, never here.
//
// Credentials stay server-side. INSTACART_API_KEY is the only required
// setting; INSTACART_BASE_URL defaults to the production Connect host and
// exists so the integration can be exercised against the dev host.
//
// What this package does NOT do, deliberately:
//
//   - It never sees a retailer, a cart, or an order. The products_link API
//     builds a shareable list page, not a checkout session.
//   - It never invents product identifiers. Line items carry the ingredient
//     name and measurements from the grocery list; UPCs are sent only if the
//     data model carries them, and today it does not.
//   - It does not report unmatched items. Matching happens on the landing
//     page, after this call returns, so UnmatchedIngredientIDs is always
//     empty and the app tells the user to review the list on Instacart.
package instacart

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/helpthehive/server/internal/domain/meals"
	"github.com/helpthehive/server/internal/modules/grocery/retailer"
)

// prodHost and devHost are the only Instacart Connect hosts this client will
// talk to. The base URL is operator config, and config that can point an
// Authorization header anywhere is a credential leak waiting for a typo, so
// anything else is refused at construction.
const (
	prodHost = "connect.instacart.com"
	devHost  = "connect.dev.instacart.tools"
)

const defaultBaseURL = "https://" + prodHost

// Config is everything needed to reach the Instacart Developer Platform.
type Config struct {
	// APIKey is the Instacart-issued key, sent as a Bearer token. Empty means
	// the handoff is off: Prepare returns retailer.ErrNotConfigured, which is
	// an ordinary state, not a fault.
	APIKey string
	// BaseURL is the Connect host. Defaults to production.
	BaseURL string
}

// baseURL normalizes the configured host and refuses anything that is not an
// Instacart Connect host.
func (h *Handoff) baseURL() (string, error) {
	raw := strings.TrimSpace(h.cfg.BaseURL)
	if raw == "" {
		raw = defaultBaseURL
	}
	u, err := url.Parse(raw)
	if err != nil {
		return "", fmt.Errorf("instacart: bad base URL: %w", err)
	}
	if h.testHostOK {
		return strings.TrimSuffix(raw, "/"), nil
	}
	if u.Scheme != "https" {
		return "", fmt.Errorf("instacart: base URL must be https")
	}
	switch u.Host {
	case prodHost, devHost:
		return strings.TrimSuffix(raw, "/"), nil
	default:
		return "", fmt.Errorf("instacart: refusing non-Instacart base URL host %q", u.Host)
	}
}

// lineItem is one entry in the products_link request. Field names follow the
// Instacart Developer Platform schema exactly: title and line_items are
// required; quantity and unit directly on a line item are deprecated in
// favour of line_item_measurements.
type lineItem struct {
	Name                 string        `json:"name"`
	DisplayText          string        `json:"display_text,omitempty"`
	UPCs                 []string      `json:"upcs,omitempty"`
	LineItemMeasurements []measurement `json:"line_item_measurements,omitempty"`
}

type measurement struct {
	Quantity float64 `json:"quantity"`
	Unit     string  `json:"unit"`
}

type productsLinkRequest struct {
	Title     string     `json:"title"`
	LinkType  string     `json:"link_type"`
	ExpiresIn int        `json:"expires_in"`
	LineItems []lineItem `json:"line_items"`
}

type productsLinkResponse struct {
	ProductsLinkURL string `json:"products_link_url"`
}

// instacartError is the documented error shape. The message is kept for logs;
// callers see a sanitized sentence.
type instacartError struct {
	Message string `json:"message"`
	Code    string `json:"code"`
}

func (e instacartError) Error() string { return e.Message }

// unitMap translates Help The Hive's canonical units onto the units
// Instacart documents for line-item measurements. Units with no documented
// equivalent are omitted from the line item rather than guessed: an
// unsupported unit makes quantity matching fail, and a name-only line item
// still matches by product name.
var unitMap = map[string]string{
	"oz":      "ounce",
	"tbsp":    "tablespoon",
	"tsp":     "teaspoon",
	"kg":      "kilogram",
	"each":    "each",
	"count":   "each",
	"package": "package",
	"pkg":     "package",
}

// Handoff implements retailer.Handoff for Instacart.
type Handoff struct {
	cfg  Config
	http *http.Client
	log  *slog.Logger
	// testHostOK skips the Connect-host allowlist. Set only by tests pointing
	// at an httptest server; production can never enable it.
	testHostOK bool
}

// Option customizes the handoff. Tests point the transport at an httptest
// server; production never does.
type Option func(*Handoff)

// WithHTTPClient replaces the transport. The base-URL allowlist still
// applies to the configured URL, not the transport.
func WithHTTPClient(hc *http.Client) Option {
	return func(h *Handoff) { h.http = hc }
}

// WithLogger sets the logger.
func WithLogger(l *slog.Logger) Option {
	return func(h *Handoff) { h.log = l }
}

// withTestHost skips the Connect-host allowlist so tests can point the
// handoff at an httptest server. Unexported on purpose: nothing outside this
// package can turn the allowlist off.
func withTestHost() Option {
	return func(h *Handoff) { h.testHostOK = true }
}

// NewHandoff builds the Instacart handoff. It never fails: a missing API key
// is an ordinary unconfigured state, and Prepare reports it as
// retailer.ErrNotConfigured rather than at construction time, so the server
// starts and serves everything else normally.
func NewHandoff(cfg Config, opts ...Option) *Handoff {
	h := &Handoff{
		cfg:  cfg,
		http: &http.Client{Timeout: 15 * time.Second},
		log:  slog.Default(),
	}
	for _, opt := range opts {
		opt(h)
	}
	return h
}

var _ retailer.Handoff = (*Handoff)(nil)

// Name is the retailer's identifier, as it appears in configuration.
func (h *Handoff) Name() string { return "instacart" }

// Prepare turns a consolidated grocery list into an Instacart shopping list
// page. Only items the user still has to buy are sent — the list arrives
// with pantry items already filtered by the grocery service, and this method
// trusts that rather than re-deciding it.
func (h *Handoff) Prepare(ctx context.Context, list meals.GroceryListResult) (retailer.Cart, error) {
	if strings.TrimSpace(h.cfg.APIKey) == "" {
		return retailer.Cart{}, retailer.ErrNotConfigured
	}
	base, err := h.baseURL()
	if err != nil {
		return retailer.Cart{}, err
	}
	items := toLineItems(list)
	if len(items) == 0 {
		return retailer.Cart{}, fmt.Errorf("instacart: nothing left to buy on this list")
	}
	body, err := json.Marshal(productsLinkRequest{
		Title:     "Help The Hive grocery list",
		LinkType:  "shopping_list",
		ExpiresIn: 30,
		LineItems: items,
	})
	if err != nil {
		return retailer.Cart{}, fmt.Errorf("instacart: encode request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, base+"/idp/v1/products/products_link", bytes.NewReader(body))
	if err != nil {
		return retailer.Cart{}, fmt.Errorf("instacart: build request: %w", err)
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+strings.TrimSpace(h.cfg.APIKey))

	resp, err := h.http.Do(req)
	if err != nil {
		return retailer.Cart{}, fmt.Errorf("instacart: request failed: %w", err)
	}
	defer resp.Body.Close()
	payload, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return retailer.Cart{}, fmt.Errorf("instacart: read response: %w", err)
	}
	if resp.StatusCode == http.StatusUnauthorized || resp.StatusCode == http.StatusForbidden {
		h.log.Warn("instacart: credentials rejected", "status", resp.StatusCode)
		return retailer.Cart{}, fmt.Errorf("instacart: API key rejected (status %d)", resp.StatusCode)
	}
	if resp.StatusCode != http.StatusOK {
		h.log.Warn("instacart: products_link failed", "status", resp.StatusCode)
		return retailer.Cart{}, fmt.Errorf("instacart: unexpected status %d: %s", resp.StatusCode, errorMessage(payload))
	}
	var out productsLinkResponse
	if err := json.Unmarshal(payload, &out); err != nil {
		return retailer.Cart{}, fmt.Errorf("instacart: decode response: %w", err)
	}
	if strings.TrimSpace(out.ProductsLinkURL) == "" {
		return retailer.Cart{}, fmt.Errorf("instacart: empty products_link_url in response")
	}
	// Matching happens on the landing page, after this call: there is nothing
	// honest to put in UnmatchedIngredientIDs, so it stays empty and the app
	// tells the user to review the list on Instacart.
	return retailer.Cart{Retailer: "instacart", CheckoutURL: out.ProductsLinkURL}, nil
}

// toLineItems maps the consolidated list onto products_link line items. The
// ingredient's display name is both the search term and the display text; the
// quantity travels in line_item_measurements, the non-deprecated field.
func toLineItems(list meals.GroceryListResult) []lineItem {
	var items []lineItem
	for _, section := range list.Sections {
		for _, item := range section.Items {
			name := strings.TrimSpace(item.DisplayName)
			if name == "" {
				continue
			}
			li := lineItem{Name: name, DisplayText: name}
			if unit, ok := unitMap[strings.ToLower(strings.TrimSpace(item.Unit))]; ok && item.NeededQty > 0 {
				li.LineItemMeasurements = []measurement{{Quantity: item.NeededQty, Unit: unit}}
			}
			items = append(items, li)
		}
	}
	return items
}

// errorMessage pulls the documented message out of an error payload for the
// logs. It never reaches the client.
func errorMessage(payload []byte) string {
	var errs []instacartError
	if err := json.Unmarshal(payload, &errs); err == nil && len(errs) > 0 && errs[0].Message != "" {
		return errs[0].Message
	}
	var single instacartError
	if err := json.Unmarshal(payload, &single); err == nil && single.Message != "" {
		return single.Message
	}
	return "no detail"
}
