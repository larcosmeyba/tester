package main

import (
	"strconv"

	"github.com/helpthehive/server/internal/domain/meals"
)

// The fixture types mirror the seed JSON exactly, so a fixture that drifts from
// the schema fails to decode here rather than half-loading.

type seedIngredient struct {
	IngredientID       string  `json:"ingredient_id"`
	DisplayName        string  `json:"display_name"`
	Aisle              string  `json:"aisle"`
	FoodGroup          string  `json:"food_group"`
	ParentIngredientID *string `json:"parent_ingredient_id"`
	PriceReferenceUnit string  `json:"price_reference_unit"`
	IsPantryStaple     bool    `json:"is_pantry_staple"`
	AssumedOnHand      bool    `json:"assumed_on_hand"`
	ContainsMeat       bool    `json:"contains_meat"`
	ContainsPoultry    bool    `json:"contains_poultry"`
	ContainsFish       bool    `json:"contains_fish"`
	ContainsShellfish  bool    `json:"contains_shellfish"`
	ContainsDairy      bool    `json:"contains_dairy"`
	ContainsEgg        bool    `json:"contains_egg"`
	ContainsGluten     bool    `json:"contains_gluten"`
	ContainsWheat      bool    `json:"contains_wheat"`
	ContainsSoy        bool    `json:"contains_soy"`
	ContainsPeanut     bool    `json:"contains_peanut"`
	ContainsTreeNut    bool    `json:"contains_tree_nut"`
	ContainsSesame     bool    `json:"contains_sesame"`
	ContainsCoconut    bool    `json:"contains_coconut"`
	IsAnimalDerived    bool    `json:"is_animal_derived"`
}

func (s seedIngredient) toDomain() meals.Ingredient {
	return meals.Ingredient{
		ID:                 s.IngredientID,
		DisplayName:        s.DisplayName,
		Aisle:              s.Aisle,
		FoodGroup:          s.FoodGroup,
		ParentIngredientID: s.ParentIngredientID,
		PriceReferenceUnit: s.PriceReferenceUnit,
		IsPantryStaple:     s.IsPantryStaple,
		AssumedOnHand:      s.AssumedOnHand,
		ContainsMeat:       s.ContainsMeat,
		ContainsPoultry:    s.ContainsPoultry,
		ContainsFish:       s.ContainsFish,
		ContainsShellfish:  s.ContainsShellfish,
		ContainsDairy:      s.ContainsDairy,
		ContainsEgg:        s.ContainsEgg,
		ContainsGluten:     s.ContainsGluten,
		ContainsWheat:      s.ContainsWheat,
		ContainsSoy:        s.ContainsSoy,
		ContainsPeanut:     s.ContainsPeanut,
		ContainsTreeNut:    s.ContainsTreeNut,
		ContainsSesame:     s.ContainsSesame,
		ContainsCoconut:    s.ContainsCoconut,
		IsAnimalDerived:    s.IsAnimalDerived,
	}
}

type seedPrice struct {
	IngredientID    string  `json:"ingredient_id"`
	UnitPrice       float64 `json:"unit_price"`
	PackageSize     float64 `json:"package_size"`
	Divisible       bool    `json:"divisible"`
	Tier            int     `json:"tier"`
	Source          string  `json:"source"`
	GeographicScope string  `json:"geographic_scope"`
}

func (s seedPrice) toDomain() meals.IngredientPrice {
	return meals.IngredientPrice{
		// Deterministic id: re-seeding updates the row rather than adding one.
		ID:              "price_" + s.IngredientID + "_t" + strconv.Itoa(s.Tier) + "_" + s.GeographicScope,
		IngredientID:    s.IngredientID,
		UnitPrice:       s.UnitPrice,
		PackageSize:     s.PackageSize,
		Divisible:       s.Divisible,
		Tier:            s.Tier,
		Source:          s.Source,
		GeographicScope: s.GeographicScope,
	}
}

type seedIngredientLine struct {
	Position           int      `json:"position"`
	RawText            string   `json:"raw_text"`
	IngredientID       *string  `json:"ingredient_id"`
	DisplayName        *string  `json:"display_name"`
	Quantity           *float64 `json:"quantity"`
	Unit               *string  `json:"unit"`
	Preparation        *string  `json:"preparation"`
	Grams              *float64 `json:"grams"`
	IsOptional         bool     `json:"is_optional"`
	IsToTaste          bool     `json:"is_to_taste"`
	MissingInformation *string  `json:"missing_information"`
}

type seedInstruction struct {
	Step    int    `json:"step"`
	Text    string `json:"text"`
	Minutes *int   `json:"minutes"`
}

