package mealgen

import (
	"context"
	"log/slog"

	"github.com/helpthehive/server/internal/domain/meals"
	"github.com/helpthehive/server/internal/modules/mealgen/provider"
)

// The AI arrangement step.
//
// The deterministic planner picks the best-scoring recipe for each slot in
// turn, which is correct but greedy: it optimises each slot without looking at
// the week. A model is better at the things that only make sense across a whole
// week — variety, putting recipes together that share ingredients, deciding
// where leftovers help.
//
// So the model is asked *only* that question, and only about recipes that have
// already passed every hard filter. Three things make it safe:
//
//  1. It never sees a recipe the user may not eat. The menu it is given is the
//     eligible pool, so there is nothing unsafe for it to choose.
//  2. Every id it returns is checked against that pool. An id that is not on
//     the menu — invented, misremembered, or from an earlier conversation — is
//     discarded.
//  3. Anything it does not fill is filled by the deterministic planner, and a
//     reply that cannot be used at all is discarded whole.
//
// It therefore cannot introduce an allergen, break a diet, or produce a week
// the server would not otherwise have been willing to produce. It can only
// reorder what was already allowed.

// Arranger asks a provider to assign recipes to slots.
type Arranger struct {
	Provider provider.Provider
	Logger   *slog.Logger
}

func NewArranger(p provider.Provider, logger *slog.Logger) *Arranger {
	if p == nil {
		p = provider.Disabled{}
	}
	if logger == nil {
		logger = slog.Default()
	}
	return &Arranger{Provider: p, Logger: logger}
}

// Arrange returns a slot-to-recipe assignment, or nil to use the deterministic
// planner. Returning nil is a normal outcome, not a failure: with no provider
// configured it is what always happens, and the meal system runs entirely
// deterministically.
func (a *Arranger) Arrange(ctx context.Context, request meals.PlanRequest, pool []meals.Recipe, slots []meals.Slot, pantry map[string]bool, catalog *meals.Catalog) map[meals.Slot]string {
	if len(pool) == 0 || len(slots) == 0 {
		return nil
	}

	facts := arrangeFacts(request, pool, slots, pantry, catalog)
	prompt, err := facts.UserPrompt()
	if err != nil {
		return nil
	}

	response, err := a.Provider.Complete(ctx, provider.Request{
		System: provider.ArrangeSystemPrompt,
		User:   prompt,
	})
	if err != nil {
		// Includes the no-provider case, which is the default everywhere today.
		return nil
	}

	assignments, err := provider.ParseArrangement(response.Text)
	if err != nil {
		a.Logger.WarnContext(ctx, "meal arrangement rejected",
			slog.String("provider", response.Provider), slog.String("reason", err.Error()))
		return nil
	}

	// Every proposal is checked against what was actually asked for and what is
	// actually allowed. Nothing is taken on trust.
	allowedSlots := make(map[meals.Slot]bool, len(slots))
	for _, slot := range slots {
		allowedSlots[slot] = true
	}
	allowedRecipes := make(map[string]meals.Recipe, len(pool))
	for _, recipe := range pool {
		allowedRecipes[recipe.ID] = recipe
	}

	accepted := make(map[meals.Slot]string, len(assignments))
	var rejected int
	for _, assignment := range assignments {
		slot := meals.Slot{Day: assignment.Day, MealType: assignment.MealType}
		if !allowedSlots[slot] {
			rejected++
			continue
		}
		if _, filled := accepted[slot]; filled {
			rejected++
			continue
		}
		recipe, ok := allowedRecipes[assignment.RecipeID]
		if !ok {
			// Not on the menu: invented, or from something the model saw
			// elsewhere. Either way it has not passed this user's filters.
			rejected++
			continue
		}
		// A recipe is only valid in a slot its own meal types allow, whatever
		// the model thought.
		if !contains(recipe.MealTypes, slot.MealType) {
			rejected++
			continue
		}
		accepted[slot] = recipe.ID
	}

	if rejected > 0 {
		a.Logger.InfoContext(ctx, "discarded meal arrangements the pool did not allow",
			slog.String("provider", response.Provider),
			slog.Int("rejected", rejected),
			slog.Int("accepted", len(accepted)),
		)
	}
	if len(accepted) == 0 {
		return nil
	}
	return accepted
}

// arrangeFacts builds the menu. It carries no user identity, no allergy, no
// diet and none of the user's own words — the filtering that used those has
// already happened, and what is left is a list of dishes and a shape of week.
func arrangeFacts(request meals.PlanRequest, pool []meals.Recipe, slots []meals.Slot, pantry map[string]bool, catalog *meals.Catalog) provider.ArrangeFacts {
	facts := provider.ArrangeFacts{
		Leftovers:    request.Leftovers,
		CookingStyle: request.CookingStyle,
		Slots:        make([]provider.ArrangeSlot, 0, len(slots)),
		Menu:         make([]provider.ArrangeCandidate, 0, len(pool)),
	}
	for _, slot := range slots {
		facts.Slots = append(facts.Slots, provider.ArrangeSlot{Day: slot.Day, MealType: slot.MealType})
	}
	for _, recipe := range pool {
		candidate := provider.ArrangeCandidate{
			RecipeID:         recipe.ID,
			Title:            recipe.Title,
			MealTypes:        recipe.MealTypes,
			TotalTimeMinutes: recipe.TotalTimeMinutes,
			IngredientIDs:    make([]string, 0, len(recipe.Ingredients)),
		}
		if recipe.Cuisine != nil {
			candidate.Cuisine = *recipe.Cuisine
		}

		var owned, resolved int
		for _, line := range meals.PurchasableLines(recipe) {
			if line.IngredientID == nil {
				continue
			}
			resolved++
			candidate.IngredientIDs = append(candidate.IngredientIDs, *line.IngredientID)
			if catalog.Matches(*line.IngredientID, pantry) {
				owned++
			}
		}
		candidate.PantryFriendly = resolved > 0 && float64(owned)/float64(resolved) >= 0.5
		facts.Menu = append(facts.Menu, candidate)
	}
	return facts
}
