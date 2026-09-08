package mealplans

import (
	"context"
	"errors"
	"strings"

	"github.com/helpthehive/server/internal/auth"
	"github.com/helpthehive/server/internal/db"
	"github.com/helpthehive/server/internal/domain/meals"
)

// Editing a plan that already exists.
//
// Every action here modifies the plan in place. None of them regenerates the
// week — that is Generate, and it archives what came before — and none of them
// can introduce a recipe the user's allergies or diet excluded, because every
// candidate comes from the generator's eligible pool.

// ReplaceMeal puts a specific recipe in a slot.
//
// It is the "I want *that* one" action, as distinct from Swap's "give me
// something else". The chosen recipe is still checked against the user's own
// eligible pool: choosing explicitly does not mean choosing past a filter, and
// a recipe the user's allergies exclude is rejected here exactly as it would be
// anywhere else.
func (s *Service) ReplaceMeal(ctx context.Context, identity auth.Identity, planID string, slot meals.Slot, recipeID string) (meals.Plan, error) {
	userID, err := s.userID(ctx, identity)
	if err != nil {
		return meals.Plan{}, err
	}
	if err := meals.ValidateSlot(slot); err != nil {
		return meals.Plan{}, err
	}
	recipeID = strings.TrimSpace(recipeID)
	if recipeID == "" {
		return meals.Plan{}, errors.New("choose a recipe")
	}

	stored, request, err := s.load(ctx, userID, planID)
	if err != nil {
		return meals.Plan{}, err
	}
	if slot.Day > stored.Days {
		return meals.Plan{}, errors.New("that day is outside this plan")
	}

	replacement, err := s.generator.Chosen(ctx, userID, request, slot, recipeID)
	if err != nil {
		return meals.Plan{}, err
	}
	replacement.Day = slot.Day
	replacement.MealType = slot.MealType

	if err := s.repo.InsertPlanMeal(ctx, userID, stored.ID, replacement); err != nil {
		if errors.Is(err, db.ErrMealNotFound) {
			return meals.Plan{}, meals.ErrNotFound
		}
		return meals.Plan{}, err
	}
	if err := s.reprice(ctx, userID, stored.ID); err != nil {
		return meals.Plan{}, err
	}
	return s.Get(ctx, identity, stored.ID)
}

// RegenerateDay rebuilds one day from the stored questionnaire.
//
// It is the middle ground between swapping one meal and regenerating the whole
// week: a day that went wrong is redone without losing the six that did not.
// The rest of the week is passed to the generator as already-used, so a
// regenerated Tuesday does not simply repeat Monday.
func (s *Service) RegenerateDay(ctx context.Context, identity auth.Identity, planID string, day int) (meals.Plan, error) {
	userID, err := s.userID(ctx, identity)
	if err != nil {
		return meals.Plan{}, err
	}

	stored, request, err := s.load(ctx, userID, planID)
	if err != nil {
		return meals.Plan{}, err
	}
	if day < 1 || day > stored.Days {
		return meals.Plan{}, errors.New("that day is outside this plan")
	}

	// What the other days hold, so the new day does not repeat them.
	inPlan := map[string]bool{}
	replacing := map[string]string{}
	for _, meal := range stored.Meals {
		if meal.Day == day {
			replacing[meal.MealType] = meal.RecipeID
			continue
		}
		inPlan[meal.RecipeID] = true
	}

	cleared, err := s.repo.DeletePlanMealsForDay(ctx, userID, stored.ID, day)
	if err != nil {
		return meals.Plan{}, err
	}
	if len(cleared) == 0 {
		return meals.Plan{}, errors.New("that day has no meals to regenerate")
	}

	for _, mealType := range cleared {
		slot := meals.Slot{Day: day, MealType: mealType}
		replacement, err := s.generator.Replacement(ctx, userID, request, slot, "swap_slot", inPlan, replacing[mealType])
		if err != nil {
			// A slot with nothing eligible left is left empty, exactly as it is
			// during generation. The plan reports fewer meals rather than
			// inventing one.
			s.logger.InfoContext(ctx, "left a slot empty while regenerating a day",
				"plan_id", stored.ID, "day", day, "meal_type", mealType)
			continue
		}
		replacement.Day = day
		replacement.MealType = mealType
		if err := s.repo.InsertPlanMeal(ctx, userID, stored.ID, replacement); err != nil {
			return meals.Plan{}, err
		}
		inPlan[replacement.RecipeID] = true
	}

	if err := s.reprice(ctx, userID, stored.ID); err != nil {
		return meals.Plan{}, err
	}
	return s.Get(ctx, identity, stored.ID)
}

