package meals

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
