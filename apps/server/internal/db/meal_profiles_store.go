package db

// The user's standing meal questionnaire answers.
//
// Written as a whole: saving a profile replaces every list on it in one
// transaction, because a partial write would leave a user with, say, an allergy
// they had removed still on file.

import (
	"context"
	"database/sql"

	"github.com/helpthehive/server/internal/domain/meals"
)

const mealProfileColumns = `
	user_id, household_size, adults, children, size_is_plus,
	budget_amount::float8, budget_currency, budget_mode,
	meals_breakfast, meals_lunch, meals_dinner, meals_snack, days,
	cooking_time_max_minutes, cooking_time_strength, leftovers,
	equipment, cooking_style, dietary_other_text, created_at, updated_at`

func scanMealProfile(row scanner) (meals.MealProfile, error) {
	var (
		profile    meals.MealProfile
		adults     sql.NullInt32
		children   sql.NullInt32
		budget     sql.NullFloat64
		maxMinutes sql.NullInt32
		otherText  sql.NullString
	)
	if err := row.Scan(
		&profile.UserID, &profile.Household.Size, &adults, &children, &profile.Household.SizeIsPlus,
		&budget, &profile.Budget.Currency, &profile.Budget.Mode,
		&profile.Meals.Breakfast, &profile.Meals.Lunch, &profile.Meals.Dinner, &profile.Meals.Snack,
		&profile.Days, &maxMinutes, &profile.CookingTime.Strength, &profile.Leftovers,
		&profile.Equipment, &profile.CookingStyle, &otherText,
		&profile.CreatedAt, &profile.UpdatedAt,
	); err != nil {
		return meals.MealProfile{}, err
	}
	if adults.Valid {
		value := int(adults.Int32)
		profile.Household.Adults = &value
	}
	if children.Valid {
		value := int(children.Int32)
		profile.Household.Children = &value
	}
	if budget.Valid {
		profile.Budget.Amount = budget.Float64
	}
	if maxMinutes.Valid {
		value := int(maxMinutes.Int32)
		profile.CookingTime.MaxMinutes = &value
	}
	profile.DietaryOtherText = nullStringPtr(otherText)
	return profile, nil
}

// GetMealProfile reads a user's saved answers, including every list.
func (s *Store) GetMealProfile(ctx context.Context, userID string) (meals.MealProfile, error) {
	profile, err := scanMealProfile(s.pool.QueryRow(ctx, `
		SELECT `+mealProfileColumns+` FROM meal_profiles WHERE user_id = $1
	`, userID))
	if err != nil {
		return meals.MealProfile{}, err
	}
	return s.attachProfileLists(ctx, profile)
}

