package graphql

// Mapping for the meal profile, the plan actions and meal prep. It lives
// outside *.resolvers.go so gqlgen never rewrites it, in its own file so it
// does not collide with the recipe-import mapping alongside it.

import (
	"github.com/helpthehive/server/internal/db"
	"github.com/helpthehive/server/internal/domain/meals"
	"github.com/helpthehive/server/internal/graphql/model"
)

// ---------------------------------------------------------------------------
// Meal profile
// ---------------------------------------------------------------------------

// mealProfileFromInput converts saved answers. Like planRequestFromInput it
// carries no user id: the viewer comes from the verified token, and a client
// cannot save a profile on somebody else's behalf.
func mealProfileFromInput(input model.MealProfileInput) meals.MealProfile {
	profile := meals.MealProfile{
		Household: meals.Household{
			Size:       input.Household.Size,
			Adults:     input.Household.Adults,
			Children:   input.Household.Children,
			SizeIsPlus: input.Household.SizeIsPlus,
		},
		Meals: meals.MealCounts{
			Breakfast: input.Meals.Breakfast,
			Lunch:     input.Meals.Lunch,
			Dinner:    input.Meals.Dinner,
			Snack:     input.Meals.Snack,
		},
		Days:               input.Days,
		AllergyIngredients: input.AllergyIngredients,
		Likes: meals.FoodPreferences{
			Ingredients: input.Likes.Ingredients,
			Cuisines:    input.Likes.Cuisines,
			FreeText:    input.Likes.FreeText,
		},
		Dislikes: meals.FoodPreferences{
			Ingredients: input.Dislikes.Ingredients,
			Cuisines:    input.Dislikes.Cuisines,
			FreeText:    input.Dislikes.FreeText,
		},
		CookingTime: meals.CookingTime{
			MaxMinutes: input.CookingTime.MaxMinutes,
			Strength:   string(input.CookingTime.Strength),
		},
		Leftovers:        string(input.Leftovers),
		DietaryOtherText: input.DietaryOtherText,
	}

	if input.Budget != nil {
		profile.Budget = meals.Budget{
			Amount:   input.Budget.Amount,
			Currency: input.Budget.Currency,
			Mode:     string(input.Budget.Mode),
		}
	}
	for _, diet := range input.DietaryRequirements {
		profile.Diets = append(profile.Diets, meals.DietRequirement{
			Diet: string(diet.Diet), Strength: string(diet.Strength),
		})
	}
	for _, allergy := range input.Allergies {
		profile.Allergies = append(profile.Allergies, meals.AllergyRequirement{
			Allergen: string(allergy.Allergen), Strength: string(allergy.Strength),
		})
	}
	for _, goal := range input.NutritionPreferences {
		profile.NutritionGoals = append(profile.NutritionGoals, meals.NutritionPreference{
			Goal: string(goal.Goal), Strength: string(goal.Strength),
		})
	}
	for _, item := range input.Equipment {
		profile.Equipment = append(profile.Equipment, string(item))
	}
	for _, style := range input.CookingStyle {
		profile.CookingStyle = append(profile.CookingStyle, string(style))
	}
	return profile
}

