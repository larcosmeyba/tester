package db

import "time"

// Domain types for the meal system. They mirror migration 00005 and are the
// only shape the meals module works with — no GraphQL or SQL types leak past
// this package.

// Ingredient is the canonical catalogue entry. Allergen and diet flags are
// human-reviewed data; nothing in the system infers them from a recipe's text.
type Ingredient struct {
	ID                 string
	DisplayName        string
	Aisle              string
	FoodGroup          string
	ParentIngredientID *string
	PriceReferenceUnit string
	IsPantryStaple     bool
	// salt, pepper and water only: always treated as on hand.
	AssumedOnHand     bool
	ContainsMeat      bool
	ContainsPoultry   bool
	ContainsFish      bool
	ContainsShellfish bool
	ContainsDairy     bool
	ContainsEgg       bool
	ContainsGluten    bool
	ContainsWheat     bool
	ContainsSoy       bool
	ContainsPeanut    bool
	ContainsTreeNut   bool
	ContainsSesame    bool
	ContainsCoconut   bool
	IsAnimalDerived   bool
}

// IngredientPrice is an estimate, never a quoted retail price. Tier 1 is a
// retailer feed and tier 4 a curated fallback; the mix decides a plan's
// cost confidence.
type IngredientPrice struct {
	ID           string
	IngredientID string
	UnitPrice    float64
	PackageSize  float64
	// true = sold loose by weight: buy what is needed, rounded up.
	Divisible       bool
	Tier            int
	Source          string
	GeographicScope string
}

// RecipeIngredient is one ingredient line. Quantity is nil when the source
// never stated one; MissingInformation says so rather than a number being
// invented.
type RecipeIngredient struct {
	ID                 string
	RecipeID           string
	Position           int
	RawText            string
	IngredientID       *string
	DisplayName        *string
	Quantity           *float64
	Unit               *string
	Preparation        *string
	Grams              *float64
	IsOptional         bool
	IsToTaste          bool
	MissingInformation *string
}

type RecipeInstruction struct {
	ID       string
	RecipeID string
	Step     int
	Text     string
	Minutes  *int
}

// Recipe is the Standard HTH Recipe Object. OwnerUserID nil means a public
// library recipe.
type Recipe struct {
	ID                  string
	OwnerUserID         *string
	Title               string
	Description         *string
	SourceType          string
	SourceURL           *string
	SourceName          *string
	LicenseID           *string
	AttributionText     *string
	Visibility          string
	ReviewStatus        string
	Servings            *float64
	ServingsConfidence  string
	ServingSizeText     *string
	Scalable            bool
	PrepTimeMinutes     *int
	CookTimeMinutes     *int
	TotalTimeMinutes    *int
	TimeConfidence      string
	MealTypes           []string
	Cuisine             *string
	Difficulty          *int
	EquipmentRequired   []string
	IsComponent         bool
	Tags                []string
	CaloriesKcal        *float64
	ProteinG            *float64
	CarbsG              *float64
	FatG                *float64
	FiberG              *float64
	SodiumMg            *float64
	NutritionBasis      *string
	NutritionConfidence *string
	// Computed server-side. Incomplete recipes stay viewable but are never
	// auto-planned.
	BaseMealPlanEligible bool
	MissingInformation   []string

	Ingredients  []RecipeIngredient
	Instructions []RecipeInstruction
}

// MealPlan is a generated or hand-assembled week. Request snapshots the
// questionnaire so a plan can always be regenerated from what the user said.
type MealPlan struct {
	ID            string
	UserID        string
	Status        string
	StartDate     time.Time
	Days          int
	HouseholdSize int
	Request       []byte
	BudgetAmount  *float64
	// Costs are always a range with a confidence, never a bare number.
	EstimatedCostPoint *float64
	EstimatedCostLow   *float64
	EstimatedCostHigh  *float64
	CostConfidence     *string
	PennyMessage       string
	Assumptions        []string
	GenerationSource   string
	GenerationVersion  string
	CreatedAt          time.Time
	UpdatedAt          time.Time

	Meals []MealPlanMeal
}

type MealPlanMeal struct {
	ID                  string
	MealPlanID          string
	Day                 int
	MealType            string
	RecipeID            string
	ScaleFactor         float64
	ServingsPlanned     float64
	PantryIngredientIDs []string
	ConsumedCost        *float64
	Why                 *string
}

type GroceryList struct {
	ID                 string
	MealPlanID         string
	UserID             string
	EstimatedCostPoint *float64
	EstimatedCostLow   *float64
	EstimatedCostHigh  *float64
	CostConfidence     *string

	Items []GroceryListItem
}

// GroceryListItem is consolidated across every recipe in the plan. Items
// already in the pantry are kept with InPantry true and zero cost, not hidden.
type GroceryListItem struct {
	ID             string
	GroceryListID  string
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
