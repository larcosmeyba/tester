// Package meals holds the meal-planning engine: recipe filtering, household
// scaling, pantry matching, pricing, scoring, week optimisation and grocery
// consolidation.
//
// Everything that decides what a user may eat lives here, on the server. The
// mobile app collects answers and renders results; it never filters for safety
// and never prices a basket.
package meals

// Closed vocabularies. They match the GraphQL enums and the wire values the
// product docs fix; nothing in the system renames them.
const (
	MealTypeBreakfast = "breakfast"
	MealTypeLunch     = "lunch"
	MealTypeDinner    = "dinner"
	MealTypeSnack     = "snack"

	StrengthRequired  = "required"
	StrengthPreferred = "preferred"

	ConfidenceHigh   = "high"
	ConfidenceMedium = "medium"
	ConfidenceLow    = "low"
)

// PlannableMealTypes are the four categories a user can plan. `dessert` and
// `side` exist on recipes but are never planned into a slot.
var PlannableMealTypes = []string{MealTypeBreakfast, MealTypeLunch, MealTypeDinner, MealTypeSnack}

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

// PlanRequest is the questionnaire's answer set, as the server sees it. It
// carries no user id: the viewer comes from the verified token.
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

// CostRange is always a range with a confidence, never fake precision. Budget
// compliance is checked against High.
type CostRange struct {
	Point      float64
	Low        float64
	High       float64
	Confidence string
	// Share of the basket priced at each tier, keyed by tier number.
	TierMix map[string]float64
	Basis   *string
}

type Slot struct {
	Day      int
	MealType string
}

type PlannedMeal struct {
	Slot                    Slot
	RecipeID                string
	Title                   string
	TotalTimeMinutes        *int
	ScaleFactor             float64
	ServingsPlanned         float64
	ProteinGPerServing      *float64
	GoalIndicator           *string
	PantryIngredientsUsed   []string
	IncrementalCheckoutCost *float64
	ConsumedCost            *float64
	// Penny's one-line explanation, written from computed facts only.
	Why *string
}

type GroceryItem struct {
	IngredientID   string
	DisplayName    string
	NeededQty      float64
	Unit           string
	Packages       *int
	PackageLabel   *string
	EstimatedPrice float64
	PriceTier      *int
	InPantry       bool
	IsChecked      bool
	UsedBy         []string
}

type GrocerySection struct {
	Aisle string
	Items []GroceryItem
}

type NutritionGoalSummary struct {
	Goal        string
	MetBy       int
	Of          int
	AvgProteinG *float64
}

type BalancedMealBaseline struct {
	Applied  bool
	AvgScore *float64
}

type PlanSummary struct {
	HouseholdSize int
	MealsPlanned  int
	Budget        *float64
	EstimatedCost CostRange
	// Budget minus EstimatedCost.High; nil when no budget was set.
	Headroom             *float64
	ConsumedCostTotal    *float64
	PantryValueUsed      *float64
	PantryItemsUsed      []string
	NutritionGoal        *NutritionGoalSummary
	BalancedMealBaseline *BalancedMealBaseline
}

type Plan struct {
	PlanID       string
	Status       string
	Summary      PlanSummary
	Meals        []PlannedMeal
	GroceryList  []GrocerySection
	PennyMessage string
	SwapOptions  []string
	Assumptions  []string
}

// GroceryListResult is a consolidated list plus its cost. It is returned both
// for a saved plan and for an ad-hoc "choose my recipes" selection.
type GroceryListResult struct {
	PlanID   *string
	Sections []GrocerySection
	Cost     CostRange
}

// AisleOrder is the display order of grocery sections.
var AisleOrder = []string{
	"produce", "meat_seafood", "dairy_refrigerated", "pantry",
	"canned", "frozen", "bakery", "spice", "other",
}
