package meals

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

// RecipeFilter narrows the library. Ownership is not part of it: every query
// returns public library recipes plus the caller's own, and nothing else.
type RecipeFilter struct {
	// Taxonomy ids. A recipe must carry all of them.
	TagIDs   []string
	MealType string
	Search   string
	Limit    int
	// true restricts to recipes the engine is allowed to plan automatically.
	PlannableOnly bool
	// Restricts to recipes the user has saved.
	SavedOnly bool
}
