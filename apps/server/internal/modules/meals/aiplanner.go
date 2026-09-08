package meals

import (
	"context"
	"errors"
	"log/slog"
	"sort"
	"strconv"

	"github.com/helpthehive/server/internal/db"
	"github.com/helpthehive/server/internal/modules/meals/generator"
)

// The AI meal-plan generator.
//
// It sits between the hard filters and the grocery list, and it is the only
// place a model influences what a household eats. The influence is bounded on
// both sides:
//
//	catalogue ─▶ hard filters ─▶ candidate pool ─▶ [provider picks] ─▶ re-check
//	                                                                    │
//	                          scaling · pantry credit · pricing ◀────────┘
//	                                       │
//	                                  grocery list
//
// Before the provider is asked, EligibleRecipes has already removed everything
// the user's allergies, required diets, dislikes, equipment and time limit
// exclude, so every id offered is one this household can safely eat. After the
// provider answers, its reply is validated against the brief and the chosen
// recipes are put through the same filters a second time. A model can therefore
// change the *order* and *combination* of a safe week. It cannot introduce a
// recipe, weaken a filter, set a price, decide a quantity or write a number.
//
// If the provider is not configured, is slow, errors, or returns something that
// fails validation, the deterministic planner produces the week instead and the
// user's plan is unaffected. An AI outage never costs someone their meal plan.

// AIPlanner builds a week, preferring a provider's selection and falling back
// to the deterministic planner.
type AIPlanner struct {
	Provider generator.Provider
	Catalog  *Catalog
	Logger   *slog.Logger
}

func NewAIPlanner(provider generator.Provider, catalog *Catalog, logger *slog.Logger) *AIPlanner {
	if provider == nil {
		provider = generator.Disabled{}
	}
	if logger == nil {
		logger = slog.Default()
	}
	return &AIPlanner{Provider: provider, Catalog: catalog, Logger: logger}
}

// GenerationSourceAI and GenerationSourceDeterministic are recorded on every
// plan, so it is always answerable which path produced a given week.
const (
	GenerationSourceAI            = "ai"
	GenerationSourceDeterministic = "deterministic"
)

// Build returns the plan and the source that produced it.
func (p *AIPlanner) Build(ctx context.Context, request PlanRequest, pool []db.Recipe, planID string) (Plan, string) {
	deterministic := func() (Plan, string) {
		return NewPlanner(p.Catalog).Build(request, pool, planID), GenerationSourceDeterministic
	}

	slots := RequestedSlots(request)
	if len(slots) == 0 || len(pool) == 0 {
		return deterministic()
	}

	brief := p.brief(request, pool, slots)
	prompt, err := brief.UserPrompt()
	if err != nil {
		return deterministic()
	}

	schema := generator.PlanResponseSchema()
	response, err := p.Provider.Complete(ctx, generator.Request{
		System:    generator.PlanBriefSystemPrompt,
		User:      prompt,
		MaxTokens: maxPlanReplyTokens,
		Schema:    &generator.ResponseSchema{Name: generator.PlanSchemaName, Schema: schema},
	})
	if err != nil {
		// No provider configured is the ordinary case, not a fault.
		if !errors.Is(err, generator.ErrNoProvider) {
			p.Logger.Warn("ai meal plan unavailable", "plan_id", planID, "error", err.Error())
		}
		return deterministic()
	}

	selections, err := generator.ValidatePlanDraft(response.Text, brief)
	if err != nil {
		// A rejected plan is a safety event worth seeing. The reply itself is
		// not logged, because it may contain whatever the model made up.
		p.Logger.Warn("ai meal plan rejected",
			"plan_id", planID, "provider", response.Provider, "reason", generator.PlanRejection(err))
		return deterministic()
	}

	assignments, ok := p.assignmentsFrom(selections, pool, request)
	if !ok {
		p.Logger.Warn("ai meal plan failed the second safety check",
			"plan_id", planID, "provider", response.Provider)
		return deterministic()
	}
	if len(assignments) == 0 {
		return deterministic()
	}

	// Slots the provider left empty are filled deterministically rather than
	// left blank: the user asked for those meals.
	assignments = p.fillGaps(assignments, slots, pool, request)

	return enforceBudget(request, assignments, pool, p.Catalog, planID, len(slots)), GenerationSourceAI
}

