package graphql

// Mapping between the meal engine's domain types and the generated GraphQL
// models. It lives outside *.resolvers.go so gqlgen never rewrites it.

import (
	"github.com/helpthehive/server/internal/domain/meals"
	"github.com/helpthehive/server/internal/graphql/model"
)

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

// planRequestFromInput converts the questionnaire. It deliberately does not
// read a user id from anywhere: the viewer comes from the verified token.
func planRequestFromInput(input model.PlanRequestInput) meals.PlanRequest {
	request := meals.PlanRequest{
		QuestionnaireVersion: input.QuestionnaireVersion,
		Days:                 input.Days,
		PantryItems:          input.PantryItems,
		DietaryOtherText:     input.DietaryOtherText,
		AllergyIngredients:   input.AllergyIngredients,
		Leftovers:            string(input.Leftovers),
		ExcludeRecipeIDs:     input.ExcludeRecipeIds,
		Seed:                 input.Seed,
	}
	if input.PostalCode != nil {
		request.PostalCode = *input.PostalCode
	}
	if input.PlanScope != nil {
		request.PlanScope = *input.PlanScope
	}
	if input.Household != nil {
		request.Household = meals.Household{
			Size:       input.Household.Size,
			Adults:     input.Household.Adults,
			Children:   input.Household.Children,
			SizeIsPlus: input.Household.SizeIsPlus,
		}
	}
	if input.Meals != nil {
		request.Meals = meals.MealCounts{
			Breakfast: input.Meals.Breakfast,
			Lunch:     input.Meals.Lunch,
			Dinner:    input.Meals.Dinner,
			Snack:     input.Meals.Snack,
		}
	}
	if input.Budget != nil {
		request.Budget = meals.Budget{
			Amount:   input.Budget.Amount,
			Currency: input.Budget.Currency,
			Mode:     string(input.Budget.Mode),
		}
	}
	for _, requirement := range input.DietaryRequirements {
		if requirement == nil {
			continue
		}
		request.DietaryRequirements = append(request.DietaryRequirements, meals.DietRequirement{
			Diet:     string(requirement.Diet),
			Strength: string(requirement.Strength),
		})
	}
	for _, allergy := range input.Allergies {
		if allergy == nil {
			continue
		}
		request.Allergies = append(request.Allergies, meals.AllergyRequirement{
			Allergen: string(allergy.Allergen),
			Strength: string(allergy.Strength),
		})
	}
	for _, preference := range input.NutritionPreferences {
		if preference == nil {
			continue
		}
		request.NutritionPreferences = append(request.NutritionPreferences, meals.NutritionPreference{
			Goal:     string(preference.Goal),
			Strength: string(preference.Strength),
		})
	}
	request.Likes = foodPreferencesFromInput(input.Likes)
	request.Dislikes = foodPreferencesFromInput(input.Dislikes)
	if input.CookingTime != nil {
		request.CookingTime = meals.CookingTime{
			MaxMinutes: input.CookingTime.MaxMinutes,
			Strength:   string(input.CookingTime.Strength),
		}
	}
	for _, item := range input.Equipment {
		request.Equipment = append(request.Equipment, string(item))
	}
	for _, style := range input.CookingStyle {
		request.CookingStyle = append(request.CookingStyle, string(style))
	}
	return request
}

func foodPreferencesFromInput(input *model.FoodPreferencesInput) meals.FoodPreferences {
	if input == nil {
		return meals.FoodPreferences{}
	}
	return meals.FoodPreferences{
		Ingredients: input.Ingredients,
		Cuisines:    input.Cuisines,
		FreeText:    input.FreeText,
	}
}

func slotFromInput(input *model.MealSlotInput) meals.Slot {
	if input == nil {
		return meals.Slot{}
	}
	return meals.Slot{Day: input.Day, MealType: string(input.MealType)}
}

func recipeFilterFromInput(input *model.RecipeQueryInput) meals.RecipeFilter {
	if input == nil {
		return meals.RecipeFilter{}
	}
	filter := meals.RecipeFilter{TagIDs: input.TagIds}
	if input.MealType != nil {
		filter.MealType = string(*input.MealType)
	}
	if input.Search != nil {
		filter.Search = *input.Search
	}
	if input.Limit != nil {
		filter.Limit = *input.Limit
	}
	return filter
}

// ---------------------------------------------------------------------------
// Outputs
// ---------------------------------------------------------------------------

