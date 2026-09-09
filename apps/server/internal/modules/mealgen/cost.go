package mealgen

import "github.com/helpthehive/server/internal/domain/meals"

// What one meal draws out of the basket, and what the pantry covered.
//
// This is not the same figure as the grocery list's total: the till charges for
// whole packages, and a meal only eats part of one. The two numbers are
// reported separately for exactly that reason.

// consumedCost is what one meal eats out of the basket: quantity times unit
// price, with no package rounding. Ingredients the pantry already covers are
// excluded, because the user is not buying them again.
func consumedCost(recipe meals.Recipe, scale float64, pantry map[string]bool, catalog *meals.Catalog) *float64 {
	var total float64
	var priced bool
	for _, line := range meals.PurchasableLines(recipe) {
		if line.IngredientID == nil || line.Quantity == nil {
			continue
		}
		ingredient, ok := catalog.Ingredient(*line.IngredientID)
		if !ok || ingredient.AssumedOnHand {
			continue
		}
		if catalog.Matches(ingredient.ID, pantry) {
			continue
		}
		price, ok := catalog.Price(ingredient.ID)
		if !ok {
			continue
		}
		total += *line.Quantity * scale * price.UnitPrice
		priced = true
	}
	if !priced {
		return nil
	}
	rounded := meals.RoundCents(total)
	return &rounded
}

func appendUnique(values []string, value string) []string {
	for _, existing := range values {
		if existing == value {
			return values
		}
	}
	return append(values, value)
}
