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

// millilitresPerUnit holds the volume units and what one of each holds in
// millilitres. Like the mass table these are definitions — three teaspoons make
// a tablespoon everywhere — not estimates about any particular ingredient.
//
// US customary measures, which is what the recipe catalogue is written in.
var millilitresPerUnit = map[string]float64{
	"ml": 1, "millilitre": 1, "millilitres": 1, "milliliter": 1, "milliliters": 1, "cc": 1,
	"l": 1000, "litre": 1000, "litres": 1000, "liter": 1000, "liters": 1000,
	"tsp": 4.92892159375, "teaspoon": 4.92892159375, "teaspoons": 4.92892159375,
	"tbsp": 14.78676478125, "tbs": 14.78676478125,
	"tablespoon": 14.78676478125, "tablespoons": 14.78676478125,
	"floz": 29.5735295625, "fluidounce": 29.5735295625, "fluidounces": 29.5735295625,
	"cup": 236.5882365, "cups": 236.5882365,
	"pint": 473.176473, "pints": 473.176473, "pt": 473.176473,
	"quart": 946.352946, "quarts": 946.352946, "qt": 946.352946,
	"gal": 3785.411784, "gallon": 3785.411784, "gallons": 3785.411784,
}

// MillilitresFor returns the volume in millilitres of quantity of unit, and
// whether the unit is a volume at all.
//
// Volumes convert freely among themselves because the relationships are fixed.
// What they never do is cross into mass: that needs a density, which depends on
// the ingredient and which the catalogue does not hold. A cup of rice and a cup
// of oil weigh different amounts, and guessing which would put a wrong number
// on a grocery list and in a nutrition figure at the same time.
func MillilitresFor(quantity float64, unit string) (float64, bool) {
	if quantity <= 0 {
		return 0, false
	}
	factor, ok := millilitresPerUnit[normalizeUnit(unit)]
	if !ok {
		return 0, false
	}
	return quantity * factor, true
}

// IsVolumeUnit reports whether a unit converts to millilitres.
func IsVolumeUnit(unit string) bool {
	_, ok := millilitresPerUnit[normalizeUnit(unit)]
	return ok
}

// IsMassUnit reports whether a unit converts to grams.
func IsMassUnit(unit string) bool {
	_, ok := gramsPerUnit[normalizeUnit(unit)]
	return ok
}

// normalizeUnit lowercases and strips the punctuation and trailing period that
// "Kg." and "oz" differ by. It does not stem; both tables list their plurals
// explicitly, which keeps "gal" and "gals" from colliding with anything by
// accident.
func normalizeUnit(unit string) string {
	var b strings.Builder
	for _, r := range strings.ToLower(strings.TrimSpace(unit)) {
		if r >= 'a' && r <= 'z' {
			b.WriteRune(r)
		}
	}
	return b.String()
}
