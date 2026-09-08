package db

import (
	"encoding/json"
	"strings"
	"testing"

	"github.com/helpthehive/server/internal/domain/meals"
)

func fullDraft() meals.Recipe {
	owner := "user_1"
	description := "A fast lentil dal."
	sourceURL := "https://youtu.be/abc"
	sourceName := "Hive Kitchen"
	attribution := "Adapted from \"Dal\" by Hive Kitchen"
	servings := 4.0
	prep, cook, total := 5, 15, 20
	cuisine := "Indian"
	difficulty := 2
	quantity := 200.0
	unit := "g"
	grams := 200.0
	ingredientID := "ing_lentils"
	displayName := "red lentils"
	preparation := "rinsed"
	note := "The video never stated a quantity for this ingredient."
	minutes := 15
	basis := "stated_by_source"
	confidence := "medium"
	calories := 410.0

	return meals.Recipe{
		ID:                  "recipe_1",
		OwnerUserID:         &owner,
		Title:               "Weeknight Dal",
		Description:         &description,
		SourceType:          "video_import",
		SourceURL:           &sourceURL,
		SourceName:          &sourceName,
		AttributionText:     &attribution,
		Visibility:          "private",
		ReviewStatus:        "draft",
		Servings:            &servings,
		ServingsConfidence:  "source",
		Scalable:            true,
		PrepTimeMinutes:     &prep,
		CookTimeMinutes:     &cook,
		TotalTimeMinutes:    &total,
		TimeConfidence:      "source",
		MealTypes:           []string{"dinner"},
		Cuisine:             &cuisine,
		Difficulty:          &difficulty,
		EquipmentRequired:   []string{"stovetop"},
		Tags:                []string{"one_pot"},
		CaloriesKcal:        &calories,
		NutritionBasis:      &basis,
		NutritionConfidence: &confidence,
		Ingredients: []meals.RecipeIngredient{
			{
				Position: 1, RawText: "200g red lentils", DisplayName: &displayName,
				Quantity: &quantity, Unit: &unit, Preparation: &preparation,
				IngredientID: &ingredientID, Grams: &grams,
			},
			{Position: 2, RawText: "salt to taste", IsToTaste: true},
			{Position: 3, RawText: "a splash of oil", MissingInformation: &note},
		},
		Instructions: []meals.RecipeInstruction{
			{Step: 1, Text: "Soften the onion."},
			{Step: 2, Text: "Simmer the lentils.", Minutes: &minutes},
		},
		BaseMealPlanEligible: false,
		MissingInformation:   []string{"ingredient_quantities"},
	}
}

func TestDraftSurvivesARoundTrip(t *testing.T) {
	original := fullDraft()

	encoded, err := encodeRecipeDraft(original)
	if err != nil {
		t.Fatalf("encodeRecipeDraft: %v", err)
	}
	decoded, err := decodeRecipeDraft(encoded)
	if err != nil {
		t.Fatalf("decodeRecipeDraft: %v", err)
	}

	if decoded.Title != original.Title || decoded.ID != original.ID {
		t.Errorf("identity changed: %q %q", decoded.ID, decoded.Title)
	}
	if decoded.BaseMealPlanEligible != original.BaseMealPlanEligible {
		t.Error("plannability changed across storage")
	}
	if len(decoded.MissingInformation) != 1 {
		t.Errorf("missingInformation = %v", decoded.MissingInformation)
	}
	if len(decoded.Ingredients) != 3 || len(decoded.Instructions) != 2 {
		t.Fatalf("children lost: %d ingredients, %d instructions",
			len(decoded.Ingredients), len(decoded.Instructions))
	}

	// The three cases that must never blur into one another.
	if decoded.Ingredients[0].Quantity == nil || *decoded.Ingredients[0].Quantity != 200 {
		t.Error("a stated quantity was lost")
	}
	if decoded.Ingredients[0].Grams == nil || *decoded.Ingredients[0].Grams != 200 {
		t.Error("computed grams were lost")
	}
	if decoded.Ingredients[0].IngredientID == nil {
		t.Error("the resolved ingredient id was lost")
	}
	if !decoded.Ingredients[1].IsToTaste || decoded.Ingredients[1].MissingInformation != nil {
		t.Error("\"to taste\" did not survive as complete")
	}
	if decoded.Ingredients[2].Quantity != nil || decoded.Ingredients[2].MissingInformation == nil {
		t.Error("an unstated quantity did not survive as missing")
	}

	// Every line must know its recipe, even though that is not stored twice.
	for _, line := range decoded.Ingredients {
		if line.RecipeID != original.ID {
			t.Errorf("line.RecipeID = %q, want %q", line.RecipeID, original.ID)
		}
	}
	for _, step := range decoded.Instructions {
		if step.RecipeID != original.ID {
			t.Errorf("step.RecipeID = %q", step.RecipeID)
		}
	}
	if decoded.Instructions[0].Minutes != nil {
		t.Error("a step with no stated duration gained one")
	}
}