// UpdateServings changes how much food one slot is cooked for.
//
// The scale factor moves with the servings, because they are two views of one
// decision: letting them disagree would give a plan whose meal card and whose
// grocery list describe different amounts of food. The week is re-priced
// afterwards for the same reason.
func (s *Service) UpdateServings(ctx context.Context, identity auth.Identity, planID string, slot meals.Slot, servings float64) (meals.Plan, error) {
	userID, err := s.userID(ctx, identity)
	if err != nil {
		return meals.Plan{}, err
	}
	if err := meals.ValidateSlot(slot); err != nil {
		return meals.Plan{}, err
	}
	if servings <= 0 {
		return meals.Plan{}, errors.New("servings must be more than zero")
	}
	if servings > maxServingsPerSlot {
		return meals.Plan{}, errors.New("that is more servings than a single meal can be planned for")
	}

	stored, _, err := s.load(ctx, userID, planID)
	if err != nil {
		return meals.Plan{}, err
	}
	meal, ok := findMeal(stored, slot)
	if !ok {
		return meals.Plan{}, meals.ErrNotFound
	}

	recipes, err := s.grocery.PlanRecipes(ctx, userID, stored)
	if err != nil {
		return meals.Plan{}, err
	}
	scale := meal.ScaleFactor
	if recipe, ok := recipes[meal.RecipeID]; ok {
		if recipe.Servings != nil && *recipe.Servings > 0 {
			scale = meals.RoundCents(servings / *recipe.Servings)
		}
		// A recipe that cannot be scaled is cooked as written, whatever is
		// asked for: pretending otherwise would price food nobody can make.
		if !recipe.Scalable {
			return meals.Plan{}, errors.New("that recipe cannot be scaled")
		}
	}

	if err := s.repo.UpdatePlanMealServings(ctx, userID, stored.ID, slot.Day, slot.MealType, servings, scale); err != nil {
		if errors.Is(err, db.ErrMealNotFound) {
			return meals.Plan{}, meals.ErrNotFound
		}
		return meals.Plan{}, err
	}
	if err := s.reprice(ctx, userID, stored.ID); err != nil {
		return meals.Plan{}, err
	}
	return s.Get(ctx, identity, stored.ID)
}

// Save makes a plan the user's active one, archiving whichever plan held that
// place. It is how a user returns to a week they had set aside.
func (s *Service) Save(ctx context.Context, identity auth.Identity, planID string) (meals.Plan, error) {
	userID, err := s.userID(ctx, identity)
	if err != nil {
		return meals.Plan{}, err
	}
	if err := s.repo.SetMealPlanStatus(ctx, userID, strings.TrimSpace(planID), "active"); err != nil {
		if errors.Is(err, db.ErrMealNotFound) {
			return meals.Plan{}, meals.ErrNotFound
		}
		return meals.Plan{}, err
	}
	return s.Get(ctx, identity, planID)
}

// load reads a plan and its stored questionnaire together. Every action needs
// both, and a plan whose questionnaire cannot be read cannot be edited: there
// would be no way to know what the user may eat.
func (s *Service) load(ctx context.Context, userID string, planID string) (meals.MealPlan, meals.PlanRequest, error) {
	stored, err := s.repo.GetMealPlan(ctx, userID, strings.TrimSpace(planID))
	if db.IsNotFound(err) {
		return meals.MealPlan{}, meals.PlanRequest{}, meals.ErrNotFound
	}
	if err != nil {
		return meals.MealPlan{}, meals.PlanRequest{}, err
	}
	request, err := meals.DecodeRequest(stored.Request)
	if err != nil {
		return meals.MealPlan{}, meals.PlanRequest{}, err
	}
	return stored, request, nil
}

// maxServingsPerSlot is a sanity bound, not a product rule: it stops a typo
// from pricing a basket for a banquet.
const maxServingsPerSlot = 64
