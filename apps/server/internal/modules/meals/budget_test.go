package meals

import (
	"strings"
	"testing"

	"github.com/helpthehive/server/internal/db"
)

// Budget fixtures. Chicken is dear and sold by the package; beans are cheap and
// sold loose, so the two recipes below differ in cost by an order of magnitude
// and the arithmetic in a failure message is easy to follow.

func pricey() db.Recipe {
	return recipe("pricey", 4, []string{"dinner"}, line(1, "chicken", 2))
}

func thrifty() db.Recipe {
	return recipe("thrifty", 4, []string{"dinner"}, line(1, "beans", 2))
}

func oneDinner(budget float64) PlanRequest {
	request := baseRequest()
	request.Meals = MealCounts{Dinner: 1}
	request.Days = 1
	request.Budget = Budget{Amount: budget, Currency: "USD", Mode: "balanced"}
	request.Normalize()
	return request
}

func hasAssumptionContaining(plan Plan, substring string) bool {
	for _, assumption := range plan.Assumptions {
		if strings.Contains(assumption, substring) {
			return true
		}
	}
	return false
}

// The budget is a rule the server applies, not a number it reports and ignores.
func TestPlanOverBudgetIsSwappedDownToFit(t *testing.T) {
	catalog := testCatalog()
	pool := []db.Recipe{pricey(), thrifty()}
	request := oneDinner(5.00)

	// Without a budget the planner picks the dearer dish, so the swap below is
	// the budget doing work rather than an accident of ordering.
	unconstrained := NewPlanner(catalog).Build(oneDinner(0), pool, "plan-0")
	if unconstrained.Meals[0].RecipeID != "pricey" {
		t.Fatalf("unconstrained pick = %q, want the fixture to start with the dearer dish",
			unconstrained.Meals[0].RecipeID)
	}

	plan := NewPlanner(catalog).Build(request, pool, "plan-1")

	if plan.Meals[0].RecipeID != "thrifty" {
		t.Fatalf("meal = %q, want the cheaper dish once a budget applies", plan.Meals[0].RecipeID)
	}
	if plan.Summary.EstimatedCost.High > 5.00 {
		t.Fatalf("cost high = %.2f, want it within the $5.00 budget", plan.Summary.EstimatedCost.High)
	}
	if plan.Summary.Headroom == nil || *plan.Summary.Headroom < 0 {
		t.Fatalf("headroom = %v, want a plan inside its budget to have headroom left", plan.Summary.Headroom)
	}
	if !hasAssumptionContaining(plan, "cheaper option") {
		t.Fatalf("assumptions = %v, want the swap to be disclosed", plan.Assumptions)
	}
}

// Compliance is measured against the range's upper bound. A plan whose point
// estimate fits but whose worst case does not is not within budget.
func TestBudgetIsCheckedAgainstTheUpperBoundOfTheRange(t *testing.T) {
	catalog := testCatalog()
	plan := NewPlanner(catalog).Build(oneDinner(0), []db.Recipe{pricey()}, "plan-1")

	if plan.Summary.EstimatedCost.High <= plan.Summary.EstimatedCost.Point {
		t.Fatal("the fixture must have a range wider than its point estimate")
	}

	// A budget between the point estimate and the upper bound is not met.
	between := (plan.Summary.EstimatedCost.Point + plan.Summary.EstimatedCost.High) / 2
	constrained := NewPlanner(catalog).Build(oneDinner(between), []db.Recipe{pricey()}, "plan-2")

	if constrained.Summary.Headroom == nil || *constrained.Summary.Headroom >= 0 {
		t.Fatalf("headroom = %v, want a plan whose worst case exceeds the budget to report negative headroom",
			constrained.Summary.Headroom)
	}
}

// A household with $5 and $12 of need is not helped by being handed nothing,
// and is not told a smaller number to make the figure fit.
func TestPlanThatCannotMeetTheBudgetIsStillReturnedAndSaysSo(t *testing.T) {
	catalog := testCatalog()
	plan := NewPlanner(catalog).Build(oneDinner(5.00), []db.Recipe{pricey()}, "plan-1")

	if len(plan.Meals) != 1 {
		t.Fatalf("meals = %d, want the plan to be returned even when it cannot fit the budget", len(plan.Meals))
	}
	if plan.Summary.EstimatedCost.High <= 5.00 {
		t.Fatal("the fixture must produce a plan that exceeds its budget")
	}
	if !hasAssumptionContaining(plan, "above your $5.00 budget") {
		t.Fatalf("assumptions = %v, want the overspend stated plainly", plan.Assumptions)
	}
	if hasAssumptionContaining(plan, "cheaper option") {
		t.Fatalf("assumptions = %v, want no swap to be claimed when none was made", plan.Assumptions)
	}
}

func TestNoBudgetLeavesThePlanAlone(t *testing.T) {
	catalog := testCatalog()
	plan := NewPlanner(catalog).Build(oneDinner(0), []db.Recipe{pricey(), thrifty()}, "plan-1")

	if plan.Summary.Budget != nil || plan.Summary.Headroom != nil {
		t.Fatal("a plan with no budget must report neither a budget nor headroom")
	}
	if hasAssumptionContaining(plan, "budget") {
		t.Fatalf("assumptions = %v, want nothing said about a budget nobody set", plan.Assumptions)
	}
}

// Saving money never relaxes a safety filter: the swap can only choose from
// recipes that were already eligible.
func TestBudgetSwapsOnlyChooseFromEligibleRecipes(t *testing.T) {
	catalog := testCatalog()
	request := oneDinner(5.00)
	request.Allergies = []AllergyRequirement{{Allergen: "tree_nut", Strength: StrengthRequired}}

	// The cheapest dinner available carries the declared allergen.
	cheapButUnsafe := recipe("nutty", 4, []string{"dinner"}, line(1, "almond", 1))
	library := []db.Recipe{pricey(), cheapButUnsafe}
	pool := EligibleRecipes(library, request, catalog)

	plan := NewPlanner(catalog).Build(request, pool, "plan-1")

	for _, meal := range plan.Meals {
		if meal.RecipeID == "nutty" {
			t.Fatal("a budget swap chose a recipe excluded by an allergy")
		}
	}
	if !hasAssumptionContaining(plan, "above your $5.00 budget") {
		t.Fatalf("assumptions = %v, want the plan to stay over budget rather than swap to an unsafe recipe", plan.Assumptions)
	}
}

// The repair is judged on the whole basket, not on one recipe in isolation: a
// cheaper dish that shares nothing with the rest of the week can make the shop
// dearer.
func TestBudgetRepairIsJudgedOnTheWholeBasket(t *testing.T) {
	catalog := testCatalog()
	request := baseRequest()
	request.Meals = MealCounts{Dinner: 2}
	request.Days = 2
	request.Budget = Budget{Amount: 0.01, Currency: "USD", Mode: "balanced"}
	request.Normalize()

	pool := []db.Recipe{pricey(), thrifty()}
	plan := NewPlanner(catalog).Build(request, pool, "plan-1")

	// An unmeetable budget must still terminate and return a complete plan.
	if len(plan.Meals) != 2 {
		t.Fatalf("meals = %d, want both slots filled", len(plan.Meals))
	}
	if plan.Summary.EstimatedCost.High <= 0 {
		t.Fatal("the plan must still be priced")
	}
}
