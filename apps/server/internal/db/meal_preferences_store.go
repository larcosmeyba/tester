package db

import (
	"context"
	"encoding/json"
)

// SavedPreferences is the questionnaire as it is stored: one row per user,
// rewritten whole every time the questionnaire is answered.
//
// It deliberately mirrors the shape of a plan request rather than the table's
// columns, so the module layer can turn it into a PlanRequest without knowing
// how it is persisted. The user id is on the row, never in anything a caller
// sends.
type SavedPreferences struct {
	UserID               string
	QuestionnaireVersion string
	PlanScope            string

	HouseholdSize       int
	HouseholdAdults     *int
	HouseholdChildren   *int
	HouseholdSizeIsPlus bool

	Days           int
	MealsBreakfast int
	MealsLunch     int
	MealsDinner    int
	MealsSnack     int

	BudgetAmount   float64
	BudgetCurrency string
	BudgetMode     string

	// Stored as JSONB arrays of {value, strength} pairs.
	DietaryRequirements  []StrengthPair
	DietaryOtherText     *string
	Allergies            []StrengthPair
	AllergyIngredientIDs []string
	NutritionPreferences []StrengthPair

	LikesIngredientIDs    []string
	LikesCuisines         []string
	LikesFreeText         *string
	DislikesIngredientIDs []string
	DislikesCuisines      []string
	DislikesFreeText      *string

	CookingTimeMaxMinutes *int
	CookingTimeStrength   string

	Leftovers    string
	Equipment    []string
	CookingStyle []string

	ExcludeRecipeIDs []string
}

// StrengthPair is one preference and how strongly it is held. The key is the
// diet, allergen or nutrition goal; the strength is `required` or `preferred`.
// Allergies are always required, which the module layer enforces — the column
// is not the place to decide safety.
type StrengthPair struct {
	Value    string `json:"value"`
	Strength string `json:"strength"`
}

const mealPreferenceColumns = `
	user_id, questionnaire_version, plan_scope,
	household_size, household_adults, household_children, household_size_is_plus,
	days, meals_breakfast, meals_lunch, meals_dinner, meals_snack,
	budget_amount::float8, budget_currency, budget_mode,
	dietary_requirements, dietary_other_text, allergies, allergy_ingredient_ids,
	nutrition_preferences,
	likes_ingredient_ids, likes_cuisines, likes_free_text,
	dislikes_ingredient_ids, dislikes_cuisines, dislikes_free_text,
	cooking_time_max_minutes, cooking_time_strength,
	leftovers, equipment, cooking_style, exclude_recipe_ids`

func scanMealPreferences(row scanner) (SavedPreferences, error) {
	var p SavedPreferences
	var diets, allergies, nutrition []byte
	err := row.Scan(
		&p.UserID, &p.QuestionnaireVersion, &p.PlanScope,
		&p.HouseholdSize, &p.HouseholdAdults, &p.HouseholdChildren, &p.HouseholdSizeIsPlus,
		&p.Days, &p.MealsBreakfast, &p.MealsLunch, &p.MealsDinner, &p.MealsSnack,
		&p.BudgetAmount, &p.BudgetCurrency, &p.BudgetMode,
		&diets, &p.DietaryOtherText, &allergies, &p.AllergyIngredientIDs,
		&nutrition,
		&p.LikesIngredientIDs, &p.LikesCuisines, &p.LikesFreeText,
		&p.DislikesIngredientIDs, &p.DislikesCuisines, &p.DislikesFreeText,
		&p.CookingTimeMaxMinutes, &p.CookingTimeStrength,
		&p.Leftovers, &p.Equipment, &p.CookingStyle, &p.ExcludeRecipeIDs,
	)
	if err != nil {
		return SavedPreferences{}, err
	}
	for _, decode := range []struct {
		raw  []byte
		into *[]StrengthPair
	}{
		{diets, &p.DietaryRequirements},
		{allergies, &p.Allergies},
		{nutrition, &p.NutritionPreferences},
	} {
		if len(decode.raw) == 0 {
			continue
		}
		if err := json.Unmarshal(decode.raw, decode.into); err != nil {
			return SavedPreferences{}, err
		}
	}
	return p, nil
}

// GetMealPreferences returns the viewer's saved questionnaire. Having never
// answered it is a normal state: the caller gets pgx.ErrNoRows and treats it as
// "no saved preferences", not as a failure.
func (s *Store) GetMealPreferences(ctx context.Context, userID string) (SavedPreferences, error) {
	row := s.pool.QueryRow(ctx,
		`SELECT`+mealPreferenceColumns+` FROM meal_preferences WHERE user_id = $1`, userID)
	return scanMealPreferences(row)
}

