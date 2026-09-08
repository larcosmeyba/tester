package db

import (
	"context"
	"errors"
)

// ErrMealNotFound is returned when a slot does not exist in the caller's plan.
// It deliberately does not distinguish "no such slot" from "not your plan".
var ErrMealNotFound = errors.New("meal not found")

// GetGroceryList reads the saved list for a plan. The user id is part of the
// predicate on both tables, so another user's list reads as not found.
func (s *Store) GetGroceryList(ctx context.Context, userID string, planID string) (GroceryList, error) {
	row := s.pool.QueryRow(ctx, `
		SELECT id, meal_plan_id, user_id, estimated_cost_point::float8, estimated_cost_low::float8,
		       estimated_cost_high::float8, cost_confidence
		FROM grocery_lists
		WHERE meal_plan_id = $1 AND user_id = $2
	`, planID, userID)

	var list GroceryList
	if err := row.Scan(&list.ID, &list.MealPlanID, &list.UserID, &list.EstimatedCostPoint,
		&list.EstimatedCostLow, &list.EstimatedCostHigh, &list.CostConfidence); err != nil {
		return GroceryList{}, err
	}

	rows, err := s.pool.Query(ctx, `
		SELECT id, grocery_list_id, ingredient_id, display_name, needed_qty::float8, unit, packages,
		       package_label, estimated_price::float8, price_tier, in_pantry, is_checked, used_by
		FROM grocery_list_items
		WHERE grocery_list_id = $1
		ORDER BY display_name
	`, list.ID)
	if err != nil {
		return GroceryList{}, err
	}
	defer rows.Close()
	for rows.Next() {
		var item GroceryListItem
		if err := rows.Scan(&item.ID, &item.GroceryListID, &item.IngredientID, &item.DisplayName,
			&item.NeededQty, &item.Unit, &item.Packages, &item.PackageLabel, &item.EstimatedPrice,
			&item.PriceTier, &item.InPantry, &item.IsChecked, &item.UsedBy); err != nil {
			return GroceryList{}, err
		}
		list.Items = append(list.Items, item)
	}
	return list, rows.Err()
}

// SaveGroceryList replaces the list for a plan. The plan ownership check is
// inside the insert, so a list can only ever be written against a plan the
// caller owns.
func (s *Store) SaveGroceryList(ctx context.Context, list GroceryList) (GroceryList, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return GroceryList{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	if list.ID == "" {
		list.ID = NewID()
	}
	row := tx.QueryRow(ctx, `
		INSERT INTO grocery_lists (id, meal_plan_id, user_id, estimated_cost_point,
		                           estimated_cost_low, estimated_cost_high, cost_confidence)
		SELECT $1, p.id, p.user_id, $4, $5, $6, $7
		FROM meal_plans p
		WHERE p.id = $2 AND p.user_id = $3
		ON CONFLICT (meal_plan_id) DO UPDATE SET
			estimated_cost_point = EXCLUDED.estimated_cost_point,
			estimated_cost_low = EXCLUDED.estimated_cost_low,
			estimated_cost_high = EXCLUDED.estimated_cost_high,
			cost_confidence = EXCLUDED.cost_confidence,
			updated_at = now()
		RETURNING id
	`, list.ID, list.MealPlanID, list.UserID, list.EstimatedCostPoint, list.EstimatedCostLow,
		list.EstimatedCostHigh, list.CostConfidence)
	var listID string
	if err := row.Scan(&listID); err != nil {
		return GroceryList{}, err
	}
	list.ID = listID

	if _, err := tx.Exec(ctx, `DELETE FROM grocery_list_items WHERE grocery_list_id = $1`, listID); err != nil {
		return GroceryList{}, err
	}
	for i := range list.Items {
		item := &list.Items[i]
		if item.ID == "" {
			item.ID = NewID()
		}
		item.GroceryListID = listID
		if _, err := tx.Exec(ctx, `
			INSERT INTO grocery_list_items (id, grocery_list_id, ingredient_id, display_name, needed_qty,
			                                unit, packages, package_label, estimated_price, price_tier,
			                                in_pantry, is_checked, used_by)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
		`, item.ID, listID, item.IngredientID, item.DisplayName, item.NeededQty, item.Unit,
			item.Packages, item.PackageLabel, item.EstimatedPrice, item.PriceTier, item.InPantry,
			item.IsChecked, textArray(item.UsedBy)); err != nil {
			return GroceryList{}, err
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return GroceryList{}, err
	}
	return list, nil
}

// SetGroceryItemChecked ticks one line off. The update joins back to
// grocery_lists.user_id, so an item can never be checked by a user who does not
// own the list.
func (s *Store) SetGroceryItemChecked(ctx context.Context, userID string, planID string, ingredientID string, checked bool) (bool, error) {
	tag, err := s.pool.Exec(ctx, `
		UPDATE grocery_list_items i
		SET is_checked = $4
		FROM grocery_lists l
		WHERE i.grocery_list_id = l.id
		  AND l.meal_plan_id = $1
		  AND l.user_id = $2
		  AND i.ingredient_id = $3
	`, planID, userID, ingredientID, checked)
	if err != nil {
		return false, err
	}
	return tag.RowsAffected() > 0, nil
}
