// Package mealgen is the meal generator: it decides what a user may eat and
// which of those recipes fills each slot in a week.
//
// The pipeline is filter → scale → pantry → price → score → optimise →
// consolidate. Everything that decides what a user *may* eat is deterministic:
// the same request against the same library produces the same eligible pool,
// with ties broken on recipe id.
//
// A provider is asked two questions, both of them after safety has been
// settled. The arranger asks which of the already-eligible recipes go in which
// slots — variety, ingredient reuse, leftovers — and every id it returns is
// checked back against that pool. The narrator asks for the sentence that
// explains a week that is already chosen and priced. Neither can widen what is
// allowed, and either failing costs an arrangement or a sentence, never a plan:
// with no provider configured the whole module runs deterministically.
//
// It generates; it does not persist. Saving a plan, moving a meal and reading
// one back are the meal plan module's job.
package mealgen

import (
	"context"
	"errors"
	"log/slog"

	"github.com/helpthehive/server/internal/domain/meals"
	"github.com/helpthehive/server/internal/modules/catalog"
	"github.com/helpthehive/server/internal/modules/kroger"
	"github.com/helpthehive/server/internal/modules/mealgen/provider"
)

// libraryLimit caps how many recipes are considered for one plan. The library
// is small today; the cap is here so it staying small is a choice rather than
// an accident.
const libraryLimit = 200

// Repository is what the generator needs from the database: the recipes it is
// allowed to plan. It is declared here rather than imported so the module
// states its own requirements; *db.Store satisfies it.
type Repository interface {
	ListRecipes(ctx context.Context, userID string, filter meals.RecipeFilter) ([]meals.Recipe, error)
}

type Service struct {
	repo      Repository
	catalog   *catalog.Service
	arranger  *Arranger
	narrator  *Narrator
	generator *Generator
	pricer    *LivePricer
	kroger    kroger.Provider
	logger    *slog.Logger
}

func NewService(repo Repository, catalogService *catalog.Service, aiProvider provider.Provider, krogerProvider kroger.Provider, logger *slog.Logger) *Service {
	if logger == nil {
		logger = slog.Default()
	}
	if krogerProvider == nil {
		krogerProvider = kroger.Unconfigured{}
	}
	return &Service{
		repo:      repo,
		catalog:   catalogService,
		arranger:  NewArranger(aiProvider, logger),
		narrator:  NewNarrator(aiProvider, logger),
		generator: NewGenerator(aiProvider, nil, logger),
		pricer:    NewLivePricer(krogerProvider, logger),
		kroger:    krogerProvider,
		logger:    logger,
	}
}

// Build turns a questionnaire into a costed week and Penny's message for it.
// It saves nothing: the caller decides whether the plan becomes the user's.
//
// The second return value is where the message came from — "ai" or
// "deterministic" — which is recorded on the plan so a message can always be
// traced to what wrote it.
func (s *Service) Build(ctx context.Context, userID string, request meals.PlanRequest, planID string) (meals.Plan, string, error) {
	pool, cat, err := s.eligible(ctx, userID, request)
	if err != nil {
		return meals.Plan{}, "", err
	}

	// When the library cannot fill the week, the AI invents recipes from the
	// questionnaire answers. This is how a new user with no saved recipes
	// still gets a full plan: the model generates, the arranger places, and
	// the planner costs.
	slots := RequestedSlots(request)
	if len(pool) < len(slots) {
		needed := len(slots) - len(pool)
		// The resolver maps the AI's free-text ingredient names to catalog
		// IDs so pricing works. Unresolved names stay as free text.
		if resolver, err := s.catalog.Resolver(ctx); err == nil {
			s.generator.Resolve = catalogResolver{resolver}
		}
		if generated := s.generator.Generate(ctx, request, needed); len(generated) > 0 {
			pool = append(pool, generated...)
			s.logger.Info("ai generated recipes for empty library",
				"generated", len(generated), "library", len(pool)-len(generated))
		}
	}

	// The model is asked which of the already-safe recipes go where. It cannot
	// widen the pool, and anything it does not answer for is filled
	// deterministically — so with no provider configured this is a no-op and
	// the week is exactly the one the planner would have built alone.
	arrangement := s.arranger.Arrange(ctx, request, pool, slots,
		meals.Set(request.PantryItems...), cat)

	plan := NewPlanner(cat).BuildWith(request, pool, planID, arrangement)

	// Live Kroger pricing for the user's area replaces the stored estimates
	// on the grocery list when a postal code was provided. Without one, or
	// when Kroger is unconfigured, the estimates stand.
	if request.PostalCode != "" {
		var liveCount int
		plan, liveCount = s.pricer.PricePlan(ctx, request.PostalCode, plan)
		if liveCount > 0 {
			s.logger.Info("plan priced with live kroger data",
				"live_items", liveCount, "postal_code", request.PostalCode)
		}
	}

	message, source := s.narrator.Describe(ctx, plan)
	plan.PennyMessage = message
	return plan, source, nil
}

