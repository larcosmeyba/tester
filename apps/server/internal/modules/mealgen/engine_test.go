package mealgen

import (
	"strings"
	"testing"

	"github.com/helpthehive/server/internal/domain/meals"
	fx "github.com/helpthehive/server/internal/testsupport/mealfixtures"
)

// What a user may eat, and which of those recipes fills each slot.
// --- Filtering ------------------------------------------------------------

func TestAllergyFilterExcludesRecipeContainingTheAllergen(t *testing.T) {
	catalog := fx.Catalog()
	request := fx.BaseRequest()
	request.Allergies = []meals.AllergyRequirement{{Allergen: "milk", Strength: meals.StrengthRequired}}

	creamy := fx.Recipe("creamy", 4, []string{"dinner"}, fx.Line(1, "milk", 1), fx.Line(2, "rice", 1))
	plain := fx.Recipe("plain", 4, []string{"dinner"}, fx.Line(1, "rice", 1), fx.Line(2, "beans", 1))

	eligible := EligibleRecipes([]meals.Recipe{creamy, plain}, request, catalog)
	if len(eligible) != 1 || eligible[0].ID != "plain" {
		t.Fatalf("eligible = %v, want only the recipe without milk", ids(eligible))
	}
}

func TestAllergyFilterFollowsIngredientParents(t *testing.T) {
	catalog := fx.Catalog()
	request := fx.BaseRequest()
	// The user named "almond"; the recipe uses sliced almonds, a child of it.
	request.AllergyIngredients = []string{"almond"}

	nutty := fx.Recipe("nutty", 4, []string{"dinner"}, fx.Line(1, "almond_sliced", 0.5), fx.Line(2, "rice", 1))
	if !ViolatesAllergy(nutty, request, catalog) {
		t.Fatal("a child of a named allergy ingredient must be excluded")
	}
}

func TestAllergyFilterExcludesUnidentifiableIngredients(t *testing.T) {
	catalog := fx.Catalog()
	request := fx.BaseRequest()
	request.Allergies = []meals.AllergyRequirement{{Allergen: "peanut", Strength: meals.StrengthRequired}}

	// A line the catalogue cannot identify cannot be cleared as safe.
	mystery := fx.Recipe("mystery", 4, []string{"dinner"}, meals.RecipeIngredient{Position: 1, RawText: "sauce"})
	if !ViolatesAllergy(mystery, request, catalog) {
		t.Fatal("an unresolved ingredient must never be assumed safe")
	}
}

func TestRequiredDietExcludesButPreferredDietDoesNot(t *testing.T) {
	catalog := fx.Catalog()
	meaty := fx.Recipe("meaty", 4, []string{"dinner"}, fx.Line(1, "chicken", 1), fx.Line(2, "rice", 1))

	required := fx.BaseRequest()
	required.DietaryRequirements = []meals.DietRequirement{{Diet: "vegan", Strength: meals.StrengthRequired}}
	if !ViolatesDiet(meaty, required, catalog) {
		t.Fatal("a required vegan diet must exclude a recipe containing chicken")
	}

	preferred := fx.BaseRequest()
	preferred.DietaryRequirements = []meals.DietRequirement{{Diet: "vegan", Strength: meals.StrengthPreferred}}
	if ViolatesDiet(meaty, preferred, catalog) {
		t.Fatal("a preferred diet is a ranking signal, not an exclusion")
	}
}

func TestEquipmentAndTimeFilters(t *testing.T) {
	request := fx.BaseRequest()
	grilled := fx.Recipe("grilled", 4, []string{"dinner"}, fx.Line(1, "chicken", 1))
	grilled.EquipmentRequired = []string{"grill"}
	if !ViolatesEquipment(grilled, request) {
		t.Fatal("a recipe needing equipment the user does not have must be excluded")
	}

	slow := fx.Recipe("slow", 4, []string{"dinner"}, fx.Line(1, "rice", 1))
	minutes := 120
	slow.TotalTimeMinutes = &minutes

	limit := 30
	preferred := fx.BaseRequest()
	preferred.CookingTime = meals.CookingTime{MaxMinutes: &limit, Strength: meals.StrengthPreferred}
	if ViolatesTime(slow, preferred) {
		t.Fatal("a preferred time limit must not exclude anything")
	}

	required := fx.BaseRequest()
	required.CookingTime = meals.CookingTime{MaxMinutes: &limit, Strength: meals.StrengthRequired}
	if !ViolatesTime(slow, required) {
		t.Fatal("a required time limit must exclude a recipe that is too slow")
	}
}

func TestIneligibleRecipesAreNeverPlanned(t *testing.T) {
	catalog := fx.Catalog()
	incomplete := fx.Recipe("incomplete", 4, []string{"dinner"}, fx.Line(1, "rice", 1))
	incomplete.BaseMealPlanEligible = false

	if got := EligibleRecipes([]meals.Recipe{incomplete}, fx.BaseRequest(), catalog); len(got) != 0 {
		t.Fatalf("eligible = %v, want none: an incomplete recipe stays viewable but is never planned", ids(got))
	}
}

// --- Planning -------------------------------------------------------------