func (s *Store) attachProfileLists(ctx context.Context, profile meals.MealProfile) (meals.MealProfile, error) {
	dietRows, err := s.pool.Query(ctx, `
		SELECT diet, strength FROM meal_profile_diets WHERE user_id = $1 ORDER BY diet
	`, profile.UserID)
	if err != nil {
		return profile, err
	}
	for dietRows.Next() {
		var item meals.DietRequirement
		if err := dietRows.Scan(&item.Diet, &item.Strength); err != nil {
			dietRows.Close()
			return profile, err
		}
		profile.Diets = append(profile.Diets, item)
	}
	dietRows.Close()
	if err := dietRows.Err(); err != nil {
		return profile, err
	}

	allergyRows, err := s.pool.Query(ctx, `
		SELECT allergen, ingredient_id, strength
		FROM meal_profile_allergies
		WHERE user_id = $1
		ORDER BY allergen NULLS LAST, ingredient_id
	`, profile.UserID)
	if err != nil {
		return profile, err
	}
	for allergyRows.Next() {
		var (
			allergen     sql.NullString
			ingredientID sql.NullString
			strength     string
		)
		if err := allergyRows.Scan(&allergen, &ingredientID, &strength); err != nil {
			allergyRows.Close()
			return profile, err
		}
		switch {
		case allergen.Valid:
			profile.Allergies = append(profile.Allergies,
				meals.AllergyRequirement{Allergen: allergen.String, Strength: strength})
		case ingredientID.Valid:
			profile.AllergyIngredients = append(profile.AllergyIngredients, ingredientID.String)
		}
	}
	allergyRows.Close()
	if err := allergyRows.Err(); err != nil {
		return profile, err
	}

	prefRows, err := s.pool.Query(ctx, `
		SELECT kind, target, value
		FROM meal_profile_preferences
		WHERE user_id = $1
		ORDER BY kind, target, value
	`, profile.UserID)
	if err != nil {
		return profile, err
	}
	for prefRows.Next() {
		var kind, target, value string
		if err := prefRows.Scan(&kind, &target, &value); err != nil {
			prefRows.Close()
			return profile, err
		}
		bucket := &profile.Likes
		if kind == meals.PreferenceDislike {
			bucket = &profile.Dislikes
		}
		if target == meals.PreferenceCuisine {
			bucket.Cuisines = append(bucket.Cuisines, value)
		} else {
			bucket.Ingredients = append(bucket.Ingredients, value)
		}
	}
	prefRows.Close()
	if err := prefRows.Err(); err != nil {
		return profile, err
	}

	goalRows, err := s.pool.Query(ctx, `
		SELECT goal, strength
		FROM meal_profile_nutrition_goals
		WHERE user_id = $1
		ORDER BY position, goal
	`, profile.UserID)
	if err != nil {
		return profile, err
	}
	for goalRows.Next() {
		var item meals.NutritionPreference
		if err := goalRows.Scan(&item.Goal, &item.Strength); err != nil {
			goalRows.Close()
			return profile, err
		}
		profile.NutritionGoals = append(profile.NutritionGoals, item)
	}
	goalRows.Close()
	return profile, goalRows.Err()
}

