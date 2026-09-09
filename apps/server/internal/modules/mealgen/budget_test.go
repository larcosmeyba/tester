package mealgen

import (
	"strings"
	"testing"

	"github.com/helpthehive/server/internal/domain/meals"
	fx "github.com/helpthehive/server/internal/testsupport/mealfixtures"
)

// Budget fixtures. Chicken is dear and sold by the package; beans are cheap and
// sold loose, so the two dishes differ by an order of magnitude and the
// arithmetic in a failure message is easy to follow.

func pricey() meals.Recipe {
	return fx.Recipe("pricey", 4, []string{"dinner"}, fx.Line(1, "chicken", 2))
}

func thrifty() meals.Recipe {
	return fx.Recipe("thrifty", 4, []string{"dinner"}, fx.Line(1, "beans", 2))
}

func oneDinner(budget float64) meals.PlanRequest {
	request := fx.BaseRequest()
	request.Meals = meals.MealCounts{Dinner: 1}
	request.Days = 1
	request.Budget = meals.Budget{Amount: budget, Currency: "USD", Mode: "balanced"}
	request.Normalize()
	return request
}

func assumes(plan meals.Plan, substring string) bool {
	for _, assumption := range plan.Assumptions {
		if strings.Contains(assumption, substring) {
			return true
		}
	}
	return false
}

// The budget is a rule the server applies, not a number it reports and ignores.
func TestPlanOverBudgetIsSwappedDownToFit(t *testing.T) {
	catalog := fx.Catalog()
	pool := []meals.Recipe{pricey(), thrifty()}

	// Without a budget the planner picks the dearer dish, so the swap below is
	// the budget doing work rather than an accident of ordering.
	unconstrained := NewPlanner(catalog).Build(oneDinner(0), pool, "plan-0")
	if unconstrained.Meals[0].RecipeID != "pricey" {
		t.Fatalf("unconstrained pick = %q, want the fixture to start with the dearer dish",
			unconstrained.Meals[0].RecipeID)
	}

	plan := NewPlanner(catalog).Build(oneDinner(5.00), pool, "plan-1")

	if plan.Meals[0].RecipeID != "thrifty" {
		t.Fatalf("meal = %q, want the cheaper dish once a budget applies", plan.Meals[0].RecipeID)
	}
	if plan.Summary.EstimatedCost.High > 5.00 {
		t.Fatalf("cost high = %.2f, want it within the $5.00 budget", plan.Summary.EstimatedCost.High)
	}
	if plan.Summary.Headroom == nil || *plan.Summary.Headroom < 0 {
		t.Fatalf("headroom = %v, want a plan inside its budget to have headroom left", plan.Summary.Headroom)
	}
	if !assumes(plan, "cheaper option") {
		t.Fatalf("assumptions = %v, want the swap disclosed", plan.Assumptions)
	}
}

// Compliance is measured against the range's upper bound, the same rule
// summarize uses for headroom, so the two can never disagree.
func TestBudgetIsEnforcedAgainstTheUpperBoundNotThePointEstimate(t *testing.T) {
	catalog := fx.Catalog()
	plan := NewPlanner(catalog).Build(oneDinner(0), []meals.Recipe{pricey()}, "plan-1")

	if plan.Summary.EstimatedCost.High <= plan.Summary.EstimatedCost.Point {
		t.Fatal("the fixture must produce a range wider than its point estimate")
	}

	// A budget between the point estimate and the upper bound is not met.
	between := meals.RoundCents((plan.Summary.EstimatedCost.Point + plan.Summary.EstimatedCost.High) / 2)
	constrained := NewPlanner(catalog).Build(oneDinner(between), []meals.Recipe{pricey()}, "plan-2")

	if constrained.Summary.Headroom == nil || *constrained.Summary.Headroom >= 0 {
		t.Fatalf("headroom = %v, want a plan whose worst case exceeds the budget to report negative headroom",
			constrained.Summary.Headroom)
	}
	if !assumes(constrained, "above your") {
		t.Fatalf("assumptions = %v, want the overspend stated", constrained.Assumptions)
	}
}

// A household with $5 and $12 of need is not helped by being handed nothing,
// and is not helped by a number bent to fit.
func TestPlanThatCannotMeetTheBudgetIsStillReturnedAndSaysSo(t *testing.T) {
	catalog := fx.Catalog()
	plan := NewPlanner(catalog).Build(oneDinner(5.00), []meals.Recipe{pricey()}, "plan-1")

	if len(plan.Meals) != 1 {
		t.Fatalf("meals = %d, want the plan returned even when it cannot fit the budget", len(plan.Meals))
	}
	if plan.Summary.EstimatedCost.High <= 5.00 {
		t.Fatal("the fixture must produce a plan that exceeds its budget")
	}
	if !assumes(plan, "above your $5.00 budget") {
		t.Fatalf("assumptions = %v, want the overspend stated plainly", plan.Assumptions)
	}
	if assumes(plan, "cheaper option") {
		t.Fatalf("assumptions = %v, want no swap claimed when none was made", plan.Assumptions)
	}
}

