package meals

import "strings"

// Converting a stated quantity to grams.
//
// Only mass units are converted. A cup of flour and a cup of oil do not weigh
// the same, and the catalogue holds no densities, so turning a volume into a
// weight would mean inventing the one number the whole system is built not to
// invent — and an invented weight is a wrong grocery quantity and a wrong
// nutrition figure, silently.
//
// So volumes come back unconvertible, the line keeps its quantity and unit as
// stated, and Grams stays nil. That is a smaller loss than a plausible lie.

// gramsPerUnit holds the mass units and what one of each weighs in grams.
// These are definitions, not estimates.
var gramsPerUnit = map[string]float64{
	"mg": 0.001, "milligram": 0.001, "milligrams": 0.001,
	"g": 1, "gr": 1, "gram": 1, "grams": 1, "gramme": 1, "grammes": 1,
	"kg": 1000, "kilo": 1000, "kilos": 1000, "kilogram": 1000, "kilograms": 1000,
	"oz": 28.349523125, "ounce": 28.349523125, "ounces": 28.349523125,
	"lb": 453.59237, "lbs": 453.59237, "pound": 453.59237, "pounds": 453.59237,
}

// GramsFor returns the weight in grams of quantity of unit, and whether the
// unit is one that can be converted at all.
//
// A false return is not a failure: it means the source stated an amount in
// something other than mass, which is normal and is left exactly as stated.
func GramsFor(quantity float64, unit string) (float64, bool) {
	if quantity <= 0 {
		return 0, false
	}
	factor, ok := gramsPerUnit[normalizeUnit(unit)]
	if !ok {
		return 0, false
	}
	return quantity * factor, true
}

// IsMassUnit reports whether a unit converts to grams.
func IsMassUnit(unit string) bool {
	_, ok := gramsPerUnit[normalizeUnit(unit)]
	return ok
}

// normalizeUnit lowercases and strips the punctuation and trailing period that
// "Kg." and "oz" differ by. It does not stem: "cups" and "cup" are both
// volumes and neither converts, so nothing is gained by conflating them.
func normalizeUnit(unit string) string {
	var b strings.Builder
	for _, r := range strings.ToLower(strings.TrimSpace(unit)) {
		if r >= 'a' && r <= 'z' {
			b.WriteRune(r)
		}
	}
	return b.String()
}
