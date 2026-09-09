package meals

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

// GroceryItem is one consolidated line. An item already in the pantry stays on
// the list with InPantry true and a zero estimate rather than disappearing, so
// nothing silently goes missing from a shop.
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
	// PartiallyInPantry means the user owns some of this and the quantity below
	// is only the shortfall. It is separate from InPantry because "you own this,
	// buy none" and "you own some, buy the rest" are different instructions to
	// a shopper.
	PartiallyInPantry bool
	// PantryMayCover means the ingredient is in the pantry but without a usable
	// amount, so the full quantity is still listed. The pantry may already
	// cover some or all of it; nobody knows, and the list says so rather than
	// assuming enough exists and sending someone home short.
	PantryMayCover bool
	IsChecked      bool
	UsedBy         []string
}

type GrocerySection struct {
	Aisle string
	Items []GroceryItem
}

// Basket is a consolidated, pantry-aware shopping list for a set of recipes.
type Basket struct {
	Items []GroceryItem
	Cost  CostRange
	// Notes the user is entitled to see: what could not be priced, and what was
	// assumed. They are facts about the computation, never reassurance.
	Assumptions []string
}

// PlannedRecipe is one occurrence of a recipe in a plan, at the scale it will
// be cooked. A dish planned for two nights appears twice.
type PlannedRecipe struct {
	Recipe Recipe
	Scale  float64
}

// GroceryListResult is a consolidated list plus its cost. It is returned both
// for a saved plan and for an ad-hoc "choose my recipes" selection.
type GroceryListResult struct {
	PlanID   *string
	Sections []GrocerySection
	Cost     CostRange
}

// GroceryList is a saved list, as stored against a plan.
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

// GroceryListItem is one stored line of a saved list.
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
