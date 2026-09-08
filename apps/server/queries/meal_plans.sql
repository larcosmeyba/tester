-- name: GetActiveMealPlan :one
SELECT * FROM meal_plans
WHERE user_id = sqlc.arg('user_id') AND status = 'active';

-- name: GetMealPlanForUser :one
-- Ownership is enforced here, in SQL, not by filtering in the client.
SELECT * FROM meal_plans
WHERE id = sqlc.arg('id') AND user_id = sqlc.arg('user_id');

-- name: ListMealPlansForUser :many
SELECT * FROM meal_plans
WHERE user_id = sqlc.arg('user_id')
ORDER BY created_at DESC
LIMIT sqlc.arg('limit_count');

-- name: ArchiveActiveMealPlans :exec
-- One active plan per user is enforced by a unique partial index; archive the
-- previous one before inserting a replacement.
UPDATE meal_plans SET status = 'archived', updated_at = now()
WHERE user_id = $1 AND status = 'active';

-- name: CreateMealPlan :one
INSERT INTO meal_plans (
  id, user_id, status, start_date, days, household_size, request,
  budget_amount, estimated_cost_point, estimated_cost_low, estimated_cost_high,
  cost_confidence, penny_message, assumptions, generation_source, generation_version
) VALUES ($1,$2,'active',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
RETURNING *;

-- name: UpdateMealPlanCost :one
UPDATE meal_plans
SET estimated_cost_point = $2,
    estimated_cost_low = $3,
    estimated_cost_high = $4,
    cost_confidence = $5,
    updated_at = now()
WHERE id = $1
RETURNING *;

-- name: DeleteMealPlanForUser :exec
DELETE FROM meal_plans WHERE id = $1 AND user_id = $2;

-- name: ListMealPlanMeals :many
SELECT * FROM meal_plan_meals
WHERE meal_plan_id = $1
ORDER BY day ASC, meal_type ASC;

-- name: InsertMealPlanMeal :exec
INSERT INTO meal_plan_meals (
  id, meal_plan_id, day, meal_type, recipe_id, scale_factor,
  servings_planned, pantry_ingredient_ids, consumed_cost, why
) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10);

-- name: GetMealPlanMeal :one
SELECT m.* FROM meal_plan_meals m
JOIN meal_plans p ON p.id = m.meal_plan_id
WHERE m.meal_plan_id = sqlc.arg('meal_plan_id')
  AND m.day = sqlc.arg('day')
  AND m.meal_type = sqlc.arg('meal_type')
  AND p.user_id = sqlc.arg('user_id');

-- name: MoveMealPlanMeal :exec
-- Reassigns a slot. The basket is unchanged, so no cost is recalculated —
-- moving a meal must never behave like a regeneration.
UPDATE meal_plan_meals
SET day = sqlc.arg('to_day'), meal_type = sqlc.arg('to_meal_type')
WHERE id = sqlc.arg('id');

-- name: ReplaceMealPlanMealRecipe :exec
UPDATE meal_plan_meals
SET recipe_id = sqlc.arg('recipe_id'),
    scale_factor = sqlc.arg('scale_factor'),
    servings_planned = sqlc.arg('servings_planned'),
    pantry_ingredient_ids = sqlc.arg('pantry_ingredient_ids'),
    why = sqlc.arg('why')
WHERE id = sqlc.arg('id');

-- name: DeleteMealPlanMeals :exec
DELETE FROM meal_plan_meals WHERE meal_plan_id = $1;
