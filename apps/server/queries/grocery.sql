-- name: GetGroceryListForPlan :one
SELECT * FROM grocery_lists
WHERE meal_plan_id = sqlc.arg('meal_plan_id') AND user_id = sqlc.arg('user_id');

-- name: UpsertGroceryList :one
INSERT INTO grocery_lists (
  id, meal_plan_id, user_id, estimated_cost_point, estimated_cost_low,
  estimated_cost_high, cost_confidence
) VALUES ($1,$2,$3,$4,$5,$6,$7)
ON CONFLICT (meal_plan_id) DO UPDATE SET
  estimated_cost_point = EXCLUDED.estimated_cost_point,
  estimated_cost_low = EXCLUDED.estimated_cost_low,
  estimated_cost_high = EXCLUDED.estimated_cost_high,
  cost_confidence = EXCLUDED.cost_confidence,
  updated_at = now()
RETURNING *;

-- name: ListGroceryListItems :many
SELECT * FROM grocery_list_items
WHERE grocery_list_id = $1
ORDER BY estimated_price DESC;

-- name: DeleteGroceryListItems :exec
DELETE FROM grocery_list_items WHERE grocery_list_id = $1;

-- name: InsertGroceryListItem :exec
INSERT INTO grocery_list_items (
  id, grocery_list_id, ingredient_id, display_name, needed_qty, unit,
  packages, package_label, estimated_price, price_tier, in_pantry, used_by
) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12);

-- name: SetGroceryItemChecked :one
-- Ownership is proved by joining back to the list's user before updating.
UPDATE grocery_list_items i
SET is_checked = sqlc.arg('is_checked')
FROM grocery_lists l
WHERE i.id = sqlc.arg('id')
  AND l.id = i.grocery_list_id
  AND l.user_id = sqlc.arg('user_id')
RETURNING i.*;
