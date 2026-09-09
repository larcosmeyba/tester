package graphql

import (
	"testing"
	"time"

	"github.com/helpthehive/server/internal/domain/meals"
	"github.com/helpthehive/server/internal/graphql/model"
)

// Mapping between the domain and the wire, for the meal profile and meal prep.
//
// These tests exist because the mapping is where a value quietly changes
// meaning: a missing budget becoming zero, a nil list becoming null, an
// allergy strength being softened on its way out.

func TestMealProfileModelReportsNoBudgetAsNull(t *testing.T) {
	profile := meals.MealProfile{
		Household: meals.Household{Size: 3},
		Meals:     meals.MealCounts{Dinner: 4},
		Days:      4,
		UpdatedAt: time.Now(),
	}

	got := mealProfileModel(profile)

	if got.Budget != nil {
		t.Fatalf("budget = %+v; no budget must be null, not zero — a plan is only measured against a budget the user gave", got.Budget)
	}
}

func TestMealProfileModelKeepsListsNonNull(t *testing.T) {
	got := mealProfileModel(meals.MealProfile{Household: meals.Household{Size: 1}, UpdatedAt: time.Now()})

	if got.Allergies == nil || got.DietaryRequirements == nil || got.NutritionGoals == nil {
		t.Fatal("list fields are non-null in the schema and must never encode as null")
	}
	if got.Likes.Ingredients == nil || got.Dislikes.Cuisines == nil || got.AllergyIngredients == nil {
		t.Fatal("empty preference lists must encode as [], not null")
	}
	if got.Equipment == nil || got.CookingStyle == nil {
		t.Fatal("empty enum lists must encode as [], not null")
	}
}

func TestMealProfileRoundTripsAnAllergy(t *testing.T) {
	input := model.MealProfileInput{
		Household: &model.HouseholdInput{Size: 2},
		Meals:     &model.MealCountsInput{Dinner: 3},
		Days:      3,
		Allergies: []*model.AllergyRequirementInput{
			{Allergen: model.AllergenPeanut, Strength: model.StrengthRequired},
		},
		AllergyIngredients:   []string{"almond"},
		DietaryRequirements:  []*model.DietRequirementInput{},
		NutritionPreferences: []*model.NutritionPreferenceInput{},
		Likes:                &model.FoodPreferencesInput{},
		Dislikes:             &model.FoodPreferencesInput{},
		CookingTime:          &model.CookingTimeInput{Strength: model.StrengthPreferred},
		Equipment:            []model.Equipment{model.EquipmentStovetop},
		CookingStyle:         []model.CookingStyle{},
		Leftovers:            model.LeftoversPreferenceSometimes,
	}

	profile := mealProfileFromInput(input)

	if len(profile.Allergies) != 1 || profile.Allergies[0].Allergen != "peanut" {
		t.Fatalf("allergies = %v, want the peanut allergy carried across", profile.Allergies)
	}
	if profile.Allergies[0].Strength != meals.StrengthRequired {
		t.Fatalf("strength = %q, want it preserved exactly", profile.Allergies[0].Strength)
	}
	if len(profile.AllergyIngredients) != 1 || profile.AllergyIngredients[0] != "almond" {
		t.Fatalf("allergy ingredients = %v, want almond", profile.AllergyIngredients)
	}

	back := mealProfileModel(profile)
	if len(back.Allergies) != 1 || back.Allergies[0].Allergen != model.AllergenPeanut {
		t.Fatalf("round trip lost the allergy: %+v", back.Allergies)
	}
}

func TestMealPrepPlanModelKeepsAMissingPortionNull(t *testing.T) {
	plan := meals.PrepPlan{
		ID:         "prep-1",
		MealPlanID: "plan-1",
		Tasks: []meals.PrepTask{{
			ID:          "task-1",
			Position:    1,
			Kind:        meals.PrepBatchIngredient,
			Title:       "Prep onions",
			Instruction: "The recipes did not say how much.",
			Storage:     meals.StorageRefrigerate,
		}},
	}

	got := mealPrepPlanModel(plan)

	if got.Tasks[0].PortionAmount != nil {
		t.Fatal("a portion the recipes never stated must stay null on the wire")
	}
	if got.Tasks[0].IngredientIds == nil || got.Tasks[0].RecipeIds == nil || got.Tasks[0].ServesSlots == nil {
		t.Fatal("non-null list fields must encode as [], not null")
	}
	if got.Tasks[0].Kind != model.MealPrepTaskKindBatchIngredient {
		t.Fatalf("kind = %q, want batch_ingredient", got.Tasks[0].Kind)
	}
}
