package meals

import "testing"

// Sizing a recipe to a household.
// --- Scaling --------------------------------------------------------------

func TestScaleFactorSizesToHousehold(t *testing.T) {
	four := fixtureRecipe("four", 4, []string{"dinner"}, fixtureLine(1, "rice", 1))

	if got := ScaleFactor(four, 4); got != 1 {
		t.Fatalf("ScaleFactor(household 4) = %v, want 1", got)
	}
	if got := ScaleFactor(four, 2); got != 0.5 {
		t.Fatalf("ScaleFactor(household 2) = %v, want 0.5", got)
	}
	if got := ScaleFactor(four, 8); got != 2 {
		t.Fatalf("ScaleFactor(household 8) = %v, want 2", got)
	}
	if got := ServingsPlanned(four, 8, 2); got != 8 {
		t.Fatalf("meals.ServingsPlanned = %v, want 8", got)
	}

	fixed := four
	fixed.Scalable = false
	if got := ScaleFactor(fixed, 8); got != 1 {
		t.Fatalf("ScaleFactor(unscalable) = %v, want 1", got)
	}
}

func fixtureLine(position int, ingredientID string, quantity float64) RecipeIngredient {
	id := ingredientID
	qty := quantity
	unit := "lb"
	return RecipeIngredient{
		Position: position, RawText: ingredientID, IngredientID: &id, Quantity: &qty, Unit: &unit,
	}
}

func fixtureRecipe(id string, servings float64, mealTypes []string, lines ...RecipeIngredient) Recipe {
	s := servings
	return Recipe{
		ID: id, Title: id, Servings: &s, Scalable: true, MealTypes: mealTypes,
		BaseMealPlanEligible: true, Ingredients: lines, Visibility: "public", ReviewStatus: "approved",
	}
}
