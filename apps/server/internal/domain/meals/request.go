package meals

import (
	"encoding/json"
	"errors"
)

// The questionnaire's answer set, as the server sees it.
//
// These types describe what the user asked for. Nothing here is trusted as
// given: PlanRequest.Normalize and PlanRequest.Validate in the mealgen module
// are what turn a client's input into something the engine will act on.

type Household struct {
	Size     int  `json:"size"`
	Adults   *int `json:"adults"`
	Children *int `json:"children"`
	// True when the user picked 8+; Size is stored as 8.
	SizeIsPlus bool
}

// MealCounts is the number of each category to plan across the whole request,
// not per day.
type MealCounts struct {
	Breakfast int `json:"breakfast"`
	Lunch     int `json:"lunch"`
	Dinner    int `json:"dinner"`
	Snack     int
}

func (c MealCounts) Total() int { return c.Breakfast + c.Lunch + c.Dinner + c.Snack }

func (c MealCounts) For(mealType string) int {
	switch mealType {
	case MealTypeBreakfast:
		return c.Breakfast
	case MealTypeLunch:
		return c.Lunch
	case MealTypeDinner:
		return c.Dinner
	case MealTypeSnack:
		return c.Snack
	}
	return 0
}

type Budget struct {
	Amount   float64 `json:"amount"`
	Currency string  `json:"currency"`
	Mode     string
}

// Enabled is derived from the amount, never trusted from the client.
func (b Budget) Enabled() bool { return b.Amount > 0 }

type DietRequirement struct {
	Diet     string `json:"diet"`
	Strength string
}

// AllergyRequirement is always required. The service rejects any other strength
// rather than quietly downgrading it.
type AllergyRequirement struct {
	Allergen string `json:"allergen"`
	Strength string
}

type NutritionPreference struct {
	Goal     string `json:"goal"`
	Strength string
}

type FoodPreferences struct {
	Ingredients []string `json:"ingredients"`
	Cuisines    []string `json:"cuisines"`
	FreeText    *string
}

type CookingTime struct {
	MaxMinutes *int `json:"max_minutes"`
	Strength   string
}

// PlanRequest is the questionnaire's answer set. It carries no user id: the
// viewer comes from the verified token.
type PlanRequest struct {
	QuestionnaireVersion string     `json:"questionnaire_version"`
	PlanScope            string     `json:"plan_scope"`
	Household            Household  `json:"household"`
	Meals                MealCounts `json:"meals"`
	Days                 int        `json:"days"`
	Budget               Budget     `json:"budget"`
	// Canonical ingredient ids, not free text.
	PantryItems          []string              `json:"pantry_items"`
	DietaryRequirements  []DietRequirement     `json:"dietary_requirements"`
	DietaryOtherText     *string               `json:"dietary_other_text"`
	Allergies            []AllergyRequirement  `json:"allergies"`
	AllergyIngredients   []string              `json:"allergy_ingredients"`
	NutritionPreferences []NutritionPreference `json:"nutrition_preferences"`
	Likes                FoodPreferences       `json:"likes"`
	Dislikes             FoodPreferences       `json:"dislikes"`
	CookingTime          CookingTime           `json:"cooking_time"`
	Equipment            []string              `json:"equipment"`
	CookingStyle         []string              `json:"cooking_style"`
	Leftovers            string                `json:"leftovers"`
	ExcludeRecipeIDs     []string              `json:"exclude_recipe_ids"`
	Seed                 *int                  `json:"seed"`
}

// DecodeRequest reads back the questionnaire snapshot stored with a plan. A
// plan without a readable snapshot cannot be regenerated or re-priced, so the
// failure is reported rather than defaulted around.
func DecodeRequest(raw []byte) (PlanRequest, error) {
	var request PlanRequest
	if len(raw) == 0 {
		return request, errors.New("this plan has no saved questionnaire")
	}
	if err := json.Unmarshal(raw, &request); err != nil {
		return PlanRequest{}, errors.New("this plan's saved questionnaire could not be read")
	}
	request.Normalize()
	return request, nil
}