func TestNoBudgetLeavesThePlanAlone(t *testing.T) {
	catalog := fx.Catalog()
	plan := NewPlanner(catalog).Build(oneDinner(0), []meals.Recipe{pricey(), thrifty()}, "plan-1")

	if plan.Summary.Budget != nil || plan.Summary.Headroom != nil {
		t.Fatal("a plan with no budget must report neither a budget nor headroom")
	}
	if assumes(plan, "budget") {
		t.Fatalf("assumptions = %v, want nothing said about a budget nobody set", plan.Assumptions)
	}
}

// Saving money never relaxes a safety filter: a swap can only choose from the
// eligible pool, which the hard filters have already been through.
func TestBudgetSwapsOnlyChooseFromTheEligiblePool(t *testing.T) {
	catalog := fx.Catalog()
	request := oneDinner(5.00)
	request.Allergies = []meals.AllergyRequirement{{Allergen: "tree_nut", Strength: meals.StrengthRequired}}

	// The cheapest dinner available carries the declared allergen.
	cheapButUnsafe := fx.Recipe("nutty", 4, []string{"dinner"}, fx.Line(1, "almond", 1))
	pool := EligibleRecipes([]meals.Recipe{pricey(), cheapButUnsafe}, request, catalog)

	plan := NewPlanner(catalog).Build(request, pool, "plan-1")

	for _, meal := range plan.Meals {
		if meal.RecipeID == "nutty" {
			t.Fatal("a budget swap chose a recipe excluded by an allergy")
		}
	}
	if !assumes(plan, "above your $5.00 budget") {
		t.Fatalf("assumptions = %v, want the plan to stay over budget rather than swap to an unsafe recipe",
			plan.Assumptions)
	}
}

// The budget applies to the arranged plan too. A model cannot arrange its way
// past it, because the pass runs inside BuildWith rather than in one caller.
func TestBudgetAppliesToAnArrangedPlanToo(t *testing.T) {
	catalog := fx.Catalog()
	pool := []meals.Recipe{pricey(), thrifty()}
	request := oneDinner(5.00)

	// A provider that insists on the dearer dish.
	arrangement := map[meals.Slot]string{{Day: 1, MealType: "dinner"}: "pricey"}
	plan := NewPlanner(catalog).BuildWith(request, pool, "plan-1", arrangement)

	if plan.Meals[0].RecipeID != "thrifty" {
		t.Fatalf("meal = %q, want the budget to override the arrangement", plan.Meals[0].RecipeID)
	}
	if plan.Summary.EstimatedCost.High > 5.00 {
		t.Fatalf("cost high = %.2f, want it within budget", plan.Summary.EstimatedCost.High)
	}
}

// An unmeetable budget must terminate and still return a complete, priced week.
func TestUnmeetableBudgetStillReturnsACompleteWeek(t *testing.T) {
	catalog := fx.Catalog()
	request := fx.BaseRequest()
	request.Budget = meals.Budget{Amount: 0.01, Currency: "USD", Mode: "balanced"}
	request.Normalize()

	plan := NewPlanner(catalog).Build(request, []meals.Recipe{pricey(), thrifty()}, "plan-1")

	if len(plan.Meals) != 2 {
		t.Fatalf("meals = %d, want both slots filled", len(plan.Meals))
	}
	if plan.Summary.EstimatedCost.High <= 0 {
		t.Fatal("the plan must still be priced")
	}
}

// The repair is judged on the whole basket. A cheaper individual recipe that
// shares nothing with the rest of the week can make the shop dearer, and a swap
// that does not actually help is not kept.
func TestBudgetRepairKeepsOnlySwapsThatCheapenTheWholeBasket(t *testing.T) {
	catalog := fx.Catalog()
	request := fx.BaseRequest()
	request.Budget = meals.Budget{Amount: 1.00, Currency: "USD", Mode: "balanced"}
	request.Normalize()

	pool := []meals.Recipe{pricey(), thrifty()}
	plan := NewPlanner(catalog).Build(request, pool, "plan-1")

	// Whatever it settled on, the reported cost is the cost of the meals it
	// actually returned — the repair never reports a saving it did not make.
	recomputed := NewPlanner(catalog).BuildWith(request, pool, "plan-2", arrangementOf(plan))
	if recomputed.Summary.EstimatedCost.High != plan.Summary.EstimatedCost.High {
		t.Fatalf("cost = %.2f, want it to match a rebuild of the same meals (%.2f)",
			plan.Summary.EstimatedCost.High, recomputed.Summary.EstimatedCost.High)
	}
}

func arrangementOf(plan meals.Plan) map[meals.Slot]string {
	arrangement := make(map[meals.Slot]string, len(plan.Meals))
	for _, meal := range plan.Meals {
		arrangement[meal.Slot] = meal.RecipeID
	}
	return arrangement
}