// SaveMealPreferences writes the questionnaire whole. It is an upsert rather
// than a patch: the questionnaire is answered as a set, and a half-updated
// answer set is not a state the generator should ever read.
func (s *Store) SaveMealPreferences(ctx context.Context, p SavedPreferences) (SavedPreferences, error) {
	diets, err := json.Marshal(nonNilPairs(p.DietaryRequirements))
	if err != nil {
		return SavedPreferences{}, err
	}
	allergies, err := json.Marshal(nonNilPairs(p.Allergies))
	if err != nil {
		return SavedPreferences{}, err
	}
	nutrition, err := json.Marshal(nonNilPairs(p.NutritionPreferences))
	if err != nil {
		return SavedPreferences{}, err
	}

	row := s.pool.QueryRow(ctx, `
		INSERT INTO meal_preferences (
			user_id, questionnaire_version, plan_scope,
			household_size, household_adults, household_children, household_size_is_plus,
			days, meals_breakfast, meals_lunch, meals_dinner, meals_snack,
			budget_amount, budget_currency, budget_mode,
			dietary_requirements, dietary_other_text, allergies, allergy_ingredient_ids,
			nutrition_preferences,
			likes_ingredient_ids, likes_cuisines, likes_free_text,
			dislikes_ingredient_ids, dislikes_cuisines, dislikes_free_text,
			cooking_time_max_minutes, cooking_time_strength,
			leftovers, equipment, cooking_style, exclude_recipe_ids
		) VALUES (
			$1, $2, $3,
			$4, $5, $6, $7,
			$8, $9, $10, $11, $12,
			$13, $14, $15,
			$16, $17, $18, $19,
			$20,
			$21, $22, $23,
			$24, $25, $26,
			$27, $28,
			$29, $30, $31, $32
		)
		ON CONFLICT (user_id) DO UPDATE SET
			questionnaire_version = EXCLUDED.questionnaire_version,
			plan_scope = EXCLUDED.plan_scope,
			household_size = EXCLUDED.household_size,
			household_adults = EXCLUDED.household_adults,
			household_children = EXCLUDED.household_children,
			household_size_is_plus = EXCLUDED.household_size_is_plus,
			days = EXCLUDED.days,
			meals_breakfast = EXCLUDED.meals_breakfast,
			meals_lunch = EXCLUDED.meals_lunch,
			meals_dinner = EXCLUDED.meals_dinner,
			meals_snack = EXCLUDED.meals_snack,
			budget_amount = EXCLUDED.budget_amount,
			budget_currency = EXCLUDED.budget_currency,
			budget_mode = EXCLUDED.budget_mode,
			dietary_requirements = EXCLUDED.dietary_requirements,
			dietary_other_text = EXCLUDED.dietary_other_text,
			allergies = EXCLUDED.allergies,
			allergy_ingredient_ids = EXCLUDED.allergy_ingredient_ids,
			nutrition_preferences = EXCLUDED.nutrition_preferences,
			likes_ingredient_ids = EXCLUDED.likes_ingredient_ids,
			likes_cuisines = EXCLUDED.likes_cuisines,
			likes_free_text = EXCLUDED.likes_free_text,
			dislikes_ingredient_ids = EXCLUDED.dislikes_ingredient_ids,
			dislikes_cuisines = EXCLUDED.dislikes_cuisines,
			dislikes_free_text = EXCLUDED.dislikes_free_text,
			cooking_time_max_minutes = EXCLUDED.cooking_time_max_minutes,
			cooking_time_strength = EXCLUDED.cooking_time_strength,
			leftovers = EXCLUDED.leftovers,
			equipment = EXCLUDED.equipment,
			cooking_style = EXCLUDED.cooking_style,
			exclude_recipe_ids = EXCLUDED.exclude_recipe_ids,
			updated_at = now()
		RETURNING`+mealPreferenceColumns,
		p.UserID, p.QuestionnaireVersion, p.PlanScope,
		p.HouseholdSize, p.HouseholdAdults, p.HouseholdChildren, p.HouseholdSizeIsPlus,
		p.Days, p.MealsBreakfast, p.MealsLunch, p.MealsDinner, p.MealsSnack,
		p.BudgetAmount, p.BudgetCurrency, p.BudgetMode,
		diets, p.DietaryOtherText, allergies, nonNilStrings(p.AllergyIngredientIDs),
		nutrition,
		nonNilStrings(p.LikesIngredientIDs), nonNilStrings(p.LikesCuisines), p.LikesFreeText,
		nonNilStrings(p.DislikesIngredientIDs), nonNilStrings(p.DislikesCuisines), p.DislikesFreeText,
		p.CookingTimeMaxMinutes, p.CookingTimeStrength,
		p.Leftovers, nonNilStrings(p.Equipment), nonNilStrings(p.CookingStyle),
		nonNilStrings(p.ExcludeRecipeIDs),
	)
	return scanMealPreferences(row)
}

// DeleteMealPreferences forgets the questionnaire. Existing plans keep their
// own request snapshot, so deleting preferences never rewrites history.
func (s *Store) DeleteMealPreferences(ctx context.Context, userID string) (bool, error) {
	tag, err := s.pool.Exec(ctx, `DELETE FROM meal_preferences WHERE user_id = $1`, userID)
	if err != nil {
		return false, err
	}
	return tag.RowsAffected() > 0, nil
}

// Postgres array and JSONB columns are NOT NULL, so a nil Go slice is written
// as an empty collection rather than a null.
func nonNilStrings(values []string) []string {
	if values == nil {
		return []string{}
	}
	return values
}

func nonNilPairs(values []StrengthPair) []StrengthPair {
	if values == nil {
		return []StrengthPair{}
	}
	return values
}