func recipeModel(recipe meals.Recipe) *model.Recipe {
	out := &model.Recipe{
		RecipeID:             recipe.ID,
		OwnerUserID:          recipe.OwnerUserID,
		Title:                recipe.Title,
		Description:          recipe.Description,
		SourceType:           recipe.SourceType,
		SourceURL:            recipe.SourceURL,
		SourceName:           recipe.SourceName,
		LicenseID:            recipe.LicenseID,
		AttributionText:      recipe.AttributionText,
		Visibility:           recipe.Visibility,
		ReviewStatus:         recipe.ReviewStatus,
		Servings:             recipe.Servings,
		ServingsConfidence:   model.ValueConfidence(recipe.ServingsConfidence),
		ServingSizeText:      recipe.ServingSizeText,
		Scalable:             recipe.Scalable,
		PrepTimeMinutes:      recipe.PrepTimeMinutes,
		CookTimeMinutes:      recipe.CookTimeMinutes,
		TotalTimeMinutes:     recipe.TotalTimeMinutes,
		TimeConfidence:       model.ValueConfidence(recipe.TimeConfidence),
		Cuisine:              recipe.Cuisine,
		Difficulty:           recipe.Difficulty,
		IsComponent:          recipe.IsComponent,
		Tags:                 orEmpty(recipe.Tags),
		BaseMealPlanEligible: recipe.BaseMealPlanEligible,
		MissingInformation:   orEmpty(recipe.MissingInformation),
	}
	for _, mealType := range recipe.MealTypes {
		out.MealTypes = append(out.MealTypes, model.MealType(mealType))
	}
	for _, item := range recipe.EquipmentRequired {
		out.EquipmentRequired = append(out.EquipmentRequired, model.Equipment(item))
	}
	for _, line := range recipe.Ingredients {
		out.Ingredients = append(out.Ingredients, &model.IngredientLine{
			Position:           line.Position,
			RawText:            line.RawText,
			IngredientID:       line.IngredientID,
			DisplayName:        line.DisplayName,
			Quantity:           line.Quantity,
			Unit:               line.Unit,
			Preparation:        line.Preparation,
			Grams:              line.Grams,
			IsOptional:         line.IsOptional,
			IsToTaste:          line.IsToTaste,
			MissingInformation: line.MissingInformation,
		})
	}
	for _, step := range recipe.Instructions {
		out.Instructions = append(out.Instructions, &model.InstructionStep{
			Step:    step.Step,
			Text:    step.Text,
			Minutes: step.Minutes,
		})
	}
	out.Nutrition = nutritionModel(recipe)
	return out
}

// nutritionModel returns nil when the recipe carries no nutrition at all, so a
// missing value is never rendered as zero.
func nutritionModel(recipe meals.Recipe) *model.NutritionInfo {
	if recipe.CaloriesKcal == nil && recipe.ProteinG == nil && recipe.CarbsG == nil &&
		recipe.FatG == nil && recipe.FiberG == nil && recipe.SodiumMg == nil {
		return nil
	}
	info := &model.NutritionInfo{
		Basis:        "hth_computed",
		PerServing:   true,
		CaloriesKcal: recipe.CaloriesKcal,
		ProteinG:     recipe.ProteinG,
		CarbsG:       recipe.CarbsG,
		FatG:         recipe.FatG,
		FiberG:       recipe.FiberG,
		SodiumMg:     recipe.SodiumMg,
	}
	if recipe.NutritionBasis != nil {
		info.Basis = *recipe.NutritionBasis
	}
	if recipe.NutritionConfidence != nil {
		confidence := model.DataConfidence(*recipe.NutritionConfidence)
		info.Confidence = &confidence
	}
	return info
}

func ingredientModel(ingredient meals.Ingredient) *model.Ingredient {
	out := &model.Ingredient{
		IngredientID:       ingredient.ID,
		DisplayName:        ingredient.DisplayName,
		Aisle:              ingredient.Aisle,
		FoodGroup:          ingredient.FoodGroup,
		PriceReferenceUnit: ingredient.PriceReferenceUnit,
		IsPantryStaple:     ingredient.IsPantryStaple,
		AssumedOnHand:      ingredient.AssumedOnHand,
		Allergens:          []model.Allergen{},
	}
	for _, allergen := range meals.AllergensOf(ingredient) {
		out.Allergens = append(out.Allergens, model.Allergen(allergen))
	}
	return out
}