type seedNutrition struct {
	Basis        *string  `json:"basis"`
	CaloriesKcal *float64 `json:"calories_kcal"`
	ProteinG     *float64 `json:"protein_g"`
	CarbsG       *float64 `json:"carbs_g"`
	FatG         *float64 `json:"fat_g"`
	FiberG       *float64 `json:"fiber_g"`
	SodiumMg     *float64 `json:"sodium_mg"`
	Confidence   *string  `json:"confidence"`
}

type seedRecipe struct {
	RecipeID             string               `json:"recipe_id"`
	OwnerUserID          *string              `json:"owner_user_id"`
	Title                string               `json:"title"`
	Description          *string              `json:"description"`
	SourceType           string               `json:"source_type"`
	SourceURL            *string              `json:"source_url"`
	SourceName           *string              `json:"source_name"`
	LicenseID            *string              `json:"license_id"`
	AttributionText      *string              `json:"attribution_text"`
	Visibility           string               `json:"visibility"`
	ReviewStatus         string               `json:"review_status"`
	Servings             *float64             `json:"servings"`
	ServingsConfidence   string               `json:"servings_confidence"`
	ServingSizeText      *string              `json:"serving_size_text"`
	Scalable             bool                 `json:"scalable"`
	PrepTimeMinutes      *int                 `json:"prep_time_minutes"`
	CookTimeMinutes      *int                 `json:"cook_time_minutes"`
	TotalTimeMinutes     *int                 `json:"total_time_minutes"`
	TimeConfidence       string               `json:"time_confidence"`
	MealTypes            []string             `json:"meal_types"`
	Cuisine              *string              `json:"cuisine"`
	Difficulty           *int                 `json:"difficulty"`
	EquipmentRequired    []string             `json:"equipment_required"`
	IsComponent          bool                 `json:"is_component"`
	Tags                 []string             `json:"tags"`
	Ingredients          []seedIngredientLine `json:"ingredients"`
	Instructions         []seedInstruction    `json:"instructions"`
	Nutrition            *seedNutrition       `json:"nutrition"`
	BaseMealPlanEligible bool                 `json:"base_meal_plan_eligible"`
	MissingInformation   []string             `json:"missing_information"`
}

func (s seedRecipe) toDomain() meals.Recipe {
	recipe := meals.Recipe{
		ID:                   s.RecipeID,
		OwnerUserID:          s.OwnerUserID,
		Title:                s.Title,
		Description:          s.Description,
		SourceType:           s.SourceType,
		SourceURL:            s.SourceURL,
		SourceName:           s.SourceName,
		LicenseID:            s.LicenseID,
		AttributionText:      s.AttributionText,
		Visibility:           s.Visibility,
		ReviewStatus:         s.ReviewStatus,
		Servings:             s.Servings,
		ServingsConfidence:   s.ServingsConfidence,
		ServingSizeText:      s.ServingSizeText,
		Scalable:             s.Scalable,
		PrepTimeMinutes:      s.PrepTimeMinutes,
		CookTimeMinutes:      s.CookTimeMinutes,
		TotalTimeMinutes:     s.TotalTimeMinutes,
		TimeConfidence:       s.TimeConfidence,
		MealTypes:            orEmpty(s.MealTypes),
		Cuisine:              s.Cuisine,
		Difficulty:           s.Difficulty,
		EquipmentRequired:    orEmpty(s.EquipmentRequired),
		IsComponent:          s.IsComponent,
		Tags:                 orEmpty(s.Tags),
		BaseMealPlanEligible: s.BaseMealPlanEligible,
		MissingInformation:   orEmpty(s.MissingInformation),
	}
	if s.Nutrition != nil {
		recipe.CaloriesKcal = s.Nutrition.CaloriesKcal
		recipe.ProteinG = s.Nutrition.ProteinG
		recipe.CarbsG = s.Nutrition.CarbsG
		recipe.FatG = s.Nutrition.FatG
		recipe.FiberG = s.Nutrition.FiberG
		recipe.SodiumMg = s.Nutrition.SodiumMg
		recipe.NutritionBasis = s.Nutrition.Basis
		recipe.NutritionConfidence = s.Nutrition.Confidence
	}
	for _, line := range s.Ingredients {
		recipe.Ingredients = append(recipe.Ingredients, meals.RecipeIngredient{
			// Deterministic id so a re-seed replaces the line in place.
			ID:                 s.RecipeID + "_i" + strconv.Itoa(line.Position),
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
	for _, step := range s.Instructions {
		recipe.Instructions = append(recipe.Instructions, meals.RecipeInstruction{
			ID:      s.RecipeID + "_s" + strconv.Itoa(step.Step),
			Step:    step.Step,
			Text:    step.Text,
			Minutes: step.Minutes,
		})
	}
	return recipe
}

func orEmpty(values []string) []string {
	if values == nil {
		return []string{}
	}
	return values
}
