package db

import (
	"context"
	"time"
)

const mealPlanColumns = `
	id, user_id, status, start_date, days, household_size, request, budget_amount::float8,
	estimated_cost_point::float8, estimated_cost_low::float8, estimated_cost_high::float8,
	cost_confidence, penny_message, assumptions, generation_source, generation_version,
	created_at, updated_at`

func scanMealPlan(row scanner) (MealPlan, error) {
	var plan MealPlan
	err := row.Scan(
		&plan.ID, &plan.UserID, &plan.Status, &plan.StartDate, &plan.Days, &plan.HouseholdSize,
		&plan.Request, &plan.BudgetAmount, &plan.EstimatedCostPoint, &plan.EstimatedCostLow,
		&plan.EstimatedCostHigh, &plan.CostConfidence, &plan.PennyMessage, &plan.Assumptions,
		&plan.GenerationSource, &plan.GenerationVersion, &plan.CreatedAt, &plan.UpdatedAt,
	)
	return plan, err
}

// GetActiveMealPlan returns the plan the user is currently on. A user has at
// most one — enforced by the meal_plans_one_active_idx partial unique index.
func (s *Store) GetActiveMealPlan(ctx context.Context, userID string) (MealPlan, error) {
	row := s.pool.QueryRow(ctx, `
		SELECT`+mealPlanColumns+`
		FROM meal_plans
		WHERE user_id = $1 AND status = 'active'
	`, userID)
	plan, err := scanMealPlan(row)
	if err != nil {
		return MealPlan{}, err
	}
	return s.attachPlanMeals(ctx, plan)
}

// GetMealPlan reads one plan. The user id is part of the predicate, so a plan
// id belonging to somebody else reads as not found.
func (s *Store) GetMealPlan(ctx context.Context, userID string, planID string) (MealPlan, error) {
	row := s.pool.QueryRow(ctx, `
		SELECT`+mealPlanColumns+`
		FROM meal_plans
		WHERE id = $2 AND user_id = $1
	`, userID, planID)
	plan, err := scanMealPlan(row)
	if err != nil {
		return MealPlan{}, err
	}
	return s.attachPlanMeals(ctx, plan)
}

