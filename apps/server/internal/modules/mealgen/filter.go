package mealgen

import "github.com/helpthehive/server/internal/domain/meals"

// Hard filters. These decide safety, so they are code reading reviewed data —
// never text matching, never inference, never anything a model returned.

// ViolatesAllergy excludes a recipe when any of its ingredients carries a
// declared allergen, or is (or descends from) an ingredient the user named.
//
// An unresolved ingredient line — one with no catalogue id — cannot be cleared,
// so when the user has declared any allergy the recipe is excluded rather than
// assumed safe.
func ViolatesAllergy(recipe meals.Recipe, request meals.PlanRequest, catalog *meals.Catalog) bool {
	if len(request.Allergies) == 0 && len(request.AllergyIngredients) == 0 {
		return false
	}
	named := meals.Set(request.AllergyIngredients...)

	for _, line := range recipe.Ingredients {
		if line.IsToTaste {
			continue
		}
		if line.IngredientID == nil {
			return true
		}
		if catalog.Matches(*line.IngredientID, named) {
			return true
		}
		ingredient, ok := catalog.Ingredient(*line.IngredientID)
		if !ok {
			return true
		}
		for _, allergy := range request.Allergies {
			if meals.ContainsAllergen(ingredient, allergy.Allergen) {
				return true
			}
		}
	}
	return false
}

// ViolatesDiet applies only the diets the user marked as required. A preferred
// diet is a scoring signal, not an exclusion.
func ViolatesDiet(recipe meals.Recipe, request meals.PlanRequest, catalog *meals.Catalog) bool {
	var required []string
	for _, requirement := range request.DietaryRequirements {
		if requirement.Strength == meals.StrengthRequired {
			required = append(required, requirement.Diet)
		}
	}
	if len(required) == 0 {
		return false
	}
	for _, line := range recipe.Ingredients {
		if line.IsToTaste {
			continue
		}
		if line.IngredientID == nil {
			return true
		}
		ingredient, ok := catalog.Ingredient(*line.IngredientID)
		if !ok {
			return true
		}
		for _, diet := range required {
			if !meals.SatisfiesDiet(ingredient, diet) {
				return true
			}
		}
	}
	return false
}

// ViolatesDislikes is a preference, not a safety rule: an unresolved line is
// not treated as a match.
func ViolatesDislikes(recipe meals.Recipe, request meals.PlanRequest, catalog *meals.Catalog) bool {
	if len(request.Dislikes.Ingredients) == 0 {
		return false
	}
	disliked := meals.Set(request.Dislikes.Ingredients...)
	for _, line := range recipe.Ingredients {
		if line.IngredientID == nil {
			continue
		}
		if catalog.Matches(*line.IngredientID, disliked) {
			return true
		}
	}
	return false
}

// ViolatesEquipment excludes recipes the user cannot physically cook.
func ViolatesEquipment(recipe meals.Recipe, request meals.PlanRequest) bool {
	available := meals.Set(request.Equipment...)
	for _, item := range recipe.EquipmentRequired {
		if !available[item] {
			return true
		}
	}
	return false
}

// ViolatesTime applies only when the user made the time limit required. A
// recipe with no stated time is kept: the limit is not evidence about it.
func ViolatesTime(recipe meals.Recipe, request meals.PlanRequest) bool {
	if request.CookingTime.MaxMinutes == nil || request.CookingTime.Strength != meals.StrengthRequired {
		return false
	}
	if recipe.TotalTimeMinutes == nil {
		return false
	}
	return *recipe.TotalTimeMinutes > *request.CookingTime.MaxMinutes
}

// EligibleRecipes applies every hard filter. Recipes that are not
// base_meal_plan_eligible stay viewable in the library but are never planned.
func EligibleRecipes(recipes []meals.Recipe, request meals.PlanRequest, catalog *meals.Catalog) []meals.Recipe {
	excluded := meals.Set(request.ExcludeRecipeIDs...)
	var eligible []meals.Recipe
	for _, recipe := range recipes {
		if !recipe.BaseMealPlanEligible || recipe.IsComponent {
			continue
		}
		if excluded[recipe.ID] {
			continue
		}
		if ViolatesAllergy(recipe, request, catalog) ||
			ViolatesDiet(recipe, request, catalog) ||
			ViolatesDislikes(recipe, request, catalog) ||
			ViolatesEquipment(recipe, request) ||
			ViolatesTime(recipe, request) {
			continue
		}
		eligible = append(eligible, recipe)
	}
	return eligible
}