func mealProfileModel(profile meals.MealProfile) *model.MealProfile {
	out := &model.MealProfile{
		Household: &model.Household{
			Size:       profile.Household.Size,
			Adults:     profile.Household.Adults,
			Children:   profile.Household.Children,
			SizeIsPlus: profile.Household.SizeIsPlus,
		},
		Meals: &model.MealCounts{
			Breakfast: profile.Meals.Breakfast,
			Lunch:     profile.Meals.Lunch,
			Dinner:    profile.Meals.Dinner,
			Snack:     profile.Meals.Snack,
		},
		Days:                profile.Days,
		AllergyIngredients:  orEmptyIDs(profile.AllergyIngredients),
		DietaryRequirements: []*model.DietRequirement{},
		Allergies:           []*model.AllergyRequirement{},
		NutritionGoals:      []*model.NutritionPreference{},
		Likes: &model.FoodPreferences{
			Ingredients: orEmptyIDs(profile.Likes.Ingredients),
			Cuisines:    orEmptyIDs(profile.Likes.Cuisines),
			FreeText:    profile.Likes.FreeText,
		},
		Dislikes: &model.FoodPreferences{
			Ingredients: orEmptyIDs(profile.Dislikes.Ingredients),
			Cuisines:    orEmptyIDs(profile.Dislikes.Cuisines),
			FreeText:    profile.Dislikes.FreeText,
		},
		CookingTime: &model.CookingTime{
			MaxMinutes: profile.CookingTime.MaxMinutes,
			Strength:   model.Strength(profile.CookingTime.Strength),
		},
		Equipment:        []model.Equipment{},
		CookingStyle:     []model.CookingStyle{},
		Leftovers:        model.LeftoversPreference(profile.Leftovers),
		DietaryOtherText: profile.DietaryOtherText,
		UpdatedAt:        db.FormatTime(profile.UpdatedAt),
	}

	// A budget of zero is "no budget set", not "a budget of nothing": the
	// difference matters, because a plan is only measured against a budget the
	// user actually gave.
	if profile.Budget.Enabled() {
		out.Budget = &model.Budget{
			Amount:   profile.Budget.Amount,
			Currency: profile.Budget.Currency,
			Mode:     model.BudgetMode(profile.Budget.Mode),
		}
	}
	for _, diet := range profile.Diets {
		out.DietaryRequirements = append(out.DietaryRequirements, &model.DietRequirement{
			Diet: model.Diet(diet.Diet), Strength: model.Strength(diet.Strength),
		})
	}
	for _, allergy := range profile.Allergies {
		out.Allergies = append(out.Allergies, &model.AllergyRequirement{
			Allergen: model.Allergen(allergy.Allergen), Strength: model.Strength(allergy.Strength),
		})
	}
	for _, goal := range profile.NutritionGoals {
		out.NutritionGoals = append(out.NutritionGoals, &model.NutritionPreference{
			Goal: model.NutritionGoal(goal.Goal), Strength: model.Strength(goal.Strength),
		})
	}
	for _, item := range profile.Equipment {
		out.Equipment = append(out.Equipment, model.Equipment(item))
	}
	for _, style := range profile.CookingStyle {
		out.CookingStyle = append(out.CookingStyle, model.CookingStyle(style))
	}
	return out
}

// ---------------------------------------------------------------------------
// Meal prep
// ---------------------------------------------------------------------------

func mealPrepPlanModel(plan meals.PrepPlan) *model.MealPrepPlan {
	out := &model.MealPrepPlan{
		PrepPlanID:         plan.ID,
		PlanID:             plan.MealPlanID,
		TotalActiveMinutes: plan.TotalActiveMinutes,
		Tasks:              make([]*model.MealPrepTask, 0, len(plan.Tasks)),
	}
	for _, task := range plan.Tasks {
		out.Tasks = append(out.Tasks, &model.MealPrepTask{
			TaskID:        task.ID,
			Position:      task.Position,
			Kind:          model.MealPrepTaskKind(task.Kind),
			Title:         task.Title,
			Instruction:   task.Instruction,
			ActiveMinutes: task.ActiveMinutes,
			PortionAmount: task.PortionAmount,
			PortionUnit:   task.PortionUnit,
			Storage:       model.MealPrepStorage(task.Storage),
			KeepsDays:     task.KeepsDays,
			IngredientIds: orEmptyIDs(task.IngredientIDs),
			RecipeIds:     orEmptyIDs(task.RecipeIDs),
			ServesSlots:   orEmptyIDs(task.ServesSlots),
			IsDone:        task.IsDone,
		})
	}
	return out
}

// orEmptyIDs keeps a non-null list non-null. GraphQL says these fields are
// never null, and a nil Go slice would encode as one.
func orEmptyIDs(values []string) []string {
	if values == nil {
		return []string{}
	}
	return values
}
