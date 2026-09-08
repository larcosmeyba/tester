package db

// Meal prep plans and their tasks.
//
// A prep plan is derived from a meal plan, so saving one replaces it wholesale:
// the tasks are a view of the week's work, not a list a user curates. The one
// thing that is preserved across a rebuild is which tasks were already done.

import (
	"context"
	"database/sql"

	"github.com/helpthehive/server/internal/domain/meals"
)

const mealPrepTaskColumns = `
	id, prep_plan_id, position, kind, title, instruction, active_minutes,
	portion_amount::float8, portion_unit, storage, keeps_days,
	ingredient_ids, recipe_ids, serves_slots, is_done`

func scanPrepTask(row scanner) (meals.PrepTask, error) {
	var (
		task   meals.PrepTask
		amount sql.NullFloat64
		unit   sql.NullString
		keeps  sql.NullInt32
	)
	if err := row.Scan(
		&task.ID, &task.PrepPlanID, &task.Position, &task.Kind, &task.Title, &task.Instruction,
		&task.ActiveMinutes, &amount, &unit, &task.Storage, &keeps,
		&task.IngredientIDs, &task.RecipeIDs, &task.ServesSlots, &task.IsDone,
	); err != nil {
		return meals.PrepTask{}, err
	}
	if amount.Valid {
		value := amount.Float64
		task.PortionAmount = &value
	}
	task.PortionUnit = nullStringPtr(unit)
	if keeps.Valid {
		value := int(keeps.Int32)
		task.KeepsDays = &value
	}
	return task, nil
}

// GetMealPrepPlan reads a plan's prep work. The user id is in the predicate, so
// another user's prep plan reads as not found.
func (s *Store) GetMealPrepPlan(ctx context.Context, userID string, mealPlanID string) (meals.PrepPlan, error) {
	var plan meals.PrepPlan
	if err := s.pool.QueryRow(ctx, `
		SELECT id, meal_plan_id, user_id, total_active_minutes, created_at, updated_at
		FROM meal_prep_plans
		WHERE user_id = $1 AND meal_plan_id = $2
	`, userID, mealPlanID).Scan(
		&plan.ID, &plan.MealPlanID, &plan.UserID, &plan.TotalActiveMinutes,
		&plan.CreatedAt, &plan.UpdatedAt,
	); err != nil {
		return meals.PrepPlan{}, err
	}

	rows, err := s.pool.Query(ctx, `
		SELECT `+mealPrepTaskColumns+`
		FROM meal_prep_tasks WHERE prep_plan_id = $1 ORDER BY position
	`, plan.ID)
	if err != nil {
		return meals.PrepPlan{}, err
	}
	defer rows.Close()

	for rows.Next() {
		task, err := scanPrepTask(rows)
		if err != nil {
			return meals.PrepPlan{}, err
		}
		plan.Tasks = append(plan.Tasks, task)
	}
	return plan, rows.Err()
}

// SaveMealPrepPlan replaces a plan's prep work in one transaction.
//
// Tasks the user has already ticked stay ticked when the plan is rebuilt,
// matched on what the task is for rather than on its id — the id changes on
// every derivation, but "dice the onions for Tuesday and Thursday" does not.
func (s *Store) SaveMealPrepPlan(ctx context.Context, plan meals.PrepPlan) (meals.PrepPlan, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return meals.PrepPlan{}, err
	}
	defer rollback(ctx, tx)

	done := map[string]bool{}
	existing, err := tx.Query(ctx, `
		SELECT t.kind, t.title, t.is_done
		FROM meal_prep_tasks t
		JOIN meal_prep_plans p ON p.id = t.prep_plan_id
		WHERE p.user_id = $1 AND p.meal_plan_id = $2
	`, plan.UserID, plan.MealPlanID)
	if err != nil {
		return meals.PrepPlan{}, err
	}
	for existing.Next() {
		var kind, title string
		var isDone bool
		if err := existing.Scan(&kind, &title, &isDone); err != nil {
			existing.Close()
			return meals.PrepPlan{}, err
		}
		if isDone {
			done[kind+"\x00"+title] = true
		}
	}
	existing.Close()
	if err := existing.Err(); err != nil {
		return meals.PrepPlan{}, err
	}

	planID := plan.ID
	if planID == "" {
		planID = NewID()
	}
	if err := tx.QueryRow(ctx, `
		INSERT INTO meal_prep_plans (id, meal_plan_id, user_id, total_active_minutes)
		VALUES ($1, $2, $3, $4)
		ON CONFLICT (meal_plan_id) DO UPDATE SET
			total_active_minutes = EXCLUDED.total_active_minutes,
			updated_at = now()
		RETURNING id, created_at, updated_at
	`, planID, plan.MealPlanID, plan.UserID, plan.TotalActiveMinutes).Scan(
		&plan.ID, &plan.CreatedAt, &plan.UpdatedAt,
	); err != nil {
		return meals.PrepPlan{}, err
	}

	if _, err := tx.Exec(ctx, `DELETE FROM meal_prep_tasks WHERE prep_plan_id = $1`, plan.ID); err != nil {
		return meals.PrepPlan{}, err
	}

	for i := range plan.Tasks {
		task := &plan.Tasks[i]
		task.ID = NewID()
		task.PrepPlanID = plan.ID
		task.Position = i + 1
		task.IsDone = done[task.Kind+"\x00"+task.Title]

		if _, err := tx.Exec(ctx, `
			INSERT INTO meal_prep_tasks (
				id, prep_plan_id, position, kind, title, instruction, active_minutes,
				portion_amount, portion_unit, storage, keeps_days,
				ingredient_ids, recipe_ids, serves_slots, is_done
			) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
		`, task.ID, task.PrepPlanID, task.Position, task.Kind, task.Title, task.Instruction,
			task.ActiveMinutes, task.PortionAmount, task.PortionUnit, task.Storage, task.KeepsDays,
			textArray(task.IngredientIDs), textArray(task.RecipeIDs), textArray(task.ServesSlots),
			task.IsDone,
		); err != nil {
			return meals.PrepPlan{}, err
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return meals.PrepPlan{}, err
	}
	return plan, nil
}

// SetMealPrepTaskDone ticks one task off. The join on meal_prep_plans is what
// scopes it to the user: a task id alone says nothing about who owns it.
func (s *Store) SetMealPrepTaskDone(ctx context.Context, userID string, taskID string, done bool) (bool, error) {
	tag, err := s.pool.Exec(ctx, `
		UPDATE meal_prep_tasks t
		SET is_done = $3
		FROM meal_prep_plans p
		WHERE t.prep_plan_id = p.id AND t.id = $2 AND p.user_id = $1
	`, userID, taskID, done)
	if err != nil {
		return false, err
	}
	return tag.RowsAffected() > 0, nil
}
