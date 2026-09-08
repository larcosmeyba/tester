package meals

import (
	"math"
	"sort"

	"github.com/helpthehive/server/internal/db"
)

// Planner turns a validated request and a recipe pool into a costed week. It is
// deterministic: the same request and the same pool always produce the same
// plan, which is what makes a plan reproducible and testable.
type Planner struct {
	Catalog *Catalog
}

func NewPlanner(catalog *Catalog) *Planner { return &Planner{Catalog: catalog} }

// RequestedSlots lists the slots the questionnaire asked for: one per day for
// each category, up to the number of that category the user chose.
func RequestedSlots(request PlanRequest) []Slot {
	var slots []Slot
	for _, mealType := range PlannableMealTypes {
		count := request.Meals.For(mealType)
		if count > request.Days {
			count = request.Days
		}
		for day := 1; day <= count; day++ {
			slots = append(slots, Slot{Day: day, MealType: mealType})
		}
	}
	sort.SliceStable(slots, func(i, j int) bool {
		if slots[i].Day != slots[j].Day {
			return slots[i].Day < slots[j].Day
		}
		return mealTypeOrder(slots[i].MealType) < mealTypeOrder(slots[j].MealType)
	})
	return slots
}

func mealTypeOrder(mealType string) int {
	for i, candidate := range PlannableMealTypes {
		if candidate == mealType {
			return i
		}
	}
	return len(PlannableMealTypes)
}

// Build fills every requested slot, then prices the week as one basket.
//
// A slot with no eligible recipe is left empty. The plan reports fewer meals
// than were asked for rather than inventing one or reusing a recipe the filters
// rejected.
//
// Picking is all this does. Scaling, pantry credit, pricing and consolidation
// happen in assemble, which the AI generator shares, so a week costs the same
// whether the deterministic planner or a provider chose it.
func (p *Planner) Build(request PlanRequest, pool []db.Recipe, planID string) Plan {
	pantry := set(request.PantryItems...)
	slots := RequestedSlots(request)

	scores := make(map[string]float64, len(pool))
	for _, recipe := range pool {
		scores[recipe.ID] = Score(recipe, request, p.Catalog, pantry)
	}

	used := map[string]int{}
	assignments := make([]assignment, 0, len(slots))
	for _, slot := range slots {
		recipe, ok := p.pick(pool, slot, request, scores, used)
		if !ok {
			continue
		}
		used[recipe.ID]++
		assignments = append(assignments, assignment{Slot: slot, Recipe: recipe})
	}

	return enforceBudget(request, assignments, pool, p.Catalog, planID, len(slots))
}

// pick chooses the best-scoring recipe for a slot, penalising anything already
// used this week so a plan does not collapse onto one dish.
func (p *Planner) pick(pool []db.Recipe, slot Slot, request PlanRequest, scores map[string]float64, used map[string]int) (db.Recipe, bool) {
	var best db.Recipe
	bestScore := math.Inf(-1)
	found := false

	for _, recipe := range pool {
		if !contains(recipe.MealTypes, slot.MealType) {
			continue
		}
		// "No leftovers" means a recipe is never planned twice in one week.
		if request.Leftovers == "no" && used[recipe.ID] > 0 {
			continue
		}
		score := scores[recipe.ID] - float64(used[recipe.ID])*weightRepeatPenalty
		// Ties break on recipe id, so the same request always produces the same
		// week rather than depending on row order.
		if score > bestScore || (score == bestScore && found && recipe.ID < best.ID) {
			best, bestScore, found = recipe, score, true
		}
	}
	return best, found
}

func (p *Planner) summarize(request PlanRequest, meals []PlannedMeal, basket Basket) PlanSummary {
	summary := PlanSummary{
		HouseholdSize:        request.Household.Size,
		MealsPlanned:         len(meals),
		EstimatedCost:        basket.Cost,
		BalancedMealBaseline: &BalancedMealBaseline{Applied: true},
	}

	if request.Budget.Enabled() {
		budget := request.Budget.Amount
		summary.Budget = &budget
		// Headroom is measured against the range's upper bound, never the point
		// estimate: a plan is only "within budget" if its worst case is.
		headroom := roundCents(budget - basket.Cost.High)
		summary.Headroom = &headroom
	}

	var consumedTotal float64
	var consumedKnown bool
	pantryUsedIDs := map[string]bool{}
	for _, meal := range meals {
		if meal.ConsumedCost != nil {
			consumedTotal += *meal.ConsumedCost
			consumedKnown = true
		}
		for _, id := range meal.PantryIngredientsUsed {
			pantryUsedIDs[id] = true
		}
	}
	if consumedKnown {
		rounded := roundCents(consumedTotal)
		summary.ConsumedCostTotal = &rounded
	}
	summary.PantryItemsUsed = sortedKeys(pantryUsedIDs)

	if value := p.pantryValue(pantryUsedIDs); value != nil {
		summary.PantryValueUsed = value
	}
	summary.NutritionGoal = nutritionSummary(request, meals)
	return summary
}

// pantryValue is what the pantry contributed, priced at one reference unit per
// ingredient. It is a floor, not a claim about how much was actually used.
func (p *Planner) pantryValue(ids map[string]bool) *float64 {
	var total float64
	var known bool
	for id := range ids {
		if price, ok := p.Catalog.Price(id); ok {
			total += price.UnitPrice
			known = true
		}
	}
	if !known {
		return nil
	}
	rounded := roundCents(total)
	return &rounded
}

// nutritionSummary counts how many planned meals carry the user's first
// nutrition goal. It reports a count, never a health claim.
func nutritionSummary(request PlanRequest, meals []PlannedMeal) *NutritionGoalSummary {
	if len(request.NutritionPreferences) == 0 || len(meals) == 0 {
		return nil
	}
	goal := request.NutritionPreferences[0].Goal
	summary := &NutritionGoalSummary{Goal: goal, Of: len(meals)}

	var proteinTotal float64
	var proteinCount int
	for _, meal := range meals {
		if meal.GoalIndicator != nil && *meal.GoalIndicator == goal {
			summary.MetBy++
		}
		if meal.ProteinGPerServing != nil {
			proteinTotal += *meal.ProteinGPerServing
			proteinCount++
		}
	}
	if proteinCount > 0 {
		average := math.Round(proteinTotal/float64(proteinCount)*10) / 10
		summary.AvgProteinG = &average
	}
	return summary
}

func pantryUsed(recipe db.Recipe, pantry map[string]bool, catalog *Catalog) []string {
	var used []string
	for _, line := range PurchasableLines(recipe) {
		if line.IngredientID == nil {
			continue
		}
		if catalog.Matches(*line.IngredientID, pantry) {
			used = appendUnique(used, *line.IngredientID)
		}
	}
	return used
}

func primaryGoal(request PlanRequest) *string {
	if len(request.NutritionPreferences) == 0 {
		return nil
	}
	goal := request.NutritionPreferences[0].Goal
	return &goal
}

func sortedKeys(values map[string]bool) []string {
	keys := make([]string, 0, len(values))
	for key := range values {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	return keys
}
