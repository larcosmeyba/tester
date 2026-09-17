package serverhttp

// Instacart's HTTP surface.
//
// REST rather than GraphQL, like Penny's: the mobile app's Instacart seam
// already declares these paths, and the contract is small enough that a
// schema adds nothing.
//
// The client sends the plan id and nothing else. The server resolves the
// plan's grocery list, builds the Instacart shopping list page with the
// server-side API key, and returns the URL the app opens. No credentials,
// product ids, or prices ever travel to the client.

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/helpthehive/server/internal/auth"
	domainmeals "github.com/helpthehive/server/internal/domain/meals"
	"github.com/helpthehive/server/internal/modules/grocery/retailer"
)

// InstacartGrocer is the one grocery method these routes need.
// *grocery.Service satisfies it; tests substitute a stub.
type InstacartGrocer interface {
	PrepareRetailerCart(ctx context.Context, identity auth.Identity, planID string) (retailer.Cart, error)
}

// InstacartDeps wires the routes. Grocery may be nil only in tests that do
// not mount the routes; the router skips mounting when it is nil.
type InstacartDeps struct {
	Grocery InstacartGrocer
	// AffiliateURL is the INSTACART_AFFILIATE_URL deep link. Empty means the
	// fallback endpoint reports itself unconfigured.
	AffiliateURL string
	Logger       *slog.Logger
}

// InstacartRoutes mounts the handoff API. The caller applies the auth
// middleware: both routes act for the signed-in user and resolve the plan
// server-side from the plan id.
func InstacartRoutes(deps InstacartDeps) func(chi.Router) {
	logger := deps.Logger
	if logger == nil {
		logger = slog.Default()
	}
	return func(r chi.Router) {
		r.Post("/handoff", instacartHandoff(deps, logger))
		r.Post("/fallback-link", instacartFallbackLink(deps, logger))
	}
}

type instacartPlanBody struct {
	PlanID string `json:"plan_id"`
}

func instacartHandoff(deps InstacartDeps, logger *slog.Logger) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		identity, ok := requireIdentity(w, r)
		if !ok {
			return
		}
		var body instacartPlanBody
		if !decodeBody(w, r, &body) {
			return
		}
		if strings.TrimSpace(body.PlanID) == "" {
			writeError(w, http.StatusBadRequest, "plan_id is required")
			return
		}
		if deps.Grocery == nil {
			writeError(w, http.StatusServiceUnavailable, "instacart checkout is not connected yet")
			return
		}
		cart, err := deps.Grocery.PrepareRetailerCart(r.Context(), identity, body.PlanID)
		switch {
		case err == nil:
			unmatched := cart.UnmatchedIngredientIDs
			if unmatched == nil {
				unmatched = []string{}
			}
			writeJSON(w, http.StatusOK, map[string]any{
				"checkout_url":             cart.CheckoutURL,
				"unmatched_ingredient_ids": unmatched,
			})
		case errors.Is(err, retailer.ErrNotConfigured):
			// Ordinary state, not a fault: the app shows the affiliate
			// fallback card. 503 so the client can tell "not connected yet"
			// apart from a real failure.
			writeError(w, http.StatusServiceUnavailable, "instacart checkout is not connected yet")
		case errors.Is(err, domainmeals.ErrNotFound):
			writeError(w, http.StatusNotFound, "no grocery list found for this plan")
		default:
			logger.Error("instacart: handoff failed", "error", err)
			writeError(w, http.StatusInternalServerError, "could not prepare the instacart list")
		}
	}
}

func instacartFallbackLink(deps InstacartDeps, logger *slog.Logger) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if _, ok := requireIdentity(w, r); !ok {
			return
		}
		var body instacartPlanBody
		if !decodeBody(w, r, &body) {
			return
		}
		if strings.TrimSpace(body.PlanID) == "" {
			writeError(w, http.StatusBadRequest, "plan_id is required")
			return
		}
		if strings.TrimSpace(deps.AffiliateURL) == "" {
			// The mobile client already handles this: it renders the
			// fallback card as unavailable rather than crashing.
			writeError(w, http.StatusNotImplemented, "instacart affiliate link is not configured")
			return
		}
		writeJSON(w, http.StatusOK, map[string]string{"url": strings.TrimSpace(deps.AffiliateURL)})
	}
}
