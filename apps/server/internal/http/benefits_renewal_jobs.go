package serverhttp

import (
	"context"
	"crypto/subtle"
	"encoding/json"
	"log/slog"
	"net/http"

	"github.com/helpthehive/server/internal/modules/benefits"
)

// JobsDeps wires the internal job endpoints. Jobs are called by Cloud
// Scheduler (or an operator), never by the mobile app, and authenticate with a
// shared secret rather than a user token.
type JobsDeps struct {
	Benefits RenewalSweeper
	// Sender delivers the reminder pushes. The benefits sweep owns the
	// scheduling; this is the transport it sends through.
	Sender benefits.RenewalPushSender
	// JobSecret is the INTERNAL_JOB_SECRET value. Empty disables the endpoint.
	JobSecret string
}

// RenewalSweeper is the one service method the sweep endpoint needs.
// *benefits.Service satisfies it; tests substitute a stub.
type RenewalSweeper interface {
	SweepRenewals(ctx context.Context, sender benefits.RenewalPushSender) (benefits.SweepCounts, error)
}

// BenefitsRenewalSweep runs one renewal-reminder sweep pass. It is an
// internal, authenticated endpoint: Cloud Scheduler calls it daily with the
// shared job secret in the X-Job-Secret header. The path says "internal" so
// that anyone reading an access log, a proxy config or an ingress rule can see
// it is not a client route.
//
// The sweep itself is at-most-once per (renewal, stage) — claiming a send
// inserts a unique send-claim row and advances the reminder stage in a
// transaction that commits before the Expo HTTP send, so a crashed and retried
// call finds the claim taken and never double-sends. A crash between the claim
// and the send skips that reminder rather than risking a duplicate.
func BenefitsRenewalSweep(deps JobsDeps, logger *slog.Logger) http.HandlerFunc {
	if logger == nil {
		logger = slog.Default()
	}
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			w.Header().Set("Allow", http.MethodPost)
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		if deps.JobSecret == "" {
			http.Error(w, "job secret not configured", http.StatusServiceUnavailable)
			return
		}
		given := r.Header.Get("X-Job-Secret")
		if subtle.ConstantTimeCompare([]byte(given), []byte(deps.JobSecret)) != 1 {
			http.Error(w, "forbidden", http.StatusForbidden)
			return
		}
		if deps.Benefits == nil || deps.Sender == nil {
			http.Error(w, "the benefits system is not available on this server", http.StatusServiceUnavailable)
			return
		}

		counts, err := deps.Benefits.SweepRenewals(r.Context(), deps.Sender)
		if err != nil {
			logger.Error("benefits renewal sweep failed", "error", err)
			http.Error(w, "sweep failed", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		if err := json.NewEncoder(w).Encode(counts); err != nil {
			logger.Error("benefits renewal sweep response failed", "error", err)
		}
	}
}
