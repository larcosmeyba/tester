package mealgen

import (
	"testing"

	"github.com/helpthehive/server/internal/domain/meals"
	fx "github.com/helpthehive/server/internal/testsupport/mealfixtures"
)

// Pantry reuse.
//
// What a user already owns should change which recipes get planned and what
// ends up being bought — but it must never change what they are allowed to eat.

func TestPantryIngredientsRankARecipeHigher(t *testing.T) {
	catalog := fx.Catalog()
	request := fx.BaseRequest()

	usesPantry := fx.Recipe("rice-beans", 4, []string{"dinner"}, fx.Line(1, "rice", 1), fx.Line(2, "beans", 1))
	usesNothing := fx.Recipe("chicken-milk", 4, []string{"dinner"}, fx.Line(1, "chicken", 1), fx.Line(2, "milk", 1))

	empty := meals.Set()
	stocked := meals.Set("rice", "beans")

	if Score(usesPantry, request, catalog, stocked) <= Score(usesPantry, request, catalog, empty) {
		t.Fatal("owning a recipe's ingredients should raise its score")
	}
	if Score(usesPantry, request, catalog, stocked) <= Score(usesNothing, request, catalog, stocked) {
		t.Fatal("a recipe the user can already mostly cook should outrank one they cannot")
	}
}

// "Use what I have" is a stated preference, and it should weigh more heavily
// than the pantry does by default.
func TestUseWhatIHaveIncreasesThePantryWeight(t *testing.T) {
	catalog := fx.Catalog()
	stocked := meals.Set("rice", "beans")
	recipe := fx.Recipe("rice-beans", 4, []string{"dinner"}, fx.Line(1, "rice", 1), fx.Line(2, "beans", 1))

	plain := fx.BaseRequest()
	preferred := fx.BaseRequest()
	preferred.CookingStyle = []string{"use_what_i_have"}

	if Score(recipe, preferred, catalog, stocked) <= Score(recipe, plain, catalog, stocked) {
		t.Fatal("asking to use what is on hand should weigh the pantry more heavily")
	}
}

func TestPlannerRecordsWhichPantryItemsAMealUsed(t *testing.T) {
	catalog := fx.Catalog()
	request := fx.BaseRequest()
	request.Meals = meals.MealCounts{Dinner: 1}
	request.Days = 1
	request.PantryItems = []string{"rice"}

	recipe := fx.Recipe("rice-beans", 4, []string{"dinner"}, fx.Line(1, "rice", 1), fx.Line(2, "beans", 1))
	plan := NewPlanner(catalog).Build(request, []meals.Recipe{recipe}, "plan-1")

	if len(plan.Meals) != 1 {
		t.Fatalf("meals = %d, want 1", len(plan.Meals))
	}
	used := plan.Meals[0].PantryIngredientsUsed
	if len(used) != 1 || used[0] != "rice" {
		t.Fatalf("pantry used = %v, want [rice]", used)
	}
	if len(plan.Summary.PantryItemsUsed) != 1 {
		t.Fatalf("summary pantry items = %v, want the one that was used", plan.Summary.PantryItemsUsed)
	}
	if plan.Summary.PantryValueUsed == nil || *plan.Summary.PantryValueUsed <= 0 {
		t.Fatal("the plan should report what the pantry contributed")
	}
}

// The rule that matters most: a pantry item can change what is bought, and can
// never make an unsafe recipe eligible.
func TestPantryCannotOverrideAnAllergy(t *testing.T) {
	catalog := fx.Catalog()
	request := fx.BaseRequest()
	request.Allergies = []meals.AllergyRequirement{{Allergen: "milk", Strength: meals.StrengthRequired}}
	// The user has milk in the pantry; they are still allergic to it.
	request.PantryItems = []string{"milk", "rice"}

	creamy := fx.Recipe("creamy", 4, []string{"dinner"}, fx.Line(1, "milk", 1), fx.Line(2, "rice", 1))
	plain := fx.Recipe("plain", 4, []string{"dinner"}, fx.Line(1, "rice", 1), fx.Line(2, "beans", 1))

	eligible := EligibleRecipes([]meals.Recipe{creamy, plain}, request, catalog)

	if len(eligible) != 1 || eligible[0].ID != "plain" {
		t.Fatalf("eligible = %v; owning an allergen must never make it safe to plan", ids(eligible))
	}
}

func TestPantryReducesWhatMustBeBought(t *testing.T) {
	catalog := fx.Catalog()
	request := fx.BaseRequest()
	request.Meals = meals.MealCounts{Dinner: 1}
	request.Days = 1

	recipe := fx.Recipe("rice-beans", 4, []string{"dinner"}, fx.Line(1, "rice", 1), fx.Line(2, "beans", 1))

	without := NewPlanner(catalog).Build(request, []meals.Recipe{recipe}, "plan-1")

	request.PantryItems = []string{"rice"}
	with := NewPlanner(catalog).Build(request, []meals.Recipe{recipe}, "plan-2")

	if with.Summary.EstimatedCost.Point >= without.Summary.EstimatedCost.Point {
		t.Fatalf("cost with pantry = %v, without = %v; owning an ingredient should cost less",
			with.Summary.EstimatedCost.Point, without.Summary.EstimatedCost.Point)
	}
}
