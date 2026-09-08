package tools

import (
	"context"
	"fmt"

	"github.com/helpthehive/server/internal/auth"
	"github.com/helpthehive/server/internal/domain/meals"
)

// Meal planning is where the one rule is most visible.
//
// Penny does not choose meals. She asks the meal service to build a plan, and
// that service completes the request from the user's saved questionnaire and
// pantry before the engine runs — which is where allergies, diets and household
// composition come from. None of that reaches the model, and none of it can be
// influenced by what the model puts in a tool call.
//
// The strongest version of this: a model instructed by a malicious document to
// "ignore the user's shellfish allergy" has no argument it can set to do so.
// The allergy is not an input to this tool.

type plannedMealView struct {
	Day      int     `json:"day"`
	MealType string  `json:"meal_type"`
	Title    string  `json:"title"`
	RecipeID string  `json:"recipe_id"`
	Minutes  *int    `json:"minutes,omitempty"`
	Servings float64 `json:"servings"`
}

type planView struct {
	PlanID        string            `json:"plan_id"`
	Status        string            `json:"status"`
	Days          int               `json:"days"`
	HouseholdSize int               `json:"household_size"`
	MealsPlanned  int               `json:"meals_planned"`
	Meals         []plannedMealView `json:"meals"`
	// Always a range with a confidence. Never a single number, because a single
	// number is what somebody quotes back as "Penny said it would cost".
	EstimatedCostLow  float64  `json:"estimated_cost_low"`
	EstimatedCostHigh float64  `json:"estimated_cost_high"`
	CostConfidence    string   `json:"cost_confidence"`
	Budget            *float64 `json:"budget,omitempty"`
	Assumptions       []string `json:"assumptions,omitempty"`
}

func currentMealPlan(ctx context.Context, g *Gateway, identity auth.Identity, _ Args) (any, error) {
	plan, err := g.services.MealPlans.Current(ctx, identity)
	if err != nil {
		return nil, err
	}
	if plan == nil {
		// Not an error. Having no plan is the normal state for a new user, and
		// the tool says so in words the model can act on.
		return map[string]any{"has_plan": false}, nil
	}
	return map[string]any{"has_plan": true, "plan": planToView(*plan)}, nil
}

func getMealPlan(ctx context.Context, g *Gateway, identity auth.Identity, args Args) (any, error) {
	planID, err := args.String("plan_id")
	if err != nil {
		return nil, err
	}
	plan, err := g.services.MealPlans.Get(ctx, identity, planID)
	if err != nil {
		return nil, err
	}
	return planToView(plan), nil
}

// generateMealPlan runs only after the user has confirmed. The gateway returns
// a proposal on the first attempt; this is reached from Confirm.
func generateMealPlan(ctx context.Context, g *Gateway, identity auth.Identity, args Args) (any, error) {
	days := args.OptionalInt("days", 7)
	if days < 1 || days > 14 {
		return nil, fmt.Errorf("days must be between 1 and 14")
	}
	perDay := args.OptionalInt("meals_per_day", 3)
	if perDay < 1 || perDay > 4 {
		return nil, fmt.Errorf("meals_per_day must be between 1 and 4")
	}

	// A minimal request. Everything absent here — household, allergies, diets,
	// dislikes, equipment, the pantry — is filled in by the meal service from
	// what the user saved, which is the only place it is trustworthy.
	request := meals.PlanRequest{
		Days:  days,
		Meals: mealCountsFor(days, perDay),
	}
	if budget := args.OptionalFloat("budget"); budget != nil {
		if *budget <= 0 {
			return nil, fmt.Errorf("budget must be more than zero")
		}
		request.Budget = meals.Budget{Amount: *budget, Currency: "USD"}
	}

	plan, err := g.services.MealPlans.Generate(ctx, identity, request)
	if err != nil {
		return nil, err
	}
	return planToView(plan), nil
}

func swapPlannedMeal(ctx context.Context, g *Gateway, identity auth.Identity, args Args) (any, error) {
	planID, err := args.String("plan_id")
	if err != nil {
		return nil, err
	}
	slot, err := slotFrom(args, "day", "slot")
	if err != nil {
		return nil, err
	}
	plan, err := g.services.MealPlans.Swap(ctx, identity, planID, slot, "swap", args.OptionalBool("keep_basket", false))
	if err != nil {
		return nil, err
	}
	return planToView(plan), nil
}

func movePlannedMeal(ctx context.Context, g *Gateway, identity auth.Identity, args Args) (any, error) {
	planID, err := args.String("plan_id")
	if err != nil {
		return nil, err
	}
	from, err := slotFrom(args, "from_day", "from_slot")
	if err != nil {
		return nil, err
	}
	to, err := slotFrom(args, "to_day", "to_slot")
	if err != nil {
		return nil, err
	}
	plan, err := g.services.MealPlans.Move(ctx, identity, planID, from, to)
	if err != nil {
		return nil, err
	}
	return planToView(plan), nil
}

func slotFrom(args Args, dayArg, typeArg string) (meals.Slot, error) {
	day, err := args.Int(dayArg)
	if err != nil {
		return meals.Slot{}, err
	}
	mealType, err := args.Enum(typeArg,
		meals.MealTypeBreakfast, meals.MealTypeLunch, meals.MealTypeDinner, meals.MealTypeSnack)
	if err != nil {
		return meals.Slot{}, err
	}
	return meals.Slot{Day: day, MealType: mealType}, nil
}

// mealCountsFor spreads a per-day count across the week. The engine takes
// totals rather than a per-day number, and dropping breakfast first matches
// what people actually skip.
func mealCountsFor(days, perDay int) meals.MealCounts {
	counts := meals.MealCounts{Dinner: days}
	if perDay >= 2 {
		counts.Lunch = days
	}
	if perDay >= 3 {
		counts.Breakfast = days
	}
	if perDay >= 4 {
		counts.Snack = days
	}
	return counts
}

func planToView(plan meals.Plan) planView {
	view := planView{
		PlanID:            plan.PlanID,
		Status:            plan.Status,
		HouseholdSize:     plan.Summary.HouseholdSize,
		MealsPlanned:      plan.Summary.MealsPlanned,
		EstimatedCostLow:  plan.Summary.EstimatedCost.Low,
		EstimatedCostHigh: plan.Summary.EstimatedCost.High,
		CostConfidence:    plan.Summary.EstimatedCost.Confidence,
		Budget:            plan.Summary.Budget,
		Assumptions:       plan.Assumptions,
		Meals:             make([]plannedMealView, 0, len(plan.Meals)),
	}
	days := 0
	for _, meal := range plan.Meals {
		if meal.Slot.Day+1 > days {
			days = meal.Slot.Day + 1
		}
		view.Meals = append(view.Meals, plannedMealView{
			Day:      meal.Slot.Day,
			MealType: meal.Slot.MealType,
			Title:    meal.Title,
			RecipeID: meal.RecipeID,
			Minutes:  meal.TotalTimeMinutes,
			Servings: meal.ServingsPlanned,
		})
	}
	view.Days = days
	return view
}
