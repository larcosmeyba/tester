package meals

import (
	"reflect"
	"testing"

	"github.com/helpthehive/server/internal/db"
)

func fullRequest() PlanRequest {
	adults, children, maxMinutes := 2, 2, 45
	other, likes, dislikes := "no pork", "spicy food", "anything slimy"

	request := PlanRequest{
		QuestionnaireVersion: "1.0",
		PlanScope:            "us",
		Household:            Household{Size: 4, Adults: &adults, Children: &children},
		Meals:                MealCounts{Breakfast: 2, Lunch: 1, Dinner: 3, Snack: 1},
		Days:                 3,
		Budget:               Budget{Amount: 120, Currency: "USD", Mode: "balanced"},
		DietaryRequirements:  []DietRequirement{{Diet: "vegetarian", Strength: StrengthRequired}},
		DietaryOtherText:     &other,
		Allergies:            []AllergyRequirement{{Allergen: "peanut", Strength: StrengthRequired}},
		AllergyIngredients:   []string{"almond"},
		NutritionPreferences: []NutritionPreference{{Goal: "high_protein", Strength: StrengthPreferred}},
		Likes:                FoodPreferences{Ingredients: []string{"rice"}, Cuisines: []string{"thai"}, FreeText: &likes},
		Dislikes:             FoodPreferences{Ingredients: []string{"beans"}, Cuisines: []string{"british"}, FreeText: &dislikes},
		CookingTime:          CookingTime{MaxMinutes: &maxMinutes, Strength: StrengthPreferred},
		Equipment:            []string{"stovetop", "oven"},
		CookingStyle:         []string{"one_pot", "meal_prep"},
		Leftovers:            "yes",
		ExcludeRecipeIDs:     []string{"recipe-1"},
	}
	request.Normalize()
	return request
}

// Everything the questionnaire collects survives a round trip. A field that
// silently fails to save is a user answering the same question every week.
func TestSavedPreferencesRoundTripEveryAnswer(t *testing.T) {
	original := fullRequest()

	restored := requestFromSaved(savedFromRequest("user-1", original))
	restored.Normalize()

	if !reflect.DeepEqual(original, restored) {
		t.Fatalf("round trip lost or changed an answer:\n got %+v\nwant %+v", restored, original)
	}
}

func TestSavedPreferencesCarryTheUserIDFromTheServer(t *testing.T) {
	saved := savedFromRequest("user-1", fullRequest())

	if saved.UserID != "user-1" {
		t.Fatalf("UserID = %q, want the viewer resolved from the token", saved.UserID)
	}
}

// The pantry is read on every generation, never from a saved copy, so a user
// who cooked with the last of the rice is not credited for it next week.
func TestSavedPreferencesDoNotStoreThePantry(t *testing.T) {
	request := fullRequest()
	request.PantryItems = []string{"rice", "beans"}

	restored := requestFromSaved(savedFromRequest("user-1", request))

	if len(restored.PantryItems) != 0 {
		t.Fatalf("PantryItems = %v, want the pantry to be read fresh rather than stored", restored.PantryItems)
	}
}

// A stored row is not trusted to have got this right. An allergy read back as a
// mere preference would be a safety filter silently downgraded to a ranking
// signal.
func TestAllergiesReadBackAsRequiredWhateverTheRowSays(t *testing.T) {
	stored := savedFromRequest("user-1", fullRequest())
	stored.Allergies = []db.StrengthPair{{Value: "peanut", Strength: StrengthPreferred}}

	restored := requestFromSaved(stored)

	if len(restored.Allergies) != 1 {
		t.Fatalf("allergies = %d, want 1", len(restored.Allergies))
	}
	if restored.Allergies[0].Strength != StrengthRequired {
		t.Fatalf("strength = %q, want %q: an allergy is never a preference",
			restored.Allergies[0].Strength, StrengthRequired)
	}
}

// Preferences that could not produce a plan are rejected where they are saved,
// not where somebody tries to cook from them.
func TestSavedPreferencesAreValidatedWithTheSameRulesAsAPlan(t *testing.T) {
	weakened := fullRequest()
	weakened.Allergies = []AllergyRequirement{{Allergen: "peanut", Strength: StrengthPreferred}}

	if err := weakened.Validate(); err == nil {
		t.Fatal("Validate() = nil, want an allergy that is not required to be rejected")
	}
}

// A new user has no preferences, which is a state the conversion must handle
// without inventing answers nobody gave.
func TestEmptyPreferencesConvertToAnEmptyRequest(t *testing.T) {
	restored := requestFromSaved(db.SavedPreferences{UserID: "user-1"})

	if len(restored.Allergies) != 0 || len(restored.DietaryRequirements) != 0 ||
		len(restored.NutritionPreferences) != 0 {
		t.Fatalf("empty preferences produced answers nobody gave: %+v", restored)
	}
	if restored.Budget.Enabled() {
		t.Fatal("an unset budget must not read as an enabled one")
	}
}
