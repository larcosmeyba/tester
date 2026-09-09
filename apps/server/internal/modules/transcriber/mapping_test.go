package transcriber

import "testing"

func minimalDraft() Draft {
	servings := 4.0
	total := 30
	return Draft{
		Title:              "Weeknight Dal",
		SourceURL:          "https://youtu.be/abc",
		Servings:           &servings,
		ServingsConfidence: "source",
		TotalTimeMinutes:   &total,
		TimeConfidence:     "source",
		Scalable:           true,
		Ingredients: []DraftIngredient{{
			Position: 1,
			RawText:  "200g red lentils",
			Quantity: ptr(200.0),
			Unit:     ptr("g"),
		}},
		Instructions:       []DraftInstruction{{Step: 1, Text: "Simmer."}},
		MissingInformation: []string{},
	}
}

func ptr[T any](v T) *T { return &v }

func TestToRecipeForcesImportsToBePrivateDrafts(t *testing.T) {
	recipe := minimalDraft().ToRecipe("recipe_1", "user_1")

	if recipe.Visibility != "private" {
		t.Errorf("visibility = %q, want private", recipe.Visibility)
	}
	if recipe.ReviewStatus != "draft" {
		t.Errorf("reviewStatus = %q, want draft", recipe.ReviewStatus)
	}
	if recipe.SourceType != "video_import" {
		t.Errorf("sourceType = %q, want video_import", recipe.SourceType)
	}
	if recipe.OwnerUserID == nil || *recipe.OwnerUserID != "user_1" {
		t.Errorf("ownerUserID = %v, want user_1", recipe.OwnerUserID)
	}
	if recipe.ID != "recipe_1" {
		t.Errorf("id = %q, want recipe_1", recipe.ID)
	}
}

func TestToRecipeLeavesIngredientIdentityToTheServer(t *testing.T) {
	recipe := minimalDraft().ToRecipe("recipe_1", "user_1")

	line := recipe.Ingredients[0]
	if line.IngredientID != nil {
		t.Errorf("ingredientID = %v, want nil: the catalogue is the server's", line.IngredientID)
	}
	if line.Grams != nil {
		t.Errorf("grams = %v, want nil: gram weights need the catalogue", line.Grams)
	}
}

func TestToRecipeNeverInventsAQuantity(t *testing.T) {
	draft := minimalDraft()
	draft.Ingredients = []DraftIngredient{{
		Position:           1,
		RawText:            "a splash of olive oil",
		Quantity:           nil,
		MissingInformation: ptr("The video never stated a quantity for this ingredient."),
	}}
	draft.MissingInformation = []string{"ingredient_quantities"}

	recipe := draft.ToRecipe("recipe_1", "user_1")

	line := recipe.Ingredients[0]
	if line.Quantity != nil {
		t.Errorf("quantity = %v, want nil", line.Quantity)
	}
	if line.MissingInformation == nil {
		t.Error("the line lost its missingInformation note")
	}
	if recipe.BaseMealPlanEligible {
		t.Error("a recipe with missing information must not be plannable")
	}
}

func TestToRecipeTreatsToTasteAsComplete(t *testing.T) {
	draft := minimalDraft()
	draft.Ingredients = append(draft.Ingredients, DraftIngredient{
		Position:  2,
		RawText:   "salt to taste",
		Quantity:  nil,
		IsToTaste: true,
	})

	recipe := draft.ToRecipe("recipe_1", "user_1")

	line := recipe.Ingredients[1]
	if !line.IsToTaste {
		t.Error("isToTaste was lost")
	}
	if line.MissingInformation != nil {
		t.Errorf("to-taste line marked missing: %q", *line.MissingInformation)
	}
	if !recipe.BaseMealPlanEligible {
		t.Error("to taste must not make a recipe unplannable")
	}
}

func TestToRecipeNeverInventsNutrition(t *testing.T) {
	recipe := minimalDraft().ToRecipe("recipe_1", "user_1")

	if recipe.CaloriesKcal != nil || recipe.ProteinG != nil || recipe.NutritionBasis != nil {
		t.Error("nutrition appeared from a draft that stated none")
	}
}

func TestToRecipeCopiesStatedNutrition(t *testing.T) {
	draft := minimalDraft()
	draft.Nutrition = &DraftNutrition{
		Basis:        "stated_by_source",
		PerServing:   true,
		CaloriesKcal: ptr(410.0),
		Confidence:   ptr("medium"),
	}

	recipe := draft.ToRecipe("recipe_1", "user_1")

	if recipe.CaloriesKcal == nil || *recipe.CaloriesKcal != 410 {
		t.Errorf("caloriesKcal = %v, want 410", recipe.CaloriesKcal)
	}
	if recipe.NutritionBasis == nil || *recipe.NutritionBasis != "stated_by_source" {
		t.Errorf("nutritionBasis = %v", recipe.NutritionBasis)
	}
	if recipe.NutritionConfidence == nil || *recipe.NutritionConfidence != "medium" {
		t.Errorf("nutritionConfidence = %v", recipe.NutritionConfidence)
	}
}

func TestToRecipeKeepsMissingConfidenceForUnstatedValues(t *testing.T) {
	draft := minimalDraft()
	draft.Servings = nil
	draft.ServingsConfidence = ""
	draft.TotalTimeMinutes = nil
	draft.TimeConfidence = ""

	recipe := draft.ToRecipe("recipe_1", "user_1")

	if recipe.ServingsConfidence != "missing" {
		t.Errorf("servingsConfidence = %q, want missing", recipe.ServingsConfidence)
	}
	if recipe.TimeConfidence != "missing" {
		t.Errorf("timeConfidence = %q, want missing", recipe.TimeConfidence)
	}
}

func TestToRecipeRejectsConfidenceOutsideTheContract(t *testing.T) {
	draft := minimalDraft()
	draft.ServingsConfidence = "very_sure"

	recipe := draft.ToRecipe("recipe_1", "user_1")

	if recipe.ServingsConfidence != "source" {
		t.Errorf("servingsConfidence = %q, want source (derived, not echoed)", recipe.ServingsConfidence)
	}
}

func TestToRecipeNumbersUnpositionedLines(t *testing.T) {
	draft := minimalDraft()
	draft.Ingredients = []DraftIngredient{{RawText: "a"}, {RawText: "b"}}
	draft.Instructions = []DraftInstruction{{Text: "one"}, {Text: "two"}}

	recipe := draft.ToRecipe("recipe_1", "user_1")

	if recipe.Ingredients[0].Position != 1 || recipe.Ingredients[1].Position != 2 {
		t.Error("ingredient positions were not assigned")
	}
	if recipe.Instructions[0].Step != 1 || recipe.Instructions[1].Step != 2 {
		t.Error("instruction steps were not assigned")
	}
	for _, line := range recipe.Ingredients {
		if line.RecipeID != "recipe_1" {
			t.Errorf("line recipeID = %q", line.RecipeID)
		}
	}
}

func TestToRecipeNeverReturnsNilSlices(t *testing.T) {
	recipe := Draft{Title: "x"}.ToRecipe("recipe_1", "user_1")

	if recipe.MealTypes == nil || recipe.Tags == nil ||
		recipe.EquipmentRequired == nil || recipe.MissingInformation == nil {
		t.Error("nil slice would serialise as null where the contract says [!]!")
	}
}