func TestPlannerFillsRequestedSlotsAndPricesTheWeek(t *testing.T) {
	catalog := fx.Catalog()
	request := fx.BaseRequest()

	pool := []meals.Recipe{
		fx.Recipe("a", 4, []string{"dinner"}, fx.Line(1, "rice", 1)),
		fx.Recipe("b", 4, []string{"dinner"}, fx.Line(1, "beans", 1)),
	}
	plan := NewPlanner(catalog).Build(request, pool, "plan-1")

	if len(plan.Meals) != 2 {
		t.Fatalf("meals = %d, want 2", len(plan.Meals))
	}
	if plan.Meals[0].Slot != (meals.Slot{Day: 1, MealType: "dinner"}) {
		t.Fatalf("first slot = %+v, want day 1 dinner", plan.Meals[0].Slot)
	}
	if plan.Summary.MealsPlanned != 2 || plan.Summary.HouseholdSize != 4 {
		t.Fatalf("summary = %+v", plan.Summary)
	}
	if plan.Summary.EstimatedCost.Point <= 0 {
		t.Fatalf("estimated cost = %+v, want a priced basket", plan.Summary.EstimatedCost)
	}
}

func TestPlannerIsDeterministic(t *testing.T) {
	catalog := fx.Catalog()
	request := fx.BaseRequest()
	pool := []meals.Recipe{
		fx.Recipe("b", 4, []string{"dinner"}, fx.Line(1, "rice", 1)),
		fx.Recipe("a", 4, []string{"dinner"}, fx.Line(1, "rice", 1)),
	}

	first := NewPlanner(catalog).Build(request, pool, "plan-1")
	second := NewPlanner(catalog).Build(request, reverse(pool), "plan-2")

	for i := range first.Meals {
		if first.Meals[i].RecipeID != second.Meals[i].RecipeID {
			t.Fatalf("same request produced different weeks: %v vs %v",
				mealIDs(first.Meals), mealIDs(second.Meals))
		}
	}
}

func TestPlannerLeavesSlotsEmptyRatherThanInventingMeals(t *testing.T) {
	catalog := fx.Catalog()
	request := fx.BaseRequest()
	request.Meals = meals.MealCounts{Dinner: 2, Breakfast: 2}

	// Nothing in the pool is a breakfast.
	pool := []meals.Recipe{fx.Recipe("a", 4, []string{"dinner"}, fx.Line(1, "rice", 1))}
	plan := NewPlanner(catalog).Build(request, pool, "plan-1")

	for _, meal := range plan.Meals {
		if meal.Slot.MealType == "breakfast" {
			t.Fatal("a breakfast slot was filled with a recipe that is not a breakfast")
		}
	}
	if plan.Status != "partial" {
		t.Fatalf("status = %q, want partial when slots could not be filled", plan.Status)
	}
}

func TestNoLeftoversMeansNoRepeatedRecipe(t *testing.T) {
	catalog := fx.Catalog()
	request := fx.BaseRequest()
	request.Leftovers = "no"
	request.Meals = meals.MealCounts{Dinner: 2}

	pool := []meals.Recipe{
		fx.Recipe("a", 4, []string{"dinner"}, fx.Line(1, "rice", 1)),
		fx.Recipe("b", 4, []string{"dinner"}, fx.Line(1, "beans", 1)),
	}
	plan := NewPlanner(catalog).Build(request, pool, "plan-1")

	if len(plan.Meals) != 2 || plan.Meals[0].RecipeID == plan.Meals[1].RecipeID {
		t.Fatalf("meals = %v, want two different recipes", mealIDs(plan.Meals))
	}
}

func TestHeadroomIsMeasuredAgainstTheUpperBound(t *testing.T) {
	catalog := fx.Catalog()
	request := fx.BaseRequest()
	request.Budget = meals.Budget{Amount: 100, Currency: "USD", Mode: "balanced"}

	pool := []meals.Recipe{fx.Recipe("a", 4, []string{"dinner"}, fx.Line(1, "rice", 1))}
	plan := NewPlanner(catalog).Build(request, pool, "plan-1")

	if plan.Summary.Headroom == nil || plan.Summary.Budget == nil {
		t.Fatal("a plan with a budget must report headroom")
	}
	want := meals.RoundCents(100 - plan.Summary.EstimatedCost.High)
	if *plan.Summary.Headroom != want {
		t.Fatalf("headroom = %v, want %v (budget minus the range's high end)", *plan.Summary.Headroom, want)
	}
}

func TestDeterministicMessageQuotesOnlyComputedNumbers(t *testing.T) {
	catalog := fx.Catalog()
	pool := []meals.Recipe{fx.Recipe("a", 4, []string{"dinner"}, fx.Line(1, "rice", 1))}
	plan := NewPlanner(catalog).Build(fx.BaseRequest(), pool, "plan-1")

	message := DeterministicMessage(plan)
	if message == "" {
		t.Fatal("a plan must always come with a message")
	}
	if !mentions([]string{message}, "estimated") {
		t.Fatalf("message = %q, want costs described as estimates", message)
	}
}

func ids(recipes []meals.Recipe) []string {
	out := make([]string, 0, len(recipes))
	for _, recipe := range recipes {
		out = append(out, recipe.ID)
	}
	return out
}

func mealIDs(planned []meals.PlannedMeal) []string {
	out := make([]string, 0, len(planned))
	for _, meal := range planned {
		out = append(out, meal.RecipeID)
	}
	return out
}

func mentions(values []string, substring string) bool {
	for _, value := range values {
		if strings.Contains(value, substring) {
			return true
		}
	}
	return false
}

func reverse(recipes []meals.Recipe) []meals.Recipe {
	out := make([]meals.Recipe, len(recipes))
	for i, recipe := range recipes {
		out[len(recipes)-1-i] = recipe
	}
	return out
}