// A selection reply is short by construction — at most 28 small objects — so
// the cap is generous enough to never truncate a valid answer and small enough
// to bound a runaway one.
const maxPlanReplyTokens = 1500

// brief describes the pool to the provider. Candidates are ordered by the same
// score the deterministic planner uses and truncated to the brief's limit, so
// when the pool is larger than a provider should see, what it sees is the best
// of it rather than an arbitrary slice.
func (p *AIPlanner) brief(request PlanRequest, pool []db.Recipe, slots []Slot) generator.PlanBrief {
	pantry := set(request.PantryItems...)
	goal := primaryGoal(request)

	ranked := make([]db.Recipe, len(pool))
	copy(ranked, pool)
	scores := make(map[string]float64, len(ranked))
	for _, recipe := range ranked {
		scores[recipe.ID] = Score(recipe, request, p.Catalog, pantry)
	}
	sort.SliceStable(ranked, func(i, j int) bool {
		if scores[ranked[i].ID] != scores[ranked[j].ID] {
			return scores[ranked[i].ID] > scores[ranked[j].ID]
		}
		return ranked[i].ID < ranked[j].ID
	})
	if len(ranked) > generator.MaxCandidates {
		ranked = ranked[:generator.MaxCandidates]
	}

	brief := generator.PlanBrief{Leftovers: request.Leftovers}
	for _, slot := range slots {
		brief.Slots = append(brief.Slots, generator.BriefSlot{Day: slot.Day, MealType: slot.MealType})
	}
	if request.Budget.Enabled() {
		amount := request.Budget.Amount
		brief.Budget = &amount
	}
	for _, recipe := range ranked {
		scale := ScaleFactor(recipe, request.Household.Size)
		brief.Candidates = append(brief.Candidates, generator.BriefRecipe{
			RecipeID:         recipe.ID,
			Title:            recipe.Title,
			MealTypes:        recipe.MealTypes,
			TotalTimeMinutes: recipe.TotalTimeMinutes,
			EstimatedCost:    consumedCost(recipe, scale, pantry, p.Catalog),
			PantryOverlap:    len(pantryUsed(recipe, pantry, p.Catalog)),
			MeetsGoal:        goal != nil && hasTag(recipe, "nutrition."+*goal),
		})
	}
	return brief
}

// assignmentsFrom turns validated selections into recipes, re-applying the hard
// filters on the way.
//
// The pool was already filtered, so this check should never fire. It is here
// because "should never fire" is not a safety guarantee: if pool construction
// is ever changed, or a caller passes a pool that was built differently, this
// is what stops a recipe the user is allergic to reaching a plan. The cost is
// one pass over at most 28 recipes.
func (p *AIPlanner) assignmentsFrom(selections []generator.PlanSelection, pool []db.Recipe, request PlanRequest) ([]assignment, bool) {
	byID := make(map[string]db.Recipe, len(pool))
	for _, recipe := range pool {
		byID[recipe.ID] = recipe
	}

	assignments := make([]assignment, 0, len(selections))
	for _, selection := range selections {
		recipe, ok := byID[selection.RecipeID]
		if !ok {
			return nil, false
		}
		if ViolatesAllergy(recipe, request, p.Catalog) ||
			ViolatesDiet(recipe, request, p.Catalog) ||
			ViolatesDislikes(recipe, request, p.Catalog) ||
			ViolatesEquipment(recipe, request) ||
			ViolatesTime(recipe, request) ||
			!recipe.BaseMealPlanEligible || recipe.IsComponent {
			return nil, false
		}
		assignments = append(assignments, assignment{
			Slot:   Slot{Day: selection.Day, MealType: selection.MealType},
			Recipe: recipe,
		})
	}
	return assignments, true
}

