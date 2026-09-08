package mealprofile

import (
	"testing"

	"github.com/helpthehive/server/internal/domain/meals"
)

// Normalization applies the derived values a client is not trusted to compute,
// and nothing else. What it must never do is soften a safety rule.

func TestNormalizeTreatsABlankAllergyStrengthAsRequired(t *testing.T) {
	profile := meals.MealProfile{
		Household: meals.Household{Size: 2},
		Allergies: []meals.AllergyRequirement{{Allergen: "peanut"}},
	}

	normalize(&profile)

	if profile.Allergies[0].Strength != meals.StrengthRequired {
		t.Fatalf("strength = %q; the only thing an allergy can mean is required",
			profile.Allergies[0].Strength)
	}
}

// A blank strength is the client saying nothing. An explicitly *preferred*
// allergy is the client saying something wrong, and must be rejected rather
// than silently corrected — otherwise a client bug looks like it worked.
func TestNormalizeDoesNotRescueAnExplicitlyPreferredAllergy(t *testing.T) {
	profile := meals.MealProfile{
		Household: meals.Household{Size: 2},
		Days:      2,
		Meals:     meals.MealCounts{Dinner: 1},
		Allergies: []meals.AllergyRequirement{{Allergen: "peanut", Strength: meals.StrengthPreferred}},
	}

	normalize(&profile)

	if profile.Allergies[0].Strength != meals.StrengthPreferred {
		t.Fatal("normalize must not quietly upgrade a stated strength")
	}
	if err := profile.Validate(); err == nil {
		t.Fatal("an allergy stated as preferred must be rejected, not corrected")
	}
}

func TestNormalizeAppliesDefaultsAClientNeedNotSend(t *testing.T) {
	profile := meals.MealProfile{}

	normalize(&profile)

	if profile.Budget.Currency != "USD" {
		t.Fatalf("currency = %q, want USD", profile.Budget.Currency)
	}
	if profile.Budget.Mode != "balanced" {
		t.Fatalf("budget mode = %q, want balanced", profile.Budget.Mode)
	}
	if profile.Leftovers != "sometimes" {
		t.Fatalf("leftovers = %q, want sometimes", profile.Leftovers)
	}
	if profile.CookingTime.Strength != meals.StrengthPreferred {
		t.Fatalf("cooking time strength = %q, want preferred — a time limit is a preference unless said otherwise",
			profile.CookingTime.Strength)
	}
	if profile.Household.Size != meals.MinHouseholdSize {
		t.Fatalf("household size = %d, want %d", profile.Household.Size, meals.MinHouseholdSize)
	}
	if profile.Days != meals.MaxPlanDays {
		t.Fatalf("days = %d, want a full week by default", profile.Days)
	}
}

func TestNormalizeDeduplicatesAndTrimsLists(t *testing.T) {
	profile := meals.MealProfile{
		Household:          meals.Household{Size: 2},
		AllergyIngredients: []string{"almond", " almond ", "", "walnut"},
		Dislikes:           meals.FoodPreferences{Ingredients: []string{"olive", "olive"}},
		Equipment:          []string{"stovetop", "stovetop", "oven"},
	}

	normalize(&profile)

	if len(profile.AllergyIngredients) != 2 {
		t.Fatalf("allergy ingredients = %v, want almond and walnut once each", profile.AllergyIngredients)
	}
	if len(profile.Dislikes.Ingredients) != 1 {
		t.Fatalf("dislikes = %v, want one", profile.Dislikes.Ingredients)
	}
	if len(profile.Equipment) != 2 {
		t.Fatalf("equipment = %v, want two", profile.Equipment)
	}
}

func TestNormalizeLeavesAStatedBudgetAlone(t *testing.T) {
	profile := meals.MealProfile{
		Household: meals.Household{Size: 2},
		Budget:    meals.Budget{Amount: 85, Currency: "USD", Mode: "lowest"},
	}

	normalize(&profile)

	if profile.Budget.Amount != 85 || profile.Budget.Mode != "lowest" {
		t.Fatalf("budget = %+v, want it untouched", profile.Budget)
	}
}
