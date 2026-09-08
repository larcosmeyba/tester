package db

import (
	"encoding/json"
	"fmt"

	"github.com/helpthehive/server/internal/domain/meals"
)

// The stored form of an imported recipe draft.
//
// `recipe_imports.recipe_draft` is a storage contract: rows written by one
// deployment are read by the next. Marshalling meals.Recipe directly would
// make that contract the Go struct's field names, so renaming a domain field —
// an ordinary refactor with no storage in mind — would silently orphan every
// draft in flight. Hence explicit tags, and a version to read them by.
//
// Bump recipeDraftVersion when the shape changes, and keep a decoder for the
// versions still on disk.
const recipeDraftVersion = 1

type draftEnvelope struct {
	Version int         `json:"version"`
	Recipe  draftRecipe `json:"recipe"`
}

type draftRecipe struct {
	ID              string  `json:"id"`
	OwnerUserID     *string `json:"owner_user_id,omitempty"`
	Title           string  `json:"title"`
	Description     *string `json:"description,omitempty"`
	SourceType      string  `json:"source_type"`
	SourceURL       *string `json:"source_url,omitempty"`
	SourceName      *string `json:"source_name,omitempty"`
	LicenseID       *string `json:"license_id,omitempty"`
	AttributionText *string `json:"attribution_text,omitempty"`
	Visibility      string  `json:"visibility"`
	ReviewStatus    string  `json:"review_status"`

	Servings           *float64 `json:"servings,omitempty"`
	ServingsConfidence string   `json:"servings_confidence"`
	ServingSizeText    *string  `json:"serving_size_text,omitempty"`
	Scalable           bool     `json:"scalable"`

	PrepTimeMinutes  *int   `json:"prep_time_minutes,omitempty"`
	CookTimeMinutes  *int   `json:"cook_time_minutes,omitempty"`
	TotalTimeMinutes *int   `json:"total_time_minutes,omitempty"`
	TimeConfidence   string `json:"time_confidence"`

	MealTypes         []string `json:"meal_types"`
	Cuisine           *string  `json:"cuisine,omitempty"`
	Difficulty        *int     `json:"difficulty,omitempty"`
	EquipmentRequired []string `json:"equipment_required"`
	IsComponent       bool     `json:"is_component"`
	Tags              []string `json:"tags"`

	// Nutrition is absent unless the source stated it. Nothing estimates it,
	// so a null here is meaningful and is preserved as null.
	CaloriesKcal        *float64 `json:"calories_kcal,omitempty"`
	ProteinG            *float64 `json:"protein_g,omitempty"`
	CarbsG              *float64 `json:"carbs_g,omitempty"`
	FatG                *float64 `json:"fat_g,omitempty"`
	FiberG              *float64 `json:"fiber_g,omitempty"`
	SodiumMg            *float64 `json:"sodium_mg,omitempty"`
	NutritionBasis      *string  `json:"nutrition_basis,omitempty"`
	NutritionConfidence *string  `json:"nutrition_confidence,omitempty"`

	BaseMealPlanEligible bool     `json:"base_meal_plan_eligible"`
	MissingInformation   []string `json:"missing_information"`

	Ingredients  []draftIngredient  `json:"ingredients"`
	Instructions []draftInstruction `json:"instructions"`
}

type draftIngredient struct {
	Position    int      `json:"position"`
	RawText     string   `json:"raw_text"`
	DisplayName *string  `json:"display_name,omitempty"`
	Quantity    *float64 `json:"quantity,omitempty"`
	Unit        *string  `json:"unit,omitempty"`
	Preparation *string  `json:"preparation,omitempty"`
	// Set once the line is resolved against the catalogue; null while it is
	// not, which is a fact about the line rather than an omission.
	IngredientID       *string  `json:"ingredient_id,omitempty"`
	Grams              *float64 `json:"grams,omitempty"`
	IsOptional         bool     `json:"is_optional"`
	IsToTaste          bool     `json:"is_to_taste"`
	MissingInformation *string  `json:"missing_information,omitempty"`
}

type draftInstruction struct {
	Step    int    `json:"step"`
	Text    string `json:"text"`
	Minutes *int   `json:"minutes,omitempty"`
}

