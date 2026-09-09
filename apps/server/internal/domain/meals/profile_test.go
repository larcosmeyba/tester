package meals

import "testing"

// The profile fills in a request; it never overrides one.
//
// That single rule is what makes it safe to apply a stored answer to a request
// the client built, so each test here is one way it could be broken.

func savedProfile() MealProfile {
	minutes := 30
	return MealProfile{
		UserID:             "user-1",
		Household:          Household{Size: 4},
		Budget:             Budget{Amount: 120, Currency: "USD", Mode: "balanced"},
		Meals:              MealCounts{Dinner: 5},
		Days:               5,
		Diets:              []DietRequirement{{Diet: "vegetarian", Strength: StrengthRequired}},
		Allergies:          []AllergyRequirement{{Allergen: "peanut", Strength: StrengthRequired}},
		AllergyIngredients: []string{"almond"},
		NutritionGoals:     []NutritionPreference{{Goal: "high_protein", Strength: StrengthPreferred}},
		Likes:              FoodPreferences{Cuisines: []string{"italian"}},
		Dislikes:           FoodPreferences{Ingredients: []string{"olive"}},
		CookingTime:        CookingTime{MaxMinutes: &minutes, Strength: StrengthPreferred},
		Equipment:          []string{"stovetop", "oven"},
		CookingStyle:       []string{"one_pot"},
		Leftovers:          "yes",
	}
}

func TestProfileFillsAnEmptyRequest(t *testing.T) {
	request := savedProfile().ApplyTo(PlanRequest{})

	if request.Household.Size != 4 {
		t.Fatalf("household size = %d, want 4 from the profile", request.Household.Size)
	}
	if request.Budget.Amount != 120 {
		t.Fatalf("budget = %v, want the saved 120 — the budget must reach the planner", request.Budget.Amount)
	}
	if len(request.Allergies) != 1 || request.Allergies[0].Allergen != "peanut" {
		t.Fatalf("allergies = %v, want the saved peanut allergy", request.Allergies)
	}
	if request.Leftovers != "yes" {
		t.Fatalf("leftovers = %q, want yes", request.Leftovers)
	}
}

func TestProfileNeverOverridesWhatTheClientSaid(t *testing.T) {
	stated := PlanRequest{
		Household: Household{Size: 2},
		Meals:     MealCounts{Breakfast: 3},
		Days:      3,
		Budget:    Budget{Amount: 40, Currency: "USD", Mode: "lowest"},
		Leftovers: "no",
	}

	request := savedProfile().ApplyTo(stated)

	if request.Household.Size != 2 {
		t.Fatalf("household size = %d, want the request's own 2", request.Household.Size)
	}
	if request.Days != 3 {
		t.Fatalf("days = %d, want the request's own 3", request.Days)
	}
	if request.Budget.Amount != 40 {
		t.Fatalf("budget = %v, want the request's own 40", request.Budget.Amount)
	}
	if request.Meals.Breakfast != 3 || request.Meals.Dinner != 0 {
		t.Fatalf("meals = %+v, want only the breakfasts the request asked for", request.Meals)
	}
	if request.Leftovers != "no" {
		t.Fatalf("leftovers = %q, want the request's own no", request.Leftovers)
	}
}

// The important case: a user who has removed their allergies must be able to
// say so. An empty, non-nil list is an answer, and the profile must not undo it.
func TestProfileRespectsAnExplicitlyEmptyAllergyList(t *testing.T) {
	stated := PlanRequest{
		Household:           Household{Size: 2},
		Allergies:           []AllergyRequirement{},
		DietaryRequirements: []DietRequirement{},
	}

	request := savedProfile().ApplyTo(stated)

	if len(request.Allergies) != 0 {
		t.Fatalf("allergies = %v; an empty list is the user saying none, not saying nothing", request.Allergies)
	}
	if len(request.DietaryRequirements) != 0 {
		t.Fatalf("diets = %v, want the request's empty list respected", request.DietaryRequirements)
	}
}

func TestProfileValidateHoldsAnAllergyToRequired(t *testing.T) {
	profile := savedProfile()
	profile.Allergies = []AllergyRequirement{{Allergen: "peanut", Strength: StrengthPreferred}}

	if err := profile.Validate(); err == nil {
		t.Fatal("an allergy that is not required must be rejected when saved, not downgraded later")
	}
}

func TestProfileValidateAcceptsAnUnfinishedQuestionnaire(t *testing.T) {
	// No meals chosen yet is an unfinished questionnaire, not an invalid one.
	profile := MealProfile{UserID: "user-1", Household: Household{Size: 1}, Days: 7}

	if err := profile.Validate(); err != nil {
		t.Fatalf("Validate() error = %v, want a part-answered profile to be storable", err)
	}
}

func TestProfileValidateRejectsAnOutOfBoundsHousehold(t *testing.T) {
	profile := savedProfile()
	profile.Household.Size = 99

	if err := profile.Validate(); err == nil {
		t.Fatal("a household size the planner cannot honour must be rejected at save time")
	}
}
