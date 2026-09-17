package grocery

import (
	"context"
	"log/slog"
	"sort"

	"github.com/helpthehive/server/internal/domain/meals"
	"github.com/helpthehive/server/internal/modules/kroger"
)

// PriceFeed keeps the tier-1 retailer price rows fresh.
//
// The pricing in pricing.go reads ingredient_prices and always takes the
// lowest tier, so a live Kroger row at tier 1 wins automatically — and when
// there is no such row, the stored estimates win without anyone noticing.
// That is the whole fallback story: no Kroger credentials, no live match, or
// a failed sync all degrade to the existing estimates silently, never to an
// error the user sees.
//
// The sync is deliberately one-way and conservative:
//
//   - Only live quotes become tier-1 rows. A USDA fallback quote is the
//     provider's ordinary degraded answer, not a retailer price, and writing
//     it at tier 1 would demote the reviewed tier-3 rows underneath it.
//   - Only packaged goods are synced (Divisible false with a package size).
//     Kroger quotes a price per matched product package; spreading that over
//     a per-unit price requires knowing the package, which the API does not
//     return. Loose goods stay on their stored estimates rather than being
//     assigned a per-unit price nobody measured.
//   - The package math is anchored to the reviewed catalogue row: the sync
//     replaces the price per package with the live number and keeps the
//     catalogue's package size. Same packages bought, live price per
//     package, still labelled an estimate everywhere it is shown.
type PriceFeed struct {
	kroger     kroger.Provider
	catalog    CatalogLoader
	store      PriceWriter
	locationID string
	log        *slog.Logger
}

// CatalogLoader is the one catalog method the feed needs. *catalog.Service
// satisfies it; tests substitute a stub.
type CatalogLoader interface {
	Load(ctx context.Context, scope string) (*meals.Catalog, error)
}

// PriceWriter is the one store method the feed needs. *db.Store satisfies
// it; tests substitute a stub.
type PriceWriter interface {
	UpsertIngredientPrice(ctx context.Context, price meals.IngredientPrice) error
}

// NewPriceFeed builds the feed. A nil provider selects kroger.Unconfigured,
// which makes Sync a no-op: the feed is how "no credentials" stays an
// ordinary state rather than a nil check at the call site.
func NewPriceFeed(catalog CatalogLoader, store PriceWriter, provider kroger.Provider, locationID string, logger *slog.Logger) *PriceFeed {
	if provider == nil {
		provider = kroger.Unconfigured{}
	}
	if logger == nil {
		logger = slog.Default()
	}
	return &PriceFeed{kroger: provider, catalog: catalog, store: store, locationID: locationID, log: logger}
}

// FeedStats is what one sync pass did.
type FeedStats struct {
	// Checked is how many catalogue ingredients were considered.
	Checked int
	// Live is how many got a fresh tier-1 row from a live Kroger quote.
	Live int
	// Skipped is how many were left on their stored estimates: no price row
	// to anchor to, loose goods, or no live match.
	Skipped int
	// Failed is how many errored and were logged, not retried.
	Failed int
}

// Sync refreshes the tier-1 rows. Per-ingredient failures are logged and
// counted, never fatal: a feed that dies on one bad term would take the rest
// of the catalogue's live prices down with it.
func (f *PriceFeed) Sync(ctx context.Context) (FeedStats, error) {
	var stats FeedStats
	if !f.kroger.Available() {
		return stats, nil
	}
	cat, err := f.catalog.Load(ctx, defaultPriceScope)
	if err != nil {
		return stats, err
	}
	ids := cat.IDs()
	sort.Strings(ids)
	for _, id := range ids {
		stats.Checked++
		ingredient, ok := cat.Ingredient(id)
		if !ok {
			stats.Skipped++
			continue
		}
		anchor, ok := cat.Price(id)
		if !ok || anchor.Divisible || anchor.PackageSize <= 0 {
			stats.Skipped++
			continue
		}
		quote, err := f.kroger.Quote(ctx, kroger.QuoteRequest{Term: ingredient.DisplayName, LocationID: f.locationID})
		if err != nil {
			f.log.Warn("kroger feed: quote failed, keeping stored estimate", "ingredient", id, "err", err)
			stats.Failed++
			continue
		}
		if !quote.Live {
			stats.Skipped++
			continue
		}
		row := meals.IngredientPrice{
			IngredientID:    id,
			UnitPrice:       meals.RoundCents(float64(quote.Price.Cents) / 100 / anchor.PackageSize),
			PackageSize:     anchor.PackageSize,
			Divisible:       false,
			Tier:            1,
			Source:          kroger.SourceKroger,
			GeographicScope: anchor.GeographicScope,
		}
		if row.GeographicScope == "" {
			row.GeographicScope = defaultPriceScope
		}
		if err := f.store.UpsertIngredientPrice(ctx, row); err != nil {
			f.log.Warn("kroger feed: upsert failed", "ingredient", id, "err", err)
			stats.Failed++
			continue
		}
		stats.Live++
	}
	f.log.Info("kroger feed: sync complete", "checked", stats.Checked, "live", stats.Live, "skipped", stats.Skipped, "failed", stats.Failed)
	return stats, nil
}
