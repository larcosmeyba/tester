package grocery

import (
	"context"
	"errors"
	"testing"

	"github.com/helpthehive/server/internal/domain/meals"
	"github.com/helpthehive/server/internal/modules/kroger"
)

type stubCatalog struct{ cat *meals.Catalog }

func (s stubCatalog) Load(context.Context, string) (*meals.Catalog, error) { return s.cat, nil }

type stubPriceStore struct {
	rows []meals.IngredientPrice
	err  error
}

func (s *stubPriceStore) UpsertIngredientPrice(_ context.Context, price meals.IngredientPrice) error {
	if s.err != nil {
		return s.err
	}
	s.rows = append(s.rows, price)
	return nil
}

func feedCatalog() *meals.Catalog {
	ingredients := []meals.Ingredient{
		{ID: "milk", DisplayName: "Whole Milk", PriceReferenceUnit: "gallon"},
		{ID: "bananas", DisplayName: "Bananas", PriceReferenceUnit: "lb"},
		{ID: "salt", DisplayName: "Salt", PriceReferenceUnit: "oz"},
	}
	prices := []meals.IngredientPrice{
		// Packaged: the feed may replace the per-package price with the live one.
		{IngredientID: "milk", UnitPrice: 3.89, PackageSize: 1, Divisible: false, Tier: 3, Source: "bls", GeographicScope: "us"},
		// Divisible: a per-package live price cannot honestly become a
		// per-unit price, so this stays on the stored estimate.
		{IngredientID: "bananas", UnitPrice: 0.69, PackageSize: 0, Divisible: true, Tier: 3, Source: "ers", GeographicScope: "us"},
		// No price row at all: nothing to anchor the package math to.
	}
	return meals.NewCatalog(ingredients, prices)
}

func liveMock() *kroger.Mock {
	m := kroger.NewMock()
	m.Products = []kroger.Product{
		{ProductID: "1", Description: "Whole Milk, 1 Gal", Price: kroger.Price{Cents: 419, Source: kroger.SourceKroger}},
	}
	return m
}

func TestPriceFeedSyncsLiveQuotesToTier1(t *testing.T) {
	store := &stubPriceStore{}
	feed := NewPriceFeed(stubCatalog{feedCatalog()}, store, liveMock(), "loc_1", nil)

	stats, err := feed.Sync(context.Background())
	if err != nil {
		t.Fatalf("Sync() error = %v", err)
	}
	if stats.Checked != 3 || stats.Live != 1 || stats.Skipped != 2 || stats.Failed != 0 {
		t.Fatalf("stats = %+v", stats)
	}
	if len(store.rows) != 1 {
		t.Fatalf("rows = %d, want 1", len(store.rows))
	}
	row := store.rows[0]
	if row.IngredientID != "milk" || row.Tier != 1 || row.Source != kroger.SourceKroger {
		t.Fatalf("row = %+v", row)
	}
	// $4.19 live for the 1-gallon package: the per-gallon unit price becomes
	// the live number, same package size as the reviewed row.
	if row.UnitPrice != 4.19 || row.PackageSize != 1 || row.Divisible {
		t.Fatalf("row = %+v, want unit price 4.19 on the 1-gallon package", row)
	}
}

func TestPriceFeedSkipsFallbackQuotes(t *testing.T) {
	m := kroger.NewMock()
	m.UseFallback = true // quotes answer from the USDA table: not live
	store := &stubPriceStore{}
	feed := NewPriceFeed(stubCatalog{feedCatalog()}, store, m, "loc_1", nil)

	stats, err := feed.Sync(context.Background())
	if err != nil {
		t.Fatalf("Sync() error = %v", err)
	}
	if stats.Live != 0 || len(store.rows) != 0 {
		t.Fatalf("stats = %+v, rows = %d: fallback quotes must not become tier-1 rows", stats, len(store.rows))
	}
}

func TestPriceFeedUnconfiguredIsNoop(t *testing.T) {
	store := &stubPriceStore{}
	feed := NewPriceFeed(stubCatalog{feedCatalog()}, store, kroger.Unconfigured{}, "", nil)

	stats, err := feed.Sync(context.Background())
	if err != nil {
		t.Fatalf("Sync() error = %v", err)
	}
	if stats != (FeedStats{}) || len(store.rows) != 0 {
		t.Fatalf("stats = %+v, rows = %d: unconfigured feed must change nothing", stats, len(store.rows))
	}
}

func TestPriceFeedQuoteErrorsAreCountedNotFatal(t *testing.T) {
	m := liveMock()
	m.QuoteErr = errors.New("boom")
	store := &stubPriceStore{}
	feed := NewPriceFeed(stubCatalog{feedCatalog()}, store, m, "loc_1", nil)

	stats, err := feed.Sync(context.Background())
	if err != nil {
		t.Fatalf("Sync() error = %v", err)
	}
	if stats.Failed == 0 || len(store.rows) != 0 {
		t.Fatalf("stats = %+v, rows = %d", stats, len(store.rows))
	}
}
