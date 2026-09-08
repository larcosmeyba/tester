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

// AisleOrder is the display order of grocery sections.
var AisleOrder = []string{
	"produce", "meat_seafood", "dairy_refrigerated", "pantry",
	"canned", "frozen", "bakery", "spice", "other",
}

// EngineVersion is stamped on every plan so a stored plan can always be read
// back by the code that wrote it.
const EngineVersion = "v1"