// Replacement re-picks one slot and returns the meal row to store in its place.
//
// The candidate pool has already passed every hard filter, so an action only
// reorders what is already safe: a swap can never introduce a recipe the user's
// allergies or diet excluded.
func (s *Service) Replacement(
	ctx context.Context,
	userID string,
	request meals.PlanRequest,
	slot meals.Slot,
	action string,
	inPlan map[string]bool,
	currentRecipeID string,
) (meals.MealPlanMeal, error) {
	pool, cat, err := s.eligible(ctx, userID, request)
	if err != nil {
		return meals.MealPlanMeal{}, err
	}

	replacement, ok := chooseReplacement(pool, slot, action, request, cat, inPlan, currentRecipeID)
	if !ok {
		return meals.MealPlanMeal{}, errors.New("no other recipe matches your requirements for that slot")
	}

	pantry := meals.Set(request.PantryItems...)
	scale := meals.ScaleFactor(replacement, request.Household.Size)
	return meals.MealPlanMeal{
		RecipeID:            replacement.ID,
		ScaleFactor:         scale,
		ServingsPlanned:     meals.ServingsPlanned(replacement, request.Household.Size, scale),
		PantryIngredientIDs: pantryUsed(replacement, pantry, cat),
		ConsumedCost:        consumedCost(replacement, scale, pantry, cat),
	}, nil
}

// Validate normalises a request and rejects one the planner cannot honour. It
// is exported because the plan module validates before it saves anything.
func Validate(request *meals.PlanRequest) error {
	request.Normalize()
	return request.Validate()
}

// eligible loads the catalogue and the plannable library, then applies every
// hard filter. Both are read together so a plan is never built against a
// catalogue that moved underneath it.
func (s *Service) eligible(ctx context.Context, userID string, request meals.PlanRequest) ([]meals.Recipe, *meals.Catalog, error) {
	cat, err := s.catalog.Load(ctx, request.PlanScope)
	if err != nil {
		return nil, nil, err
	}
	library, err := s.repo.ListRecipes(ctx, userID, meals.RecipeFilter{PlannableOnly: true, Limit: libraryLimit})
	if err != nil {
		return nil, nil, err
	}
	return EligibleRecipes(library, request, cat), cat, nil
}

// SwapActions are the ways a user may re-pick a slot. `regenerate_week` is
// handled by the plan module, which owns rebuilding a whole week.
var SwapActions = []string{"swap_slot", "cheaper", "higher_protein", "faster", "dislike", "regenerate_week"}

var validSwapActions = meals.Set(SwapActions...)

// IsSwapAction reports whether an action is one the generator understands.
func IsSwapAction(action string) bool { return validSwapActions[action] }

// chooseReplacement re-picks one slot from a pool that has already passed every
// hard filter.
func chooseReplacement(pool []meals.Recipe, slot meals.Slot, action string, request meals.PlanRequest, catalog *meals.Catalog, inPlan map[string]bool, currentID string) (meals.Recipe, bool) {
	pantry := meals.Set(request.PantryItems...)
	var best meals.Recipe
	var bestScore float64
	found := false

	for _, recipe := range pool {
		if recipe.ID == currentID || !contains(recipe.MealTypes, slot.MealType) {
			continue
		}
		if inPlan[recipe.ID] && request.Leftovers == "no" {
			continue
		}
		score := Score(recipe, request, catalog, pantry)
		switch action {
		case "cheaper":
			if cost := consumedCost(recipe, meals.ScaleFactor(recipe, request.Household.Size), pantry, catalog); cost != nil {
				score -= *cost
			}
		case "higher_protein":
			if recipe.ProteinG != nil {
				score += *recipe.ProteinG
			}
		case "faster":
			if recipe.TotalTimeMinutes != nil {
				score -= float64(*recipe.TotalTimeMinutes) / 5
			}
		}
		if !found || score > bestScore || (score == bestScore && recipe.ID < best.ID) {
			best, bestScore, found = recipe, score, true
		}
	}
	return best, found
}

// Chosen builds the meal row for a recipe the user picked themselves.
//
// Choosing explicitly is not choosing past a filter. The recipe still has to be
// in this user's eligible pool — the same pool generation draws from — so a
// recipe their allergies or a required diet excluded is refused here just as it
// would never have been offered. It is also checked against the slot's meal
// type, so dessert cannot be planned as breakfast by asking directly.
func (s *Service) Chosen(ctx context.Context, userID string, request meals.PlanRequest, slot meals.Slot, recipeID string) (meals.MealPlanMeal, error) {
	pool, cat, err := s.eligible(ctx, userID, request)
	if err != nil {
		return meals.MealPlanMeal{}, err
	}

	var chosen meals.Recipe
	found := false
	for _, recipe := range pool {
		if recipe.ID == recipeID {
			chosen, found = recipe, true
			break
		}
	}
	if !found {
		// Deliberately one message for "no such recipe" and "not one you can
		// eat": which of the two it is would itself tell the caller something.
		return meals.MealPlanMeal{}, errors.New("that recipe is not available for this plan")
	}
	if !contains(chosen.MealTypes, slot.MealType) {
		return meals.MealPlanMeal{}, errors.New("that recipe cannot be planned for that meal")
	}

	pantry := meals.Set(request.PantryItems...)
	scale := meals.ScaleFactor(chosen, request.Household.Size)
	return meals.MealPlanMeal{
		RecipeID:            chosen.ID,
		ScaleFactor:         scale,
		ServingsPlanned:     meals.ServingsPlanned(chosen, request.Household.Size, scale),
		PantryIngredientIDs: pantryUsed(chosen, pantry, cat),
		ConsumedCost:        consumedCost(chosen, scale, pantry, cat),
	}, nil
}

// catalogResolver adapts *catalog.Resolver to the generator's
// IngredientResolver interface.
type catalogResolver struct {
	inner *catalog.Resolver
}

func (c catalogResolver) ResolveIngredient(name string) string {
	if c.inner == nil {
		return ""
	}
	resolution := c.inner.Resolve(name)
	if !resolution.Resolved() {
		return ""
	}
	return resolution.IngredientID
}
