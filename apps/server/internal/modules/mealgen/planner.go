package mealgen

import (
	"math"
	"sort"

	"github.com/helpthehive/server/internal/domain/meals"
	"github.com/helpthehive/server/internal/modules/grocery"
	"github.com/helpthehive/server/internal/modules/nutrition"
)

// Planner turns a validated request and a recipe pool into a costed week. It is
// deterministic: the same request and the same pool always produce the same
// plan, which is what makes a plan reproducible and testable.
type Planner struct {
	Catalog *meals.Catalog
}

func NewPlanner(catalog *meals.Catalog) *Planner { return &Planner{Catalog: catalog} }

// RequestedSlots lists the slots the questionnaire asked for: one per day for
// each category, up to the number of that category the user chose.
func RequestedSlots(request meals.PlanRequest) []meals.Slot {
	var slots []meals.Slot
	for _, mealType := range meals.PlannableMealTypes {
		count := request.Meals.For(mealType)
		if count > request.Days {
			count = request.Days
		}
		for day := 1; day <= count; day++ {
			slots = append(slots, meals.Slot{Day: day, MealType: mealType})
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
	for i, candidate := range meals.PlannableMealTypes {
		if candidate == mealType {
			return i
		}
	}
	return len(meals.PlannableMealTypes)
}

// Build fills every requested slot, then prices the week as one basket.
//
// A slot with no eligible recipe is left empty. The plan reports fewer meals
// than were asked for rather than inventing one or reusing a recipe the filters
// rejected.
func (p *Planner) Build(request meals.PlanRequest, pool []meals.Recipe, planID string) meals.Plan {
	return p.BuildWith(request, pool, planID, nil)
}

// BuildWith is Build with an optional arrangement: a slot-to-recipe assignment
// proposed by a model and already checked against the eligible pool.
//
// The arrangement is a *preference*, not an instruction. A slot it does not
// cover is filled by the same deterministic pick as always, so the week is
// always complete whether or not a provider answered, and a plan built with an
// empty arrangement is byte-identical to one built without one.
func (p *Planner) BuildWith(request meals.PlanRequest, pool []meals.Recipe, planID string, arrangement map[meals.Slot]string) meals.Plan {
	pantry := meals.Set(request.PantryItems...)
	slots := RequestedSlots(request)

	scores := make(map[string]float64, len(pool))
	byID := make(map[string]meals.Recipe, len(pool))
	for _, recipe := range pool {
		scores[recipe.ID] = Score(recipe, request, p.Catalog, pantry)
		byID[recipe.ID] = recipe
	}

	used := map[string]int{}
	var planned []meals.PlannedMeal
	var chosen []meals.PlannedRecipe

	for _, slot := range slots {
		recipe, ok := p.arranged(byID, arrangement, slot, request, used)
		if !ok {
			recipe, ok = p.pick(pool, slot, request, scores, used)
		}
		if !ok {
			continue
		}
		used[recipe.ID]++

		scale := meals.ScaleFactor(recipe, request.Household.Size)
		chosen = append(chosen, meals.PlannedRecipe{Recipe: recipe, Scale: scale})

		planned = append(planned, meals.PlannedMeal{
			Slot:                  slot,
			RecipeID:              recipe.ID,
			Title:                 recipe.Title,
			TotalTimeMinutes:      recipe.TotalTimeMinutes,
			ScaleFactor:           scale,
			ServingsPlanned:       meals.ServingsPlanned(recipe, request.Household.Size, scale),
			ProteinGPerServing:    recipe.ProteinG,
			GoalIndicator:         nutrition.PrimaryGoal(request),
			PantryIngredientsUsed: pantryUsed(recipe, pantry, p.Catalog),
			ConsumedCost:          consumedCost(recipe, scale, pantry, p.Catalog),
		})
	}

	basket := grocery.BuildBasketWithHoldings(chosen, holdingsFor(request), p.Catalog)
	summary := p.summarize(request, planned, basket)

	plan := meals.Plan{
		PlanID:      planID,
		Status:      "ok",
		Summary:     summary,
		Meals:       planned,
		GroceryList: grocery.GroupByAisle(basket.Items, p.Catalog),
		SwapOptions: []string{"swap_slot", "cheaper", "higher_protein", "faster", "dislike", "regenerate_week"},
		Assumptions: basket.Assumptions,
	}
	if len(planned) < len(slots) {
		plan.Status = "partial"
		plan.Assumptions = append(plan.Assumptions,
			"Some slots could not be filled from the recipes that match your requirements.")
	}
	return plan
}

// arranged takes the model's choice for a slot, when it made one that is still
// valid at the moment it is used.
//
// The pool check happened before this; what is re-checked here is the state of
// the week as it is being built, because "no leftovers" is a property of the
// whole plan and a model cannot be trusted to have tracked it.
func (p *Planner) arranged(byID map[string]meals.Recipe, arrangement map[meals.Slot]string, slot meals.Slot, request meals.PlanRequest, used map[string]int) (meals.Recipe, bool) {
	if len(arrangement) == 0 {
		return meals.Recipe{}, false
	}
	recipeID, ok := arrangement[slot]
	if !ok {
		return meals.Recipe{}, false
	}
	recipe, ok := byID[recipeID]
	if !ok {
		return meals.Recipe{}, false
	}
	if !contains(recipe.MealTypes, slot.MealType) {
		return meals.Recipe{}, false
	}
	if request.Leftovers == "no" && used[recipe.ID] > 0 {
		return meals.Recipe{}, false
	}
	if request.Leftovers == "sometimes" && used[recipe.ID] >= 2 {
		return meals.Recipe{}, false
	}
	return recipe, true
}

// pick chooses the best-scoring recipe for a slot, penalising anything already
// used this week so a plan does not collapse onto one dish.
func (p *Planner) pick(pool []meals.Recipe, slot meals.Slot, request meals.PlanRequest, scores map[string]float64, used map[string]int) (meals.Recipe, bool) {
	var best meals.Recipe
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

func (p *Planner) summarize(request meals.PlanRequest, planned []meals.PlannedMeal, basket meals.Basket) meals.PlanSummary {
	summary := meals.PlanSummary{
		HouseholdSize:        request.Household.Size,
		MealsPlanned:         len(planned),
		EstimatedCost:        basket.Cost,
		BalancedMealBaseline: &meals.BalancedMealBaseline{Applied: true},
	}

	if request.Budget.Enabled() {
		budget := request.Budget.Amount
		summary.Budget = &budget
		// Headroom is measured against the range's upper bound, never the point
		// estimate: a plan is only "within budget" if its worst case is.
		headroom := meals.RoundCents(budget - basket.Cost.High)
		summary.Headroom = &headroom
		if headroom < 0 {
			// Say it plainly rather than leaving a client to infer it from a
			// sign. Nothing about the plan changes: it is the cheapest week the
			// user's allergies, diet and dislikes allow, and it is returned as
			// it stands.
			summary.OverBudget = true
			overage := meals.RoundCents(-headroom)
			summary.Overage = &overage
		}
	}

	var consumedTotal float64
	var consumedKnown bool
	pantryUsedIDs := map[string]bool{}
	for _, meal := range planned {
		if meal.ConsumedCost != nil {
			consumedTotal += *meal.ConsumedCost
			consumedKnown = true
		}
		for _, id := range meal.PantryIngredientsUsed {
			pantryUsedIDs[id] = true
		}
	}
	if consumedKnown {
		rounded := meals.RoundCents(consumedTotal)
		summary.ConsumedCostTotal = &rounded
	}
	summary.PantryItemsUsed = sortedKeys(pantryUsedIDs)

	if value := p.pantryValue(pantryUsedIDs); value != nil {
		summary.PantryValueUsed = value
	}
	summary.NutritionGoal = nutrition.GoalSummary(request, planned)
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
	rounded := meals.RoundCents(total)
	return &rounded
}

func pantryUsed(recipe meals.Recipe, pantry map[string]bool, catalog *meals.Catalog) []string {
	var used []string
	for _, line := range meals.PurchasableLines(recipe) {
		if line.IngredientID == nil {
			continue
		}
		if catalog.Matches(*line.IngredientID, pantry) {
			used = appendUnique(used, *line.IngredientID)
		}
	}
	return used
}

func sortedKeys(values map[string]bool) []string {
	keys := make([]string, 0, len(values))
	for key := range values {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	return keys
}

// holdingsFor is what the user has on hand, with quantities when the server
// filled them in. Falling back to presence-only keeps every path that has no
// quantities behaving exactly as it did.
func holdingsFor(request meals.PlanRequest) map[string]meals.PantryHolding {
	if len(request.PantryHoldings) > 0 {
		return request.PantryHoldings
	}
	return meals.HoldingsFromIDs(request.PantryItems)
}
