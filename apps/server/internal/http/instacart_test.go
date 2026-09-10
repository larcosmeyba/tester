package serverhttp

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/helpthehive/server/internal/auth"
	domainmeals "github.com/helpthehive/server/internal/domain/meals"
	"github.com/helpthehive/server/internal/modules/grocery/retailer"
)

type stubGrocer struct {
	cart retailer.Cart
	err  error
}

func (s stubGrocer) PrepareRetailerCart(context.Context, auth.Identity, string) (retailer.Cart, error) {
	return s.cart, s.err
}

func instacartTestRouter(t *testing.T, deps InstacartDeps) http.Handler {
	t.Helper()
	r := chi.NewRouter()
	// The auth middleware is bypassed the way the other route tests do it:
	// requireIdentity reads the identity the middleware would have set, so
	// these tests exercise the handler logic, not the token verification.
	r.Route("/api/instacart", InstacartRoutes(deps))
	return r
}

func postJSON(t *testing.T, handler http.Handler, path, body string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(http.MethodPost, path, strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	// requireIdentity needs an identity in the context; the auth middleware
	// normally sets it. Seed it directly like the middleware would.
	ctx := auth.ContextWithIdentity(req.Context(), auth.Identity{Subject: "user_1"})
	req = req.WithContext(ctx)
	resp := httptest.NewRecorder()
	handler.ServeHTTP(resp, req)
	return resp
}

func TestInstacartHandoffSuccess(t *testing.T) {
	deps := InstacartDeps{Grocery: stubGrocer{cart: retailer.Cart{
		Retailer:    "instacart",
		CheckoutURL: "https://www.instacart.com/list/abc",
	}}}
	resp := postJSON(t, instacartTestRouter(t, deps), "/api/instacart/handoff", `{"plan_id":"plan_1"}`)
	if resp.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200; body = %s", resp.Code, resp.Body.String())
	}
	body := resp.Body.String()
	if !strings.Contains(body, `"checkout_url":"https://www.instacart.com/list/abc"`) {
		t.Fatalf("body = %s, want checkout_url", body)
	}
	// The mobile client reads .length off this; null would crash it.
	if !strings.Contains(body, `"unmatched_ingredient_ids":[]`) {
		t.Fatalf("body = %s, want empty array for unmatched ids", body)
	}
}

func TestInstacartHandoffNotConfigured(t *testing.T) {
	deps := InstacartDeps{Grocery: stubGrocer{err: retailer.ErrNotConfigured}}
	resp := postJSON(t, instacartTestRouter(t, deps), "/api/instacart/handoff", `{"plan_id":"plan_1"}`)
	if resp.Code != http.StatusServiceUnavailable {
		t.Fatalf("status = %d, want 503; body = %s", resp.Code, resp.Body.String())
	}
}

func TestInstacartHandoffMissingPlan(t *testing.T) {
	deps := InstacartDeps{Grocery: stubGrocer{}}
	resp := postJSON(t, instacartTestRouter(t, deps), "/api/instacart/handoff", `{}`)
	if resp.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", resp.Code)
	}
}

func TestInstacartHandoffListNotFound(t *testing.T) {
	deps := InstacartDeps{Grocery: stubGrocer{err: domainmeals.ErrNotFound}}
	resp := postJSON(t, instacartTestRouter(t, deps), "/api/instacart/handoff", `{"plan_id":"nope"}`)
	if resp.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404", resp.Code)
	}
}

func TestInstacartHandoffUnexpectedError(t *testing.T) {
	deps := InstacartDeps{Grocery: stubGrocer{err: errors.New("db down")}}
	resp := postJSON(t, instacartTestRouter(t, deps), "/api/instacart/handoff", `{"plan_id":"plan_1"}`)
	if resp.Code != http.StatusInternalServerError {
		t.Fatalf("status = %d, want 500", resp.Code)
	}
	if strings.Contains(resp.Body.String(), "db down") {
		t.Fatalf("body leaks internals: %s", resp.Body.String())
	}
}

func TestInstacartFallbackLink(t *testing.T) {
	deps := InstacartDeps{AffiliateURL: "https://www.instacart.com/store?affiliate=tag"}
	resp := postJSON(t, instacartTestRouter(t, deps), "/api/instacart/fallback-link", `{"plan_id":"plan_1"}`)
	if resp.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200; body = %s", resp.Code, resp.Body.String())
	}
	if !strings.Contains(resp.Body.String(), `"url":"https://www.instacart.com/store?affiliate=tag"`) {
		t.Fatalf("body = %s", resp.Body.String())
	}
}

func TestInstacartFallbackLinkNotConfigured(t *testing.T) {
	deps := InstacartDeps{}
	resp := postJSON(t, instacartTestRouter(t, deps), "/api/instacart/fallback-link", `{"plan_id":"plan_1"}`)
	if resp.Code != http.StatusNotImplemented {
		t.Fatalf("status = %d, want 501; body = %s", resp.Code, resp.Body.String())
	}
}
