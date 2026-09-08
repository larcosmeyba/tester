package meals

import "time"

// Meal prep: the batch work a week's plan makes possible.
//
// A prep plan is derived from a meal plan, never entered by hand. It says
// nothing the plan did not already imply — the same onion diced once instead of
// four times, the same grain cooked once for three dinners — which is why it
// can always be recomputed rather than kept in sync.

// Prep task kinds.
const (
	// PrepBatchIngredient is one ingredient prepared once for several meals.
	PrepBatchIngredient = "batch_ingredient"
	// PrepBatchCook is a whole recipe cooked once for several servings.
	PrepBatchCook = "batch_cook"
)

// Storage guidance. Derived from the ingredient's food group and the recipe's
// tags, never from a claim about how long something is safe to keep.
const (
	StorageRefrigerate = "refrigerate"
	StorageFreeze      = "freeze"
	StoragePantry      = "pantry"
)

// PrepTask is one piece of work to do ahead of the week.
type PrepTask struct {
	ID            string
	PrepPlanID    string
	Position      int
	Kind          string
	Title         string
	Instruction   string
	ActiveMinutes int
	// How much to prepare, in the ingredient's own reference unit. Nil when the
	// recipes never stated a quantity — the task says so rather than guessing.
	PortionAmount *float64
	PortionUnit   *string
	Storage       string
	KeepsDays     *int
	IngredientIDs []string
	RecipeIDs     []string
	// Which slots in the plan this feeds, as "day:meal_type".
	ServesSlots []string
	IsDone      bool
}

// PrepPlan is the whole week's prep work.
type PrepPlan struct {
	ID         string
	MealPlanID string
	UserID     string
	// Hands-on time, not elapsed time.
	TotalActiveMinutes int
	Tasks              []PrepTask
	CreatedAt          time.Time
	UpdatedAt          time.Time
}
