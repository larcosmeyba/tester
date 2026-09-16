package instacart

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/helpthehive/server/internal/domain/meals"
	"github.com/helpthehive/server/internal/modules/grocery/retailer"
)

// instacartServer is an httptest stand-in for the Instacart Connect host. It
// records the request it received so tests can assert on the wire shape.
type instacartServer struct {
	t        *testing.T
	server   *httptest.Server
	key      string
	status   int
	response string

	gotAuth  string
	gotBody  productsLinkRequest
	gotPath  string
	gotCalls int
}

func newInstacartServer(t *testing.T, key string) *instacartServer {
	t.Helper()
	s := &instacartServer{t: t, key: key, status: http.StatusOK, response: `{"products_link_url":"https://www.instacart.com/list/abc"}`}
	s.server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		s.gotCalls++
		s.gotPath = r.URL.Path
		s.gotAuth = r.Header.Get("Authorization")
		body, _ := io.ReadAll(r.Body)
		_ = json.Unmarshal(body, &s.gotBody)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(s.status)
		_, _ = w.Write([]byte(s.response))
	}))
	t.Cleanup(s.server.Close)
	return s
}

func handoffFor(t *testing.T, s *instacartServer, key string) *Handoff {
	t.Helper()
	return NewHandoff(Config{APIKey: key, BaseURL: s.server.URL}, WithHTTPClient(s.server.Client()), withTestHost())
}

func sampleList() meals.GroceryListResult {
	return meals.GroceryListResult{
		Sections: []meals.GrocerySection{
			{Aisle: "produce", Items: []meals.GroceryItem{
				{IngredientID: "onion_yellow", DisplayName: "Yellow Onions", NeededQty: 2, Unit: "each"},
				{IngredientID: "flour", DisplayName: "All-Purpose Flour", NeededQty: 16, Unit: "oz"},
				{IngredientID: "milk", DisplayName: "Whole Milk", NeededQty: 1, Unit: "gallon"},
			}},
		},
	}
}

func TestPrepareSuccess(t *testing.T) {
	srv := newInstacartServer(t, "test-key")
	h := handoffFor(t, srv, "test-key")

	cart, err := h.Prepare(context.Background(), sampleList())
	if err != nil {
		t.Fatalf("Prepare() error = %v", err)
	}
	if cart.Retailer != "instacart" {
		t.Fatalf("Retailer = %q, want instacart", cart.Retailer)
	}
	if cart.CheckoutURL != "https://www.instacart.com/list/abc" {
		t.Fatalf("CheckoutURL = %q", cart.CheckoutURL)
	}
	if len(cart.UnmatchedIngredientIDs) != 0 {
		t.Fatalf("UnmatchedIngredientIDs = %v, want empty (matching happens on Instacart)", cart.UnmatchedIngredientIDs)
	}

	if srv.gotPath != "/idp/v1/products/products_link" {
		t.Fatalf("path = %q", srv.gotPath)
	}
	if srv.gotAuth != "Bearer test-key" {
		t.Fatalf("Authorization = %q, want Bearer test-key", srv.gotAuth)
	}
	body := srv.gotBody
	if body.Title == "" || body.LinkType != "shopping_list" {
		t.Fatalf("request = %+v", body)
	}
	if len(body.LineItems) != 3 {
		t.Fatalf("line items = %d, want 3", len(body.LineItems))
	}
	// "each" and "oz" are mapped; "gallon" has no documented equivalent and
	// is sent name-only rather than guessed.
	for _, li := range body.LineItems {
		switch li.Name {
		case "Yellow Onions":
			if len(li.LineItemMeasurements) != 1 || li.LineItemMeasurements[0].Unit != "each" || li.LineItemMeasurements[0].Quantity != 2 {
				t.Fatalf("onion measurements = %+v", li.LineItemMeasurements)
			}
		case "All-Purpose Flour":
			if len(li.LineItemMeasurements) != 1 || li.LineItemMeasurements[0].Unit != "ounce" || li.LineItemMeasurements[0].Quantity != 16 {
				t.Fatalf("flour measurements = %+v", li.LineItemMeasurements)
			}
		case "Whole Milk":
			if len(li.LineItemMeasurements) != 0 {
				t.Fatalf("milk measurements = %+v, want none (unsupported unit)", li.LineItemMeasurements)
			}
		}
		if li.DisplayText != li.Name {
			t.Fatalf("display_text = %q, want the display name", li.DisplayText)
		}
	}
}

func TestPrepareNotConfigured(t *testing.T) {
	srv := newInstacartServer(t, "test-key")
	h := handoffFor(t, srv, "")

	_, err := h.Prepare(context.Background(), sampleList())
	if !errors.Is(err, retailer.ErrNotConfigured) {
		t.Fatalf("err = %v, want retailer.ErrNotConfigured", err)
	}
	if srv.gotCalls != 0 {
		t.Fatalf("made %d calls with no API key", srv.gotCalls)
	}
}

func TestPrepareAuthRejected(t *testing.T) {
	srv := newInstacartServer(t, "test-key")
	srv.status = http.StatusUnauthorized
	srv.response = `{"message":"invalid key"}`
	h := handoffFor(t, srv, "wrong-key")

	_, err := h.Prepare(context.Background(), sampleList())
	if err == nil || !strings.Contains(err.Error(), "rejected") {
		t.Fatalf("err = %v, want a credentials-rejected error", err)
	}
}

func TestPrepareEmptyList(t *testing.T) {
	srv := newInstacartServer(t, "test-key")
	h := handoffFor(t, srv, "test-key")

	_, err := h.Prepare(context.Background(), meals.GroceryListResult{})
	if err == nil {
		t.Fatal("expected an error for an empty list")
	}
	if srv.gotCalls != 0 {
		t.Fatalf("made %d calls for an empty list", srv.gotCalls)
	}
}

func TestBaseURLAllowlist(t *testing.T) {
	for _, raw := range []string{"https://evil.example.com", "http://connect.instacart.com"} {
		h := NewHandoff(Config{APIKey: "k", BaseURL: raw})
		if _, err := h.baseURL(); err == nil {
			t.Fatalf("baseURL(%q) accepted, want refusal", raw)
		}
	}
	for _, raw := range []string{"", "https://connect.instacart.com", "https://connect.dev.instacart.tools"} {
		h := NewHandoff(Config{APIKey: "k", BaseURL: raw})
		if _, err := h.baseURL(); err != nil {
			t.Fatalf("baseURL(%q) error = %v, want accepted", raw, err)
		}
	}
	// The test-only escape hatch accepts the httptest host.
	srv := newInstacartServer(t, "k")
	h := handoffFor(t, srv, "k")
	if _, err := h.baseURL(); err != nil {
		t.Fatalf("test host baseURL error = %v", err)
	}
}

func TestName(t *testing.T) {
	if got := NewHandoff(Config{}).Name(); got != "instacart" {
		t.Fatalf("Name() = %q", got)
	}
}
