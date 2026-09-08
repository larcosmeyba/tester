package meals

import (
	"strings"
	"testing"
)

// Resolving an imported recipe against the catalogue.
//
// The rule under test throughout: what the catalogue cannot vouch for is
// recorded, never guessed, and a recipe with anything missing is never planned
// automatically — but stays perfectly readable.

func resolveCatalog() *Catalog {
	return NewCatalog(
		[]Ingredient{
			{ID: "olive_oil", DisplayName: "Olive Oil", Aisle: "pantry", FoodGroup: "fat", PriceReferenceUnit: "fl_oz"},
			{ID: "rice_white", DisplayName: "White Rice", Aisle: "pantry", FoodGroup: "grain", PriceReferenceUnit: "lb"},
		},
		nil,
	)
}

func importedRecipe(lines ...RecipeIngredient) Recipe {
	servings := 4.0
	return Recipe{
		ID:           "import-1",
		Title:        "Imported dish",
		SourceType:   "video_import",
		Servings:     &servings,
		Scalable:     true,
		MealTypes:    []string{"dinner"},
		Ingredients:  lines,
		Visibility:   "private",
		ReviewStatus: "draft",
		// The extractor's optimistic guess, which resolution must not trust.
		BaseMealPlanEligible: true,
	}
}

func namedLine(position int, name string, quantity *float64) RecipeIngredient {
	display := name
	unit := "lb"
	return RecipeIngredient{
		Position: position, RawText: name, DisplayName: &display, Quantity: quantity, Unit: &unit,
	}
}

func qty(value float64) *float64 { return &value }

func TestResolveMatchesCatalogueNamesAndKeepsRecipePlannable(t *testing.T) {
	recipe := importedRecipe(
		namedLine(1, "Olive Oil", qty(2)),
		namedLine(2, "white rice", qty(1)),
	)

	resolved := ResolveAgainstCatalog(recipe, resolveCatalog())

	if got := resolved.Ingredients[0].IngredientID; got == nil || *got != "olive_oil" {
		t.Fatalf("line 1 ingredient id = %v, want olive_oil", got)
	}
	// Normalization makes "white rice" and "White Rice" the same key.
	if got := resolved.Ingredients[1].IngredientID; got == nil || *got != "rice_white" {
		t.Fatalf("line 2 ingredient id = %v, want rice_white", got)
	}
	if len(resolved.MissingInformation) != 0 {
		t.Fatalf("missingInformation = %v, want none", resolved.MissingInformation)
	}
	if !resolved.BaseMealPlanEligible {
		t.Fatal("a fully resolved recipe with quantities should be plannable")
	}
}

func TestResolveNeverGuessesAnUnknownIngredient(t *testing.T) {
	recipe := importedRecipe(
		namedLine(1, "Olive Oil", qty(2)),
		namedLine(2, "gochujang", qty(1)),
	)

	resolved := ResolveAgainstCatalog(recipe, resolveCatalog())

	if resolved.Ingredients[1].IngredientID != nil {
		t.Fatalf("unknown ingredient resolved to %v; it must never be guessed at",
			*resolved.Ingredients[1].IngredientID)
	}
	if !mentionsNote(resolved.MissingInformation, MissingIngredient) {
		t.Fatalf("missingInformation = %v, want a %s note", resolved.MissingInformation, MissingIngredient)
	}
	if resolved.BaseMealPlanEligible {
		t.Fatal("a recipe with an unidentifiable ingredient must never be planned automatically")
	}
	// It stays readable: the raw text the video used is untouched.
	if resolved.Ingredients[1].RawText != "gochujang" {
		t.Fatalf("raw text = %q, want it preserved", resolved.Ingredients[1].RawText)
	}
}

func TestResolveRecordsAMissingQuantityRatherThanInventingOne(t *testing.T) {
	recipe := importedRecipe(
		namedLine(1, "Olive Oil", nil),
		namedLine(2, "White Rice", qty(1)),
	)

	resolved := ResolveAgainstCatalog(recipe, resolveCatalog())

	if resolved.Ingredients[0].Quantity != nil {
		t.Fatalf("quantity = %v, want it left missing", *resolved.Ingredients[0].Quantity)
	}
	if !mentionsNote(resolved.MissingInformation, MissingQuantity) {
		t.Fatalf("missingInformation = %v, want a %s note", resolved.MissingInformation, MissingQuantity)
	}
	if resolved.BaseMealPlanEligible {
		t.Fatal("a recipe with an unstated quantity cannot be scaled or priced, so must not be planned")
	}
	if resolved.Ingredients[0].MissingInformation == nil {
		t.Fatal("the line itself should say why it is incomplete")
	}
}

func TestResolveIgnoresOptionalAndToTasteLines(t *testing.T) {
	optional := namedLine(2, "gochujang", nil)
	optional.IsOptional = true
	toTaste := namedLine(3, "flaky salt", nil)
	toTaste.IsToTaste = true

	recipe := importedRecipe(namedLine(1, "White Rice", qty(1)), optional, toTaste)

	resolved := ResolveAgainstCatalog(recipe, resolveCatalog())

	if len(resolved.MissingInformation) != 0 {
		t.Fatalf("missingInformation = %v; optional and to-taste lines are never bought or scaled",
			resolved.MissingInformation)
	}
	if !resolved.BaseMealPlanEligible {
		t.Fatal("optional and to-taste lines must not hold a recipe back")
	}
}

func TestResolveRequiresServings(t *testing.T) {
	recipe := importedRecipe(namedLine(1, "White Rice", qty(1)))
	recipe.Servings = nil

	resolved := ResolveAgainstCatalog(recipe, resolveCatalog())

	if !mentionsNote(resolved.MissingInformation, MissingServings) {
		t.Fatalf("missingInformation = %v, want a %s note", resolved.MissingInformation, MissingServings)
	}
	if resolved.BaseMealPlanEligible {
		t.Fatal("a recipe with no serving count cannot be scaled to a household")
	}
}

func TestResolveDoesNotModifyTheInput(t *testing.T) {
	recipe := importedRecipe(namedLine(1, "White Rice", qty(1)))

	ResolveAgainstCatalog(recipe, resolveCatalog())

	if recipe.Ingredients[0].IngredientID != nil {
		t.Fatal("ResolveAgainstCatalog must return a copy, not edit the draft it was given")
	}
}

func TestResolveNeverAddsNutritionOrTimes(t *testing.T) {
	recipe := importedRecipe(namedLine(1, "White Rice", qty(1)))

	resolved := ResolveAgainstCatalog(recipe, resolveCatalog())

	if resolved.CaloriesKcal != nil || resolved.ProteinG != nil || resolved.TotalTimeMinutes != nil {
		t.Fatal("resolution must never invent nutrition or timing the source did not state")
	}
}

func mentionsNote(notes []string, prefix string) bool {
	for _, note := range notes {
		if strings.HasPrefix(note, prefix) {
			return true
		}
	}
	return false
}
