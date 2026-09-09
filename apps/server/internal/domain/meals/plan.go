package meals

import (
	"errors"
	"time"
)

// Slot is one day and meal type in a plan. Days are 1-based.
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

type PlanSummary struct {
	HouseholdSize int
	MealsPlanned  int
	Budget        *float64
	EstimatedCost CostRange
	// Budget minus EstimatedCost.High; nil when no budget was set. Negative
	// when the plan costs more than the budget.
	Headroom *float64
	// OverBudget is true when even the cheapest safe plan costs more than the
	// budget allows. The plan is still returned: a household is not made safer
	// by being handed nothing, and the alternative — dropping an allergy or a
	// diet to hit a number — is never acceptable.
	OverBudget bool
	// Overage is how much over, when OverBudget. Nil otherwise.
	Overage              *float64
	ConsumedCostTotal    *float64
	PantryValueUsed      *float64
	PantryItemsUsed      []string
	NutritionGoal        *NutritionGoalSummary
	BalancedMealBaseline *BalancedMealBaseline
}

// Plan is a week as the app sees it: the meals, the consolidated list and what
// the plan cost. It is what every meal-plan resolver returns.
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

// MealPlan is a plan as it is stored. Request snapshots the questionnaire so a
// plan can always be regenerated from what the user actually said.
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

// ValidateSlot rejects a slot outside the plan's bounds. It is a domain rule:
// a slot on day 12, or in a category that cannot be planned, is not a slot,
// whichever module is being asked about it.
func ValidateSlot(slot Slot) error {
	if slot.Day < 1 || slot.Day > MaxPlanDays {
		return errors.New("day is outside the plan")
	}
	for _, mealType := range PlannableMealTypes {
		if mealType == slot.MealType {
			return nil
		}
	}
	return errors.New("meal type cannot be planned")
}