func (s *Store) attachPlanMeals(ctx context.Context, plan MealPlan) (MealPlan, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT id, meal_plan_id, day, meal_type, recipe_id, scale_factor::float8,
		       servings_planned::float8, pantry_ingredient_ids, consumed_cost::float8, why
		FROM meal_plan_meals
		WHERE meal_plan_id = $1
		ORDER BY day, meal_type
	`, plan.ID)
	if err != nil {
		return MealPlan{}, err
	}
	defer rows.Close()

	for rows.Next() {
		var meal MealPlanMeal
		if err := rows.Scan(
			&meal.ID, &meal.MealPlanID, &meal.Day, &meal.MealType, &meal.RecipeID,
			&meal.ScaleFactor, &meal.ServingsPlanned, &meal.PantryIngredientIDs,
			&meal.ConsumedCost, &meal.Why,
		); err != nil {
			return MealPlan{}, err
		}
		plan.Meals = append(plan.Meals, meal)
	}
	return plan, rows.Err()
}

// SaveMealPlan archives whatever plan the user was on and writes the new one in
// a single transaction, so a failure part-way cannot leave a user with two
// active plans or none.
func (s *Store) SaveMealPlan(ctx context.Context, plan MealPlan) (MealPlan, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return MealPlan{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	if _, err := tx.Exec(ctx, `
		UPDATE meal_plans SET status = 'archived', updated_at = now()
		WHERE user_id = $1 AND status = 'active'
	`, plan.UserID); err != nil {
		return MealPlan{}, err
	}

	if plan.ID == "" {
		plan.ID = NewID()
	}
	if plan.StartDate.IsZero() {
		plan.StartDate = s.now().UTC()
	}
	row := tx.QueryRow(ctx, `
		INSERT INTO meal_plans (id, user_id, status, start_date, days, household_size, request,
		                        budget_amount, estimated_cost_point, estimated_cost_low,
		                        estimated_cost_high, cost_confidence, penny_message, assumptions,
		                        generation_source, generation_version)
		VALUES ($1, $2, 'active', $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
		RETURNING`+mealPlanColumns+`
	`, plan.ID, plan.UserID, plan.StartDate, plan.Days, plan.HouseholdSize, plan.Request,
		plan.BudgetAmount, plan.EstimatedCostPoint, plan.EstimatedCostLow, plan.EstimatedCostHigh,
		plan.CostConfidence, plan.PennyMessage, textArray(plan.Assumptions), plan.GenerationSource,
		plan.GenerationVersion)
	saved, err := scanMealPlan(row)
	if err != nil {
		return MealPlan{}, err
	}

	for _, meal := range plan.Meals {
		id := meal.ID
		if id == "" {
			id = NewID()
		}
		if _, err := tx.Exec(ctx, `
			INSERT INTO meal_plan_meals (id, meal_plan_id, day, meal_type, recipe_id, scale_factor,
			                             servings_planned, pantry_ingredient_ids, consumed_cost, why)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
		`, id, saved.ID, meal.Day, meal.MealType, meal.RecipeID, meal.ScaleFactor,
			meal.ServingsPlanned, textArray(meal.PantryIngredientIDs), meal.ConsumedCost, meal.Why); err != nil {
			return MealPlan{}, err
		}
		meal.ID = id
		meal.MealPlanID = saved.ID
		saved.Meals = append(saved.Meals, meal)
	}

	if err := tx.Commit(ctx); err != nil {
		return MealPlan{}, err
	}
	return saved, nil
}

// MoveMealPlanMeal moves one meal to a different day or meal type. The basket
// is unchanged, so no cost is recalculated — moving a meal must never behave
// like a regeneration.
func (s *Store) MoveMealPlanMeal(ctx context.Context, userID string, planID string, fromDay int, fromType string, toDay int, toType string) error {
	tag, err := s.pool.Exec(ctx, `
		UPDATE meal_plan_meals m
		SET day = $4, meal_type = $5
		FROM meal_plans p
		WHERE m.meal_plan_id = p.id
		  AND p.id = $1 AND p.user_id = $2
		  AND m.day = $3 AND m.meal_type = $6
	`, planID, userID, fromDay, toDay, toType, fromType)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrMealNotFound
	}
	return nil
}

// ReplacePlanMealRecipe swaps the recipe in one slot, leaving the rest of the
// plan alone.
func (s *Store) ReplacePlanMealRecipe(ctx context.Context, userID string, planID string, day int, mealType string, meal MealPlanMeal) error {
	tag, err := s.pool.Exec(ctx, `
		UPDATE meal_plan_meals m
		SET recipe_id = $4,
		    scale_factor = $5,
		    servings_planned = $6,
		    pantry_ingredient_ids = $7,
		    consumed_cost = $8,
		    why = $9
		FROM meal_plans p
		WHERE m.meal_plan_id = p.id
		  AND p.id = $1 AND p.user_id = $2
		  AND m.day = $3 AND m.meal_type = $10
	`, planID, userID, day, meal.RecipeID, meal.ScaleFactor, meal.ServingsPlanned,
		textArray(meal.PantryIngredientIDs), meal.ConsumedCost, meal.Why, mealType)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrMealNotFound
	}
	return nil
}

// UpdateMealPlanCost rewrites the plan-level cost range after a swap.
func (s *Store) UpdateMealPlanCost(ctx context.Context, userID string, planID string, point, low, high *float64, confidence *string, pennyMessage string, assumptions []string) error {
	_, err := s.pool.Exec(ctx, `
		UPDATE meal_plans
		SET estimated_cost_point = $3,
		    estimated_cost_low = $4,
		    estimated_cost_high = $5,
		    cost_confidence = $6,
		    penny_message = $7,
		    assumptions = $8,
		    updated_at = now()
		WHERE id = $1 AND user_id = $2
	`, planID, userID, point, low, high, confidence, pennyMessage, textArray(assumptions))
	return err
}

func (s *Store) DeleteMealPlan(ctx context.Context, userID string, planID string) (bool, error) {
	tag, err := s.pool.Exec(ctx, `DELETE FROM meal_plans WHERE id = $1 AND user_id = $2`, planID, userID)
	if err != nil {
		return false, err
	}
	return tag.RowsAffected() > 0, nil
}

// SetPlanStartDate is used when a plan is accepted, so the week the grocery
// list belongs to is recorded.
func (s *Store) SetPlanStartDate(ctx context.Context, userID string, planID string, start time.Time) error {
	_, err := s.pool.Exec(ctx, `
		UPDATE meal_plans SET start_date = $3, updated_at = now()
		WHERE id = $1 AND user_id = $2
	`, planID, userID, start)
	return err
}
