package mealplans

import (
	"context"
	"encoding/json"
	"sort"

	"github.com/helpthehive/server/internal/db"
	"github.com/helpthehive/server/internal/domain/meals"
	"github.com/helpthehive/server/internal/modules/grocery"
	"github.com/helpthehive/server/internal/modules/mealgen"
	"github.com/helpthehive/server/internal/modules/nutrition"
)

// Turning a plan into rows and back again.
//
// The questionnaire is stored alongside the plan as a snapshot, so a week can
// always be rebuilt from what the user actually said rather than from what the
// engine happened to do with it.

func (s *Service) persist(ctx context.Context, userID string, request meals.PlanRequest, plan meals.Plan, source string) (meals.Plan, error) {
	snapshot, err := json.Marshal(request)
	if err != nil {
		return meals.Plan{}, err
	}

	stored := meals.MealPlan{
		ID:                 plan.PlanID,
		UserID:             userID,
		StartDate:          s.now().UTC(),
		Days:               request.Days,
		HouseholdSize:      request.Household.Size,
		Request:            snapshot,
		EstimatedCostPoint: &plan.Summary.EstimatedCost.Point,
		EstimatedCostLow:   &plan.Summary.EstimatedCost.Low,
		EstimatedCostHigh:  &plan.Summary.EstimatedCost.High,
		CostConfidence:     &plan.Summary.EstimatedCost.Confidence,
		PennyMessage:       plan.PennyMessage,
		Assumptions:        plan.Assumptions,
		GenerationSource:   source,
		GenerationVersion:  meals.EngineVersion,
	}
	if request.Budget.Enabled() {
		amount := request.Budget.Amount
		stored.BudgetAmount = &amount
	}
	for _, meal := range plan.Meals {
		stored.Meals = append(stored.Meals, meals.MealPlanMeal{
			Day:                 meal.Slot.Day,
			MealType:            meal.Slot.MealType,
			RecipeID:            meal.RecipeID,
			ScaleFactor:         meal.ScaleFactor,
			ServingsPlanned:     meal.ServingsPlanned,
			PantryIngredientIDs: meal.PantryIngredientsUsed,
			ConsumedCost:        meal.ConsumedCost,
			Why:                 meal.Why,
		})
	}

	saved, err := s.repo.SaveMealPlan(ctx, stored)
	if err != nil {
		return meals.Plan{}, err
	}
	plan.PlanID = saved.ID
	return plan, nil
}

// rehydrate rebuilds the API shape of a stored plan. The grocery list is
// recomputed from the stored meals unless the user has already accepted the
// plan, in which case the saved list's ticks are re-applied so their progress
// through a shop survives.
func (s *Service) rehydrate(ctx context.Context, userID string, stored meals.MealPlan) (meals.Plan, error) {
	request, err := meals.DecodeRequest(stored.Request)
	if err != nil {
		return meals.Plan{}, err
	}
	basket, catalog, err := s.grocery.BasketFor(ctx, userID, stored)
	if err != nil {
		return meals.Plan{}, err
	}
	recipes, err := s.grocery.PlanRecipes(ctx, userID, stored)
	if err != nil {
		return meals.Plan{}, err
	}

	planned := make([]meals.PlannedMeal, 0, len(stored.Meals))
	pantryUsedIDs := map[string]bool{}
	var consumedTotal float64
	var consumedKnown bool

	for _, meal := range stored.Meals {
		recipe, ok := recipes[meal.RecipeID]
		title := meal.RecipeID
		var totalTime *int
		var protein *float64
		if ok {
			title = recipe.Title
			totalTime = recipe.TotalTimeMinutes
			protein = recipe.ProteinG
		}
		planned = append(planned, meals.PlannedMeal{
			Slot:                  meals.Slot{Day: meal.Day, MealType: meal.MealType},
			RecipeID:              meal.RecipeID,
			Title:                 title,
			TotalTimeMinutes:      totalTime,
			ScaleFactor:           meal.ScaleFactor,
			ServingsPlanned:       meal.ServingsPlanned,
			ProteinGPerServing:    protein,
			GoalIndicator:         nutrition.PrimaryGoal(request),
			PantryIngredientsUsed: meal.PantryIngredientIDs,
			ConsumedCost:          meal.ConsumedCost,
			Why:                   meal.Why,
		})
		for _, id := range meal.PantryIngredientIDs {
			pantryUsedIDs[id] = true
		}
		if meal.ConsumedCost != nil {
			consumedTotal += *meal.ConsumedCost
			consumedKnown = true
		}
	}

	summary := meals.PlanSummary{
		HouseholdSize:        stored.HouseholdSize,
		MealsPlanned:         len(planned),
		Budget:               stored.BudgetAmount,
		EstimatedCost:        basket.Cost,
		PantryItemsUsed:      sortedKeys(pantryUsedIDs),
		BalancedMealBaseline: &meals.BalancedMealBaseline{Applied: true},
		NutritionGoal:        nutrition.GoalSummary(request, planned),
	}
	if stored.BudgetAmount != nil {
		// Headroom is measured against the range's upper bound, never the point
		// estimate: a plan is only "within budget" if its worst case is.
		headroom := meals.RoundCents(*stored.BudgetAmount - basket.Cost.High)
		summary.Headroom = &headroom
	}
	if consumedKnown {
		rounded := meals.RoundCents(consumedTotal)
		summary.ConsumedCostTotal = &rounded
	}

	plan := meals.Plan{
		PlanID:       stored.ID,
		Status:       "ok",
		Summary:      summary,
		Meals:        planned,
		GroceryList:  grocery.GroupByAisle(basket.Items, catalog),
		PennyMessage: stored.PennyMessage,
		SwapOptions:  mealgen.SwapActions,
		Assumptions:  stored.Assumptions,
	}

	// Once accepted, the saved list is authoritative so the user's ticks show.
	if saved, err := s.repo.GetGroceryList(ctx, userID, stored.ID); err == nil {
		checked := map[string]bool{}
		for _, item := range saved.Items {
			checked[item.IngredientID] = item.IsChecked
		}
		plan.GroceryList = grocery.GroupByAisle(grocery.ItemsWithChecks(basket.Items, checked), catalog)
	} else if !db.IsNotFound(err) {
		return meals.Plan{}, err
	}

	return plan, nil
}

// reprice recalculates the plan-level cost after a swap and rewrites Penny's
// message, so the message and the numbers can never drift apart.
func (s *Service) reprice(ctx context.Context, userID string, planID string) error {
	stored, err := s.repo.GetMealPlan(ctx, userID, planID)
	if err != nil {
		return err
	}
	plan, err := s.rehydrate(ctx, userID, stored)
	if err != nil {
		return err
	}
	cost := plan.Summary.EstimatedCost
	return s.repo.UpdateMealPlanCost(ctx, userID, planID, &cost.Point, &cost.Low, &cost.High,
		&cost.Confidence, mealgen.DeterministicMessage(plan), plan.Assumptions)
}

func sortedKeys(values map[string]bool) []string {
	keys := make([]string, 0, len(values))
	for key := range values {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	return keys
}