// SaveMealProfile replaces a user's answers in one transaction.
//
// Every list is deleted and rewritten rather than merged: a profile is the
// user's current answer to a questionnaire, and a merge would make removing an
// allergy or a dislike impossible.
func (s *Store) SaveMealProfile(ctx context.Context, profile meals.MealProfile) (meals.MealProfile, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return meals.MealProfile{}, err
	}
	defer rollback(ctx, tx)

	var budget any
	if profile.Budget.Amount > 0 {
		budget = profile.Budget.Amount
	}

	saved, err := scanMealProfile(tx.QueryRow(ctx, `
		INSERT INTO meal_profiles (
			user_id, household_size, adults, children, size_is_plus,
			budget_amount, budget_currency, budget_mode,
			meals_breakfast, meals_lunch, meals_dinner, meals_snack, days,
			cooking_time_max_minutes, cooking_time_strength, leftovers,
			equipment, cooking_style, dietary_other_text
		) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
		ON CONFLICT (user_id) DO UPDATE SET
			household_size = EXCLUDED.household_size,
			adults = EXCLUDED.adults,
			children = EXCLUDED.children,
			size_is_plus = EXCLUDED.size_is_plus,
			budget_amount = EXCLUDED.budget_amount,
			budget_currency = EXCLUDED.budget_currency,
			budget_mode = EXCLUDED.budget_mode,
			meals_breakfast = EXCLUDED.meals_breakfast,
			meals_lunch = EXCLUDED.meals_lunch,
			meals_dinner = EXCLUDED.meals_dinner,
			meals_snack = EXCLUDED.meals_snack,
			days = EXCLUDED.days,
			cooking_time_max_minutes = EXCLUDED.cooking_time_max_minutes,
			cooking_time_strength = EXCLUDED.cooking_time_strength,
			leftovers = EXCLUDED.leftovers,
			equipment = EXCLUDED.equipment,
			cooking_style = EXCLUDED.cooking_style,
			dietary_other_text = EXCLUDED.dietary_other_text,
			updated_at = now()
		RETURNING `+mealProfileColumns,
		profile.UserID, profile.Household.Size, profile.Household.Adults, profile.Household.Children,
		profile.Household.SizeIsPlus, budget, defaultTo(profile.Budget.Currency, "USD"),
		defaultTo(profile.Budget.Mode, "balanced"),
		profile.Meals.Breakfast, profile.Meals.Lunch, profile.Meals.Dinner, profile.Meals.Snack,
		profile.Days, profile.CookingTime.MaxMinutes, defaultTo(profile.CookingTime.Strength, "preferred"),
		defaultTo(profile.Leftovers, "sometimes"), textArray(profile.Equipment),
		textArray(profile.CookingStyle), profile.DietaryOtherText,
	))
	if err != nil {
		return meals.MealProfile{}, err
	}

	for _, statement := range []string{
		`DELETE FROM meal_profile_diets WHERE user_id = $1`,
		`DELETE FROM meal_profile_allergies WHERE user_id = $1`,
		`DELETE FROM meal_profile_preferences WHERE user_id = $1`,
		`DELETE FROM meal_profile_nutrition_goals WHERE user_id = $1`,
	} {
		if _, err := tx.Exec(ctx, statement, profile.UserID); err != nil {
			return meals.MealProfile{}, err
		}
	}

	for _, diet := range profile.Diets {
		if _, err := tx.Exec(ctx, `
			INSERT INTO meal_profile_diets (user_id, diet, strength) VALUES ($1, $2, $3)
			ON CONFLICT (user_id, diet) DO UPDATE SET strength = EXCLUDED.strength
		`, profile.UserID, diet.Diet, diet.Strength); err != nil {
			return meals.MealProfile{}, err
		}
	}
	for _, allergy := range profile.Allergies {
		if _, err := tx.Exec(ctx, `
			INSERT INTO meal_profile_allergies (user_id, allergen, strength) VALUES ($1, $2, $3)
		`, profile.UserID, allergy.Allergen, allergy.Strength); err != nil {
			return meals.MealProfile{}, err
		}
	}
	for _, ingredientID := range profile.AllergyIngredients {
		if _, err := tx.Exec(ctx, `
			INSERT INTO meal_profile_allergies (user_id, ingredient_id, strength) VALUES ($1, $2, 'required')
		`, profile.UserID, ingredientID); err != nil {
			return meals.MealProfile{}, err
		}
	}
	for _, entry := range profilePreferenceRows(profile) {
		if _, err := tx.Exec(ctx, `
			INSERT INTO meal_profile_preferences (user_id, kind, target, value) VALUES ($1, $2, $3, $4)
			ON CONFLICT DO NOTHING
		`, profile.UserID, entry.kind, entry.target, entry.value); err != nil {
			return meals.MealProfile{}, err
		}
	}
	for position, goal := range profile.NutritionGoals {
		if _, err := tx.Exec(ctx, `
			INSERT INTO meal_profile_nutrition_goals (user_id, goal, strength, position) VALUES ($1, $2, $3, $4)
			ON CONFLICT (user_id, goal) DO UPDATE SET strength = EXCLUDED.strength, position = EXCLUDED.position
		`, profile.UserID, goal.Goal, goal.Strength, position); err != nil {
			return meals.MealProfile{}, err
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return meals.MealProfile{}, err
	}

	saved.Diets = profile.Diets
	saved.Allergies = profile.Allergies
	saved.AllergyIngredients = profile.AllergyIngredients
	saved.NutritionGoals = profile.NutritionGoals
	saved.Likes = profile.Likes
	saved.Dislikes = profile.Dislikes
	return saved, nil
}

type preferenceRow struct{ kind, target, value string }

func profilePreferenceRows(profile meals.MealProfile) []preferenceRow {
	var rows []preferenceRow
	add := func(kind string, target string, values []string) {
		for _, value := range values {
			rows = append(rows, preferenceRow{kind: kind, target: target, value: value})
		}
	}
	add(meals.PreferenceLike, meals.PreferenceIngredient, profile.Likes.Ingredients)
	add(meals.PreferenceLike, meals.PreferenceCuisine, profile.Likes.Cuisines)
	add(meals.PreferenceDislike, meals.PreferenceIngredient, profile.Dislikes.Ingredients)
	add(meals.PreferenceDislike, meals.PreferenceCuisine, profile.Dislikes.Cuisines)
	return rows
}

func defaultTo(value string, fallback string) string {
	if value == "" {
		return fallback
	}
	return value
}