func TestAbsentNutritionStaysAbsent(t *testing.T) {
	draft := fullDraft()
	draft.CaloriesKcal, draft.NutritionBasis, draft.NutritionConfidence = nil, nil, nil

	encoded, err := encodeRecipeDraft(draft)
	if err != nil {
		t.Fatalf("encodeRecipeDraft: %v", err)
	}
	decoded, err := decodeRecipeDraft(encoded)
	if err != nil {
		t.Fatalf("decodeRecipeDraft: %v", err)
	}

	if decoded.CaloriesKcal != nil || decoded.NutritionBasis != nil {
		t.Error("nutrition appeared from a draft that had none")
	}
	// A null must not be stored as a zero: 0 kcal is a claim, absent is not.
	if strings.Contains(string(encoded), "calories_kcal") {
		t.Error("absent nutrition was written as a field rather than omitted")
	}
}

// The stored shape is a contract between deployments. It must be tags, not Go
// field names, or an ordinary refactor silently orphans drafts in flight.
func TestStoredDraftUsesStableFieldNames(t *testing.T) {
	encoded, err := encodeRecipeDraft(fullDraft())
	if err != nil {
		t.Fatalf("encodeRecipeDraft: %v", err)
	}

	var envelope map[string]any
	if err := json.Unmarshal(encoded, &envelope); err != nil {
		t.Fatalf("stored draft is not an object: %v", err)
	}
	if envelope["version"] != float64(recipeDraftVersion) {
		t.Errorf("version = %v, want %d", envelope["version"], recipeDraftVersion)
	}

	recipe, ok := envelope["recipe"].(map[string]any)
	if !ok {
		t.Fatal("no recipe in the envelope")
	}
	for _, field := range []string{
		"id", "title", "source_type", "base_meal_plan_eligible",
		"missing_information", "ingredients", "instructions",
	} {
		if _, present := recipe[field]; !present {
			t.Errorf("stored draft is missing %q", field)
		}
	}
	// Go field names must not appear: their presence would mean the struct is
	// the storage contract again.
	for _, leaked := range []string{"BaseMealPlanEligible", "MissingInformation", "Title"} {
		if _, present := recipe[leaked]; present {
			t.Errorf("Go field name %q leaked into storage", leaked)
		}
	}
}

// Reading a shape we do not know would produce a wrong recipe that the user
// then saves. Refusing is the safe failure.
func TestAnUnknownDraftVersionIsRefused(t *testing.T) {
	payload := []byte(`{"version":99,"recipe":{"id":"r1","title":"From the future"}}`)

	if _, err := decodeRecipeDraft(payload); err == nil {
		t.Fatal("a future draft version was accepted")
	}
}

func TestMalformedDraftJSONIsRefused(t *testing.T) {
	if _, err := decodeRecipeDraft([]byte(`{not json`)); err == nil {
		t.Fatal("malformed JSON was accepted")
	}
}