// fillGaps completes a partial selection with the deterministic picker, using
// the same scoring and repeat rules, so a provider that returns four of five
// slots does not silently shorten the user's week.
func (p *AIPlanner) fillGaps(assignments []assignment, slots []Slot, pool []db.Recipe, request PlanRequest) []assignment {
	filled := make(map[string]bool, len(assignments))
	used := map[string]int{}
	for _, a := range assignments {
		filled[slotKey(a.Slot)] = true
		used[a.Recipe.ID]++
	}

	pantry := set(request.PantryItems...)
	scores := make(map[string]float64, len(pool))
	for _, recipe := range pool {
		scores[recipe.ID] = Score(recipe, request, p.Catalog, pantry)
	}

	planner := NewPlanner(p.Catalog)
	for _, slot := range slots {
		if filled[slotKey(slot)] {
			continue
		}
		recipe, ok := planner.pick(pool, slot, request, scores, used)
		if !ok {
			continue
		}
		used[recipe.ID]++
		assignments = append(assignments, assignment{Slot: slot, Recipe: recipe})
	}

	order := make(map[string]int, len(slots))
	for i, slot := range slots {
		order[slotKey(slot)] = i
	}
	sort.SliceStable(assignments, func(i, j int) bool {
		return order[slotKey(assignments[i].Slot)] < order[slotKey(assignments[j].Slot)]
	})
	return assignments
}

func slotKey(slot Slot) string {
	return slot.MealType + "@" + strconv.Itoa(slot.Day)
}

// ---------------------------------------------------------------------------
// Assembly
// ---------------------------------------------------------------------------

// assignment is one slot and the recipe that fills it, after every filter has
// been applied. It is the single input to plan assembly, whether the slots were
// chosen by the deterministic planner or by a provider.
type assignment struct {
	Slot   Slot
	Recipe db.Recipe
}

// assemble turns chosen recipes into a costed plan.
//
// Everything a user sees a number for is computed here, from catalogue data:
// the scale each recipe is cooked at, how many servings that is, which
// ingredients came from the pantry, what each meal consumes, the consolidated
// basket and the cost range. Selection is the only thing upstream decides.
func assemble(request PlanRequest, assignments []assignment, catalog *Catalog, planID string, slotCount int) Plan {
	pantry := set(request.PantryItems...)

	meals := make([]PlannedMeal, 0, len(assignments))
	chosen := make([]PlannedRecipe, 0, len(assignments))

	for _, a := range assignments {
		scale := ScaleFactor(a.Recipe, request.Household.Size)
		chosen = append(chosen, PlannedRecipe{Recipe: a.Recipe, Scale: scale})
		meals = append(meals, PlannedMeal{
			Slot:                  a.Slot,
			RecipeID:              a.Recipe.ID,
			Title:                 a.Recipe.Title,
			TotalTimeMinutes:      a.Recipe.TotalTimeMinutes,
			ScaleFactor:           scale,
			ServingsPlanned:       ServingsPlanned(a.Recipe, request.Household.Size, scale),
			ProteinGPerServing:    a.Recipe.ProteinG,
			GoalIndicator:         primaryGoal(request),
			PantryIngredientsUsed: pantryUsed(a.Recipe, pantry, catalog),
			ConsumedCost:          consumedCost(a.Recipe, scale, pantry, catalog),
		})
	}

	basket := BuildBasket(chosen, pantry, catalog)
	plan := Plan{
		PlanID:      planID,
		Status:      "ok",
		Summary:     NewPlanner(catalog).summarize(request, meals, basket),
		Meals:       meals,
		GroceryList: GroupByAisle(basket.Items, catalog),
		SwapOptions: []string{"swap_slot", "cheaper", "higher_protein", "faster", "dislike", "regenerate_week"},
		Assumptions: basket.Assumptions,
	}
	if len(meals) < slotCount {
		plan.Status = "partial"
		plan.Assumptions = append(plan.Assumptions,
			"Some slots could not be filled from the recipes that match your requirements.")
	}
	return plan
}

// ErrNoPreferences is returned when a plan is asked for without a questionnaire
// and none has been saved. It is not a failure of the generator: there is
// nothing to plan from, and defaults nobody chose would be worse than saying so.
var ErrNoPreferences = errors.New("answer the meal questionnaire before generating a plan")
