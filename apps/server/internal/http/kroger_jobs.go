package serverhttp

import (
	"context"
	"crypto/subtle"
	"encoding/json"
	"log/slog"
	"net/http"

	"github.com/helpthehive/server/internal/modules/grocery"
)

// KrogerPriceSyncer is the one feed method the sync endpoint needs.
// *grocery.PriceFeed satisfies it; tests substitute a stub.
type KrogerPriceSyncer interface {
	Sync(ctx context.Context) (grocery.FeedStats, error)
}

// KrogerPriceSync runs one tier-1 price-feed pass. It is an internal,
// authenticated endpoint: Cloud Scheduler calls it daily with the shared job
// secret in the X-Job-Secret header, the same way the benefits renewal sweep
// works. The sync itself is idempotent — re-running it just rewrites the
// same tier-1 rows — so scheduler retries are safe.
func KrogerPriceSync(deps JobsDeps, logger *slog.Logger) http.HandlerFunc {
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
		if deps.KrogerFeed == nil {
			http.Error(w, "kroger price feed is not configured", http.StatusServiceUnavailable)
			return
		}
		stats, err := deps.KrogerFeed.Sync(r.Context())
		if err != nil {
			logger.Error("kroger price sync failed", "error", err)
			http.Error(w, "sync failed", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		if err := json.NewEncoder(w).Encode(stats); err != nil {
			logger.Error("kroger price sync response failed", "error", err)
		}
	}
}
