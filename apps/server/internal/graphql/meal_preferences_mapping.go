package graphql

// Mapping for saved meal preferences. It lives outside *.resolvers.go so gqlgen
// never rewrites it.

import (
	"github.com/helpthehive/server/internal/graphql/model"
	"github.com/helpthehive/server/internal/modules/meals"
)

// mealPreferencesModel renders a saved questionnaire.
//
// It is the same value the engine plans from, so what a user sees on the
// preferences screen is exactly what the generator will read — there is no
// second, prettier copy that can drift from the one that decides their week.
func mealPreferencesModel(request meals.PlanRequest) *model.MealPreferences {
	preferences := &model.MealPreferences{
		QuestionnaireVersion: request.QuestionnaireVersion,
		PlanScope:            request.PlanScope,
		Household: &model.Household{
			Size:       request.Household.Size,
			Adults:     request.Household.Adults,
			Children:   request.Household.Children,
			SizeIsPlus: request.Household.SizeIsPlus,
		},
		Meals: &model.MealCounts{
			Breakfast: request.Meals.Breakfast,
			Lunch:     request.Meals.Lunch,
			Dinner:    request.Meals.Dinner,
			Snack:     request.Meals.Snack,
		},
		Days: request.Days,
		Budget: &model.GroceryBudget{
			Amount:   request.Budget.Amount,
			Currency: request.Budget.Currency,
			Mode:     model.BudgetMode(request.Budget.Mode),
		},
		DietaryOtherText:     request.DietaryOtherText,
		AllergyIngredientIds: nonNilIDs(request.AllergyIngredients),
		Likes:                foodPreferencesModel(request.Likes),
		Dislikes:             foodPreferencesModel(request.Dislikes),
		CookingTime: &model.CookingTimeLimit{
			MaxMinutes: request.CookingTime.MaxMinutes,
			Strength:   model.Strength(request.CookingTime.Strength),
		},
		Leftovers:        model.LeftoversPreference(request.Leftovers),
		ExcludeRecipeIds: nonNilIDs(request.ExcludeRecipeIDs),
	}

	for _, requirement := range request.DietaryRequirements {
		preferences.DietaryRequirements = append(preferences.DietaryRequirements, &model.DietRequirement{
			Diet:     model.Diet(requirement.Diet),
			Strength: model.Strength(requirement.Strength),
		})
	}
	for _, allergy := range request.Allergies {
		preferences.Allergies = append(preferences.Allergies, &model.AllergyRequirement{
			Allergen: model.Allergen(allergy.Allergen),
			Strength: model.Strength(allergy.Strength),
		})
	}
	for _, preference := range request.NutritionPreferences {
		preferences.NutritionPreferences = append(preferences.NutritionPreferences, &model.NutritionPreference{
			Goal:     model.NutritionGoal(preference.Goal),
			Strength: model.Strength(preference.Strength),
		})
	}
	for _, item := range request.Equipment {
		preferences.Equipment = append(preferences.Equipment, model.Equipment(item))
	}
	for _, style := range request.CookingStyle {
		preferences.CookingStyle = append(preferences.CookingStyle, model.CookingStyle(style))
	}
	return preferences
}

func foodPreferencesModel(preferences meals.FoodPreferences) *model.FoodPreferences {
	return &model.FoodPreferences{
		Ingredients: nonNilIDs(preferences.Ingredients),
		Cuisines:    nonNilIDs(preferences.Cuisines),
		FreeText:    preferences.FreeText,
	}
}

// The schema declares these lists non-null, so an absent value is an empty list
// rather than a null the client has to guard against.
func nonNilIDs(values []string) []string {
	if values == nil {
		return []string{}
	}
	return values
}
