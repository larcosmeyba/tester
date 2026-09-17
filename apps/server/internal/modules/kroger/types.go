package kroger

import "errors"

// ErrNotConfigured is returned when the Kroger developer-app credentials are
// not set. It is a normal state, not a fault: pricing serves USDA estimates
// and labels them as such.
var ErrNotConfigured = errors.New("kroger is not configured: KROGER_CLIENT_ID / KROGER_CLIENT_SECRET are unset")

// ErrNoPrice is returned when neither live pricing nor the USDA fallback
// could produce a price. Nothing invents a number.
var ErrNoPrice = errors.New("kroger: no live price and no USDA estimate matched")

// Price is one honest number. Estimated is true and Label is "Est." whenever
// the price came from the USDA averages table instead of a live store.
type Price struct {
	Cents     int    `json:"cents"`
	PerUnit   string `json:"perUnit,omitempty"`
	Source    string `json:"source"` // "kroger" or "usda-estimate"
	Estimated bool   `json:"estimated"`
	Label     string `json:"label,omitempty"` // "Est." when Estimated
}

// Product is one result of a product search.
type Product struct {
	ProductID   string `json:"productId"`
	UPC         string `json:"upc,omitempty"`
	Brand       string `json:"brand,omitempty"`
	Description string `json:"description"`
	ImageURL    string `json:"imageUrl,omitempty"`
	Price       Price  `json:"price"`
}

// Quote is the price of one search term at one store.
type Quote struct {
	LocationID string   `json:"locationId"`
	Term       string   `json:"term"`
	Product    *Product `json:"product,omitempty"` // nil when the USDA fallback supplied the price
	Price      Price    `json:"price"`
	Live       bool     `json:"live"` // false when the USDA fallback supplied the price
}

// Store is one Kroger-family store near the user.
type Store struct {
	LocationID string  `json:"locationId"`
	Chain      string  `json:"chain"`
	Name       string  `json:"name"`
	City       string  `json:"city"`
	State      string  `json:"state"`
	ZipCode    string  `json:"zipCode"`
	Latitude   float64 `json:"latitude"`
	Longitude  float64 `json:"longitude"`
}

// wireToken is the /v1/connect/oauth2/token response.
type wireToken struct {
	AccessToken string `json:"access_token"`
	ExpiresIn   int    `json:"expires_in"`
}

type wirePrice struct {
	Regular float64 `json:"regular"`
	Promo   float64 `json:"promo"`
}

type wireItem struct {
	ItemID string    `json:"itemId"`
	Price  wirePrice `json:"price"`
}

type wireImageSize struct {
	URL string `json:"url"`
}

type wireImage struct {
	Featured bool            `json:"featured"`
	Sizes    []wireImageSize `json:"sizes"`
}

type wireProduct struct {
	ProductID   string      `json:"productId"`
	UPC         string      `json:"upc"`
	Brand       string      `json:"brand"`
	Description string      `json:"description"`
	Images      []wireImage `json:"images"`
	Items       []wireItem  `json:"items"`
}

type wireProductsResponse struct {
	Data []wireProduct `json:"data"`
}

type wireAddress struct {
	City    string `json:"city"`
	State   string `json:"state"`
	ZipCode string `json:"zipCode"`
}

type wireGeo struct {
	Latitude  float64 `json:"latitude"`
	Longitude float64 `json:"longitude"`
}

type wireLocation struct {
	LocationID  string      `json:"locationId"`
	Chain       string      `json:"chain"`
	Name        string      `json:"name"`
	Address     wireAddress `json:"address"`
	Geolocation wireGeo     `json:"geolocation"`
}

type wireLocationsResponse struct {
	Data []wireLocation `json:"data"`
}

// toProduct maps one wire product to the consumer-facing type, taking the
// first item's price (Kroger returns one item per fulfillment variant; the
// first is the in-store variant).
func (w wireProduct) toProduct() Product {
	p := Product{
		ProductID:   w.ProductID,
		UPC:         w.UPC,
		Brand:       w.Brand,
		Description: w.Description,
	}
	for _, img := range w.Images {
		if img.Featured && len(img.Sizes) > 0 {
			p.ImageURL = img.Sizes[0].URL
			break
		}
	}
	if p.ImageURL == "" && len(w.Images) > 0 && len(w.Images[0].Sizes) > 0 {
		p.ImageURL = w.Images[0].Sizes[0].URL
	}
	if len(w.Items) > 0 {
		p.Price = wirePriceToPrice(w.Items[0].Price)
	}
	return p
}

func wirePriceToPrice(wp wirePrice) Price {
	p := Price{Source: SourceKroger, Cents: dollarsToCents(wp.Regular)}
	if wp.Promo > 0 && wp.Promo < wp.Regular {
		p.Cents = dollarsToCents(wp.Promo)
	}
	return p
}

func dollarsToCents(d float64) int {
	return int(d*100 + 0.5)
}

// Source identifiers, so callers and the UI never compare raw strings.
const (
	SourceKroger = "kroger"
	SourceUSDA   = "usda-estimate"
	// EstimateLabel is shown in the UI whenever a price is a USDA average.
	EstimateLabel = "Est."
)

func (w wireLocation) toStore() Store {
	return Store{
		LocationID: w.LocationID,
		Chain:      w.Chain,
		Name:       w.Name,
		City:       w.Address.City,
		State:      w.Address.State,
		ZipCode:    w.Address.ZipCode,
		Latitude:   w.Geolocation.Latitude,
		Longitude:  w.Geolocation.Longitude,
	}
}