func costRangeModel(cost meals.CostRange) *model.CostRange {
	out := &model.CostRange{
		Point:      cost.Point,
		Low:        cost.Low,
		High:       cost.High,
		Confidence: model.DataConfidence(cost.Confidence),
		Basis:      cost.Basis,
	}
	if len(cost.TierMix) > 0 {
		out.TierMix = make(map[string]any, len(cost.TierMix))
		for tier, share := range cost.TierMix {
			out.TierMix[tier] = share
		}
	}
	return out
}

func planModel(plan meals.Plan) *model.MealPlan {
	out := &model.MealPlan{
		PlanID:       plan.PlanID,
		Status:       plan.Status,
		Summary:      planSummaryModel(plan.Summary),
		GroceryList:  grocerySectionsModel(plan.GroceryList),
		PennyMessage: plan.PennyMessage,
		Assumptions:  orEmpty(plan.Assumptions),
	}
	for _, meal := range plan.Meals {
		out.Meals = append(out.Meals, plannedMealModel(meal))
	}
	for _, option := range plan.SwapOptions {
		out.SwapOptions = append(out.SwapOptions, model.SwapAction(option))
	}
	return out
}

func plannedMealModel(meal meals.PlannedMeal) *model.PlannedMeal {
	return &model.PlannedMeal{
		Slot:                    &model.MealSlot{Day: meal.Slot.Day, MealType: model.MealType(meal.Slot.MealType)},
		RecipeID:                meal.RecipeID,
		Title:                   meal.Title,
		TotalTimeMinutes:        meal.TotalTimeMinutes,
		ScaleFactor:             meal.ScaleFactor,
		ServingsPlanned:         meal.ServingsPlanned,
		ProteinGPerServing:      meal.ProteinGPerServing,
		GoalIndicator:           meal.GoalIndicator,
		PantryIngredientsUsed:   orEmpty(meal.PantryIngredientsUsed),
		IncrementalCheckoutCost: meal.IncrementalCheckoutCost,
		ConsumedCost:            meal.ConsumedCost,
		Why:                     meal.Why,
	}
}

func planSummaryModel(summary meals.PlanSummary) *model.PlanSummary {
	out := &model.PlanSummary{
		HouseholdSize:     summary.HouseholdSize,
		MealsPlanned:      summary.MealsPlanned,
		Budget:            summary.Budget,
		EstimatedCost:     costRangeModel(summary.EstimatedCost),
		Headroom:          summary.Headroom,
		OverBudget:        summary.OverBudget,
		Overage:           summary.Overage,
		ConsumedCostTotal: summary.ConsumedCostTotal,
		PantryValueUsed:   summary.PantryValueUsed,
		PantryItemsUsed:   orEmpty(summary.PantryItemsUsed),
	}
	if summary.NutritionGoal != nil {
		out.NutritionGoal = &model.NutritionGoalSummary{
			Goal:        summary.NutritionGoal.Goal,
			MetBy:       summary.NutritionGoal.MetBy,
			Of:          summary.NutritionGoal.Of,
			AvgProteinG: summary.NutritionGoal.AvgProteinG,
		}
	}
	if summary.BalancedMealBaseline != nil {
		out.BalancedMealBaseline = &model.BalancedMealBaseline{
			Applied:  summary.BalancedMealBaseline.Applied,
			AvgScore: summary.BalancedMealBaseline.AvgScore,
		}
	}
	return out
}

func grocerySectionsModel(sections []meals.GrocerySection) []*model.GrocerySection {
	out := make([]*model.GrocerySection, 0, len(sections))
	for _, section := range sections {
		mapped := &model.GrocerySection{Aisle: section.Aisle}
		for _, item := range section.Items {
			mapped.Items = append(mapped.Items, &model.GroceryItem{
				IngredientID:   item.IngredientID,
				DisplayName:    item.DisplayName,
				NeededQty:      item.NeededQty,
				Unit:           item.Unit,
				Packages:       item.Packages,
				PackageLabel:   item.PackageLabel,
				EstimatedPrice: item.EstimatedPrice,
				PriceTier:      item.PriceTier,
				InPantry:       item.InPantry,
				IsChecked:      item.IsChecked,
				UsedBy:         orEmpty(item.UsedBy),
			})
		}
		out = append(out, mapped)
	}
	return out
}

func groceryListPayloadModel(result meals.GroceryListResult) *model.GroceryListPayload {
	return &model.GroceryListPayload{
		PlanID:   result.PlanID,
		Sections: grocerySectionsModel(result.Sections),
		Cost:     costRangeModel(result.Cost),
	}
}

// orEmpty keeps a non-null GraphQL list from a nil Go slice.
func orEmpty(values []string) []string {
	if values == nil {
		return []string{}
	}
	return values
}
