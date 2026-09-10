package kroger

import (
	"context"
	"sync"
)

// Mock is a Provider implementation that answers from fixtures instead of
// the network. It exists so pricing UI can be built and screenshotted
// against real-shaped data before the developer app is approved, and so
// pricing code can be tested without spending the daily quota.
//
// Mock is safe for concurrent use.
type Mock struct {
	mu       sync.Mutex
	Products []Product
	Stores   []Store

	SearchErr   error
	UPCErr      error
	StoresErr   error
	QuoteErr    error
	UseFallback bool // when true, Quote answers from the USDA table like Unconfigured

	QuoteCalls []QuoteRequest
}

var _ Provider = (*Mock)(nil)

func (m *Mock) Available() bool { return true }

func (m *Mock) SearchProducts(_ context.Context, term, _ string, limit int) ([]Product, error) {
	if m.SearchErr != nil {
		return nil, m.SearchErr
	}
	out := append([]Product(nil), m.Products...)
	if limit > 0 && len(out) > limit {
		out = out[:limit]
	}
	return out, nil
}

func (m *Mock) ProductByUPC(_ context.Context, upc, _ string) (Product, error) {
	if m.UPCErr != nil {
		return Product{}, m.UPCErr
	}
	for _, p := range m.Products {
		if p.UPC == upc {
			return p, nil
		}
	}
	return Product{}, ErrNoPrice
}

func (m *Mock) NearbyStores(_ context.Context, _ string, _ int) ([]Store, error) {
	if m.StoresErr != nil {
		return nil, m.StoresErr
	}
	return append([]Store(nil), m.Stores...), nil
}

func (m *Mock) Quote(_ context.Context, req QuoteRequest) (Quote, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.QuoteCalls = append(m.QuoteCalls, req)
	if m.QuoteErr != nil {
		return Quote{}, m.QuoteErr
	}
	if m.UseFallback {
		price, ok := estimateUSDA(req.Term)
		if !ok {
			return Quote{}, ErrNoPrice
		}
		return Quote{LocationID: req.LocationID, Term: req.Term, Price: price, Live: false}, nil
	}
	if len(m.Products) > 0 {
		p := m.Products[0]
		return Quote{LocationID: req.LocationID, Term: req.Term, Product: &p, Price: p.Price, Live: true}, nil
	}
	return Quote{}, ErrNoPrice
}

// NewMock seeds a Mock with the sample fixtures.
func NewMock() *Mock { return &Mock{Products: SampleProducts(), Stores: SampleStores()} }

// SampleProducts returns Kroger-shaped fixture products with live prices.
// Fixtures for UI development and tests.
func SampleProducts() []Product {
	return []Product{
		{
			ProductID:   "011110000000",
			UPC:         "011110000000",
			Brand:       "Kroger",
			Description: "Kroger Whole Milk, 1 Gal",
			ImageURL:    "https://example.com/milk.jpg",
			Price:       Price{Cents: 419, PerUnit: "gallon", Source: SourceKroger},
		},
		{
			ProductID:   "011110000001",
			UPC:         "011110000001",
			Brand:       "Kroger",
			Description: "Kroger Large White Eggs, 12 Ct",
			ImageURL:    "https://example.com/eggs.jpg",
			Price:       Price{Cents: 349, PerUnit: "dozen", Source: SourceKroger},
		},
	}
}

// SampleStores returns Kroger-shaped fixture stores.
func SampleStores() []Store {
	return []Store{
		{
			LocationID: "70600001",
			Chain:      "Kroger",
			Name:       "Kroger",
			City:       "Santa Monica",
			State:      "CA",
			ZipCode:    "90401",
			Latitude:   34.0195,
			Longitude:  -118.4912,
		},
	}
}
