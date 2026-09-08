package meals

import "math"

// Household scaling and the arithmetic that goes with it.
//
// These are properties of a recipe and a household, not decisions: both the
// generator (sizing a planned meal) and grocery (pricing an ad-hoc selection)
// need the same answer, and neither should have to import the other to get it.

// ScaleFactor sizes a recipe to the household. A recipe that cannot be scaled
// is cooked as written.
func ScaleFactor(recipe Recipe, householdSize int) float64 {
	if !recipe.Scalable || recipe.Servings == nil || *recipe.Servings <= 0 {
		return 1
	}
	factor := float64(householdSize) / *recipe.Servings
	if factor < 0.25 {
		factor = 0.25
	}
	if factor > 8 {
		factor = 8
	}
	return math.Round(factor*100) / 100
}

// ServingsPlanned is what the household actually gets out of the pot.
func ServingsPlanned(recipe Recipe, householdSize int, scale float64) float64 {
	if recipe.Servings == nil || *recipe.Servings <= 0 {
		return float64(householdSize)
	}
	return math.Round(*recipe.Servings*scale*100) / 100
}

// PurchasableLines are the lines that count toward a grocery basket: the
// optional and to-taste ones do not.
func PurchasableLines(recipe Recipe) []RecipeIngredient {
	var lines []RecipeIngredient
	for _, line := range recipe.Ingredients {
		if line.IsOptional || line.IsToTaste {
			continue
		}
		lines = append(lines, line)
	}
	return lines
}

// RoundCents rounds money to the cent. Every figure the user is shown goes
// through it, so a total and its parts cannot disagree by a fraction.
func RoundCents(value float64) float64 {
	return math.Round(value*100) / 100
}