func encodeRecipeDraft(recipe meals.Recipe) ([]byte, error) {
	envelope := draftEnvelope{
		Version: recipeDraftVersion,
		Recipe: draftRecipe{
			ID:                   recipe.ID,
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
			ServingsConfidence:   recipe.ServingsConfidence,
			ServingSizeText:      recipe.ServingSizeText,
			Scalable:             recipe.Scalable,
			PrepTimeMinutes:      recipe.PrepTimeMinutes,
			CookTimeMinutes:      recipe.CookTimeMinutes,
			TotalTimeMinutes:     recipe.TotalTimeMinutes,
			TimeConfidence:       recipe.TimeConfidence,
			MealTypes:            orEmptyStrings(recipe.MealTypes),
			Cuisine:              recipe.Cuisine,
			Difficulty:           recipe.Difficulty,
			EquipmentRequired:    orEmptyStrings(recipe.EquipmentRequired),
			IsComponent:          recipe.IsComponent,
			Tags:                 orEmptyStrings(recipe.Tags),
			CaloriesKcal:         recipe.CaloriesKcal,
			ProteinG:             recipe.ProteinG,
			CarbsG:               recipe.CarbsG,
			FatG:                 recipe.FatG,
			FiberG:               recipe.FiberG,
			SodiumMg:             recipe.SodiumMg,
			NutritionBasis:       recipe.NutritionBasis,
			NutritionConfidence:  recipe.NutritionConfidence,
			BaseMealPlanEligible: recipe.BaseMealPlanEligible,
			MissingInformation:   orEmptyStrings(recipe.MissingInformation),
		},
	}

	envelope.Recipe.Ingredients = make([]draftIngredient, 0, len(recipe.Ingredients))
	for _, line := range recipe.Ingredients {
		envelope.Recipe.Ingredients = append(envelope.Recipe.Ingredients, draftIngredient{
			Position:           line.Position,
			RawText:            line.RawText,
			DisplayName:        line.DisplayName,
			Quantity:           line.Quantity,
			Unit:               line.Unit,
			Preparation:        line.Preparation,
			IngredientID:       line.IngredientID,
			Grams:              line.Grams,
			IsOptional:         line.IsOptional,
			IsToTaste:          line.IsToTaste,
			MissingInformation: line.MissingInformation,
		})
	}
	envelope.Recipe.Instructions = make([]draftInstruction, 0, len(recipe.Instructions))
	for _, step := range recipe.Instructions {
		envelope.Recipe.Instructions = append(envelope.Recipe.Instructions, draftInstruction{
			Step:    step.Step,
			Text:    step.Text,
			Minutes: step.Minutes,
		})
	}

	return json.Marshal(envelope)
}

func decodeRecipeDraft(payload []byte) (meals.Recipe, error) {
	var envelope draftEnvelope
	if err := json.Unmarshal(payload, &envelope); err != nil {
		return meals.Recipe{}, fmt.Errorf("decode recipe draft: %w", err)
	}
	if envelope.Version != recipeDraftVersion {
		// Better to refuse than to read a shape we do not know: a
		// misinterpreted draft becomes a wrong recipe the user then saves.
		return meals.Recipe{}, fmt.Errorf(
			"recipe draft is version %d, this server reads version %d",
			envelope.Version, recipeDraftVersion,
		)
	}

	stored := envelope.Recipe
	recipe := meals.Recipe{
		ID:                   stored.ID,
		OwnerUserID:          stored.OwnerUserID,
		Title:                stored.Title,
		Description:          stored.Description,
		SourceType:           stored.SourceType,
		SourceURL:            stored.SourceURL,
		SourceName:           stored.SourceName,
		LicenseID:            stored.LicenseID,
		AttributionText:      stored.AttributionText,
		Visibility:           stored.Visibility,
		ReviewStatus:         stored.ReviewStatus,
		Servings:             stored.Servings,
		ServingsConfidence:   stored.ServingsConfidence,
		ServingSizeText:      stored.ServingSizeText,
		Scalable:             stored.Scalable,
		PrepTimeMinutes:      stored.PrepTimeMinutes,
		CookTimeMinutes:      stored.CookTimeMinutes,
		TotalTimeMinutes:     stored.TotalTimeMinutes,
		TimeConfidence:       stored.TimeConfidence,
		MealTypes:            orEmptyStrings(stored.MealTypes),
		Cuisine:              stored.Cuisine,
		Difficulty:           stored.Difficulty,
		EquipmentRequired:    orEmptyStrings(stored.EquipmentRequired),
		IsComponent:          stored.IsComponent,
		Tags:                 orEmptyStrings(stored.Tags),
		CaloriesKcal:         stored.CaloriesKcal,
		ProteinG:             stored.ProteinG,
		CarbsG:               stored.CarbsG,
		FatG:                 stored.FatG,
		FiberG:               stored.FiberG,
		SodiumMg:             stored.SodiumMg,
		NutritionBasis:       stored.NutritionBasis,
		NutritionConfidence:  stored.NutritionConfidence,
		BaseMealPlanEligible: stored.BaseMealPlanEligible,
		MissingInformation:   orEmptyStrings(stored.MissingInformation),
	}

	recipe.Ingredients = make([]meals.RecipeIngredient, 0, len(stored.Ingredients))
	for _, line := range stored.Ingredients {
		recipe.Ingredients = append(recipe.Ingredients, meals.RecipeIngredient{
			// RecipeID is derived rather than stored: it is the recipe's own
			// id, and duplicating it invites the two disagreeing.
			RecipeID:           recipe.ID,
			Position:           line.Position,
			RawText:            line.RawText,
			DisplayName:        line.DisplayName,
			Quantity:           line.Quantity,
			Unit:               line.Unit,
			Preparation:        line.Preparation,
			IngredientID:       line.IngredientID,
			Grams:              line.Grams,
			IsOptional:         line.IsOptional,
			IsToTaste:          line.IsToTaste,
			MissingInformation: line.MissingInformation,
		})
	}
	recipe.Instructions = make([]meals.RecipeInstruction, 0, len(stored.Instructions))
	for _, step := range stored.Instructions {
		recipe.Instructions = append(recipe.Instructions, meals.RecipeInstruction{
			RecipeID: recipe.ID,
			Step:     step.Step,
			Text:     step.Text,
			Minutes:  step.Minutes,
		})
	}

	return recipe, nil
}

func orEmptyStrings(values []string) []string {
	if values == nil {
		return []string{}
	}
	return values
}
