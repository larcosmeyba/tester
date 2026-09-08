// Package mealplans owns a plan's life: generating one, reading it back,
// moving a meal, swapping a slot and deleting it.
//
// It decides nothing about what a user may eat — that is the generator — and it
// consolidates nothing — that is grocery. What it owns is the plan as a durable
// thing: one active plan per user, a questionnaire snapshot that survives so a
// week can always be rebuilt from what the user actually said, and the rule
// that moving a meal modifies a plan rather than regenerating it.
package mealplans

import (
	"context"
	"errors"
	"log/slog"
	"strings"
	"time"

	"github.com/helpthehive/server/internal/auth"
	"github.com/helpthehive/server/internal/db"
	"github.com/helpthehive/server/internal/domain/meals"
	"github.com/helpthehive/server/internal/modules/grocery"
	"github.com/helpthehive/server/internal/modules/mealgen"
	"github.com/helpthehive/server/internal/modules/users"
)

// ProfileSource supplies the user's standing questionnaire answers, and
// PantrySource what they currently have on hand. Both are optional: a nil one
// means that half of the request is simply not filled in, which is exactly how
// the system behaved before either existed.
type ProfileSource interface {
	ForUser(ctx context.Context, userID string) (*meals.MealProfile, error)
}

type PantrySource interface {
	IngredientIDsForUser(ctx context.Context, userID string) ([]string, error)
}

// Repository is what this module needs from the database. It is declared here
// rather than imported so the module states its own requirements; *db.Store
// satisfies it.
type Repository interface {
	GetActiveMealPlan(ctx context.Context, userID string) (meals.MealPlan, error)
	GetMealPlan(ctx context.Context, userID string, planID string) (meals.MealPlan, error)
	SaveMealPlan(ctx context.Context, plan meals.MealPlan) (meals.MealPlan, error)
	DeleteMealPlan(ctx context.Context, userID string, planID string) (bool, error)
	MoveMealPlanMeal(ctx context.Context, userID string, planID string, fromDay int, fromType string, toDay int, toType string) error
	ReplacePlanMealRecipe(ctx context.Context, userID string, planID string, day int, mealType string, meal meals.MealPlanMeal) error
	UpdateMealPlanCost(ctx context.Context, userID string, planID string, point, low, high *float64, confidence *string, pennyMessage string, assumptions []string) error
	GetGroceryList(ctx context.Context, userID string, planID string) (meals.GroceryList, error)

	// Editing an existing plan.
	InsertPlanMeal(ctx context.Context, userID string, planID string, meal meals.MealPlanMeal) error
	DeletePlanMealsForDay(ctx context.Context, userID string, planID string, day int) ([]string, error)
	UpdatePlanMealServings(ctx context.Context, userID string, planID string, day int, mealType string, servings float64, scale float64) error
	SetMealPlanStatus(ctx context.Context, userID string, planID string, status string) error
}

// Service resolves the viewer from the verified token on every call and scopes
// its queries to that user. No method accepts a user id from the caller.
type Service struct {
	repo      Repository
	users     *users.Service
	generator *mealgen.Service
	grocery   *grocery.Service
	profile   ProfileSource
	pantry    PantrySource
	logger    *slog.Logger
	now       func() time.Time
}

func NewService(
	repo Repository,
	usersService *users.Service,
	generatorService *mealgen.Service,
	groceryService *grocery.Service,
	profileSource ProfileSource,
	pantrySource PantrySource,
	logger *slog.Logger,
) *Service {
	if logger == nil {
		logger = slog.Default()
	}
	return &Service{
		repo:      repo,
		users:     usersService,
		generator: generatorService,
		grocery:   groceryService,
		profile:   profileSource,
		pantry:    pantrySource,
		logger:    logger,
		now:       time.Now,
	}
}

func (s *Service) userID(ctx context.Context, identity auth.Identity) (string, error) {
	viewer, err := s.users.Viewer(ctx, identity)
	if err != nil {
		return "", err
	}
	return viewer.User.ID, nil
}

// Generate builds a week from a questionnaire, saves it as the user's active
// plan, and returns it. Any previous active plan is archived in the same
// transaction.
func (s *Service) Generate(ctx context.Context, identity auth.Identity, request meals.PlanRequest) (meals.Plan, error) {
	userID, err := s.userID(ctx, identity)
	if err != nil {
		return meals.Plan{}, err
	}
	request, err = s.complete(ctx, userID, request)
	if err != nil {
		return meals.Plan{}, err
	}
	if err := mealgen.Validate(&request); err != nil {
		return meals.Plan{}, err
	}

	plan, source, err := s.generator.Build(ctx, userID, request, db.NewID())
	if err != nil {
		return meals.Plan{}, err
	}
	return s.persist(ctx, userID, request, plan, source)
}

// Current returns the plan the user is on, or nil when they have none. Having
// no plan is a normal state, not an error.
func (s *Service) Current(ctx context.Context, identity auth.Identity) (*meals.Plan, error) {
	userID, err := s.userID(ctx, identity)
	if err != nil {
		return nil, err
	}
	stored, err := s.repo.GetActiveMealPlan(ctx, userID)
	if db.IsNotFound(err) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	plan, err := s.rehydrate(ctx, userID, stored)
	if err != nil {
		return nil, err
	}
	return &plan, nil
}

func (s *Service) Get(ctx context.Context, identity auth.Identity, planID string) (meals.Plan, error) {
	userID, err := s.userID(ctx, identity)
	if err != nil {
		return meals.Plan{}, err
	}
	stored, err := s.repo.GetMealPlan(ctx, userID, strings.TrimSpace(planID))
	if db.IsNotFound(err) {
		return meals.Plan{}, meals.ErrNotFound
	}
	if err != nil {
		return meals.Plan{}, err
	}
	return s.rehydrate(ctx, userID, stored)
}

func (s *Service) Delete(ctx context.Context, identity auth.Identity, planID string) (bool, error) {
	userID, err := s.userID(ctx, identity)
	if err != nil {
		return false, err
	}
	return s.repo.DeleteMealPlan(ctx, userID, strings.TrimSpace(planID))
}

// Move relocates one meal to another slot. The basket does not change, so the
// plan is not re-priced and not regenerated.
func (s *Service) Move(ctx context.Context, identity auth.Identity, planID string, from meals.Slot, to meals.Slot) (meals.Plan, error) {
	userID, err := s.userID(ctx, identity)
	if err != nil {
		return meals.Plan{}, err
	}
	if err := meals.ValidateSlot(from); err != nil {
		return meals.Plan{}, err
	}
	if err := meals.ValidateSlot(to); err != nil {
		return meals.Plan{}, err
	}

	stored, err := s.repo.GetMealPlan(ctx, userID, strings.TrimSpace(planID))
	if db.IsNotFound(err) {
		return meals.Plan{}, meals.ErrNotFound
	}
	if err != nil {
		return meals.Plan{}, err
	}
	if to.Day > stored.Days {
		return meals.Plan{}, errors.New("that day is outside this plan")
	}
	for _, meal := range stored.Meals {
		if meal.Day == to.Day && meal.MealType == to.MealType {
			return meals.Plan{}, errors.New("that slot already has a meal")
		}
	}

	if err := s.repo.MoveMealPlanMeal(ctx, userID, stored.ID, from.Day, from.MealType, to.Day, to.MealType); err != nil {
		if errors.Is(err, db.ErrMealNotFound) {
			return meals.Plan{}, meals.ErrNotFound
		}
		return meals.Plan{}, err
	}
	return s.Get(ctx, identity, stored.ID)
}

// Swap replaces the recipe in one slot. `regenerate_week` rebuilds the whole
// plan from the stored questionnaire; every other action asks the generator to
// re-pick a single slot against the same filters, so a swap can never introduce
// a recipe the user's allergies or diet excluded.
func (s *Service) Swap(ctx context.Context, identity auth.Identity, planID string, slot meals.Slot, action string, keepBasket bool) (meals.Plan, error) {
	userID, err := s.userID(ctx, identity)
	if err != nil {
		return meals.Plan{}, err
	}
	if err := meals.ValidateSlot(slot); err != nil {
		return meals.Plan{}, err
	}
	if !mealgen.IsSwapAction(action) {
		return meals.Plan{}, errors.New("swap action is invalid")
	}

	stored, err := s.repo.GetMealPlan(ctx, userID, strings.TrimSpace(planID))
	if db.IsNotFound(err) {
		return meals.Plan{}, meals.ErrNotFound
	}
	if err != nil {
		return meals.Plan{}, err
	}

	request, err := meals.DecodeRequest(stored.Request)
	if err != nil {
		return meals.Plan{}, err
	}

	current, ok := findMeal(stored, slot)
	if !ok {
		return meals.Plan{}, meals.ErrNotFound
	}

	if action == "regenerate_week" {
		return s.Generate(ctx, identity, request)
	}

	// "I don't like this" is remembered, so a regeneration will not bring the
	// same recipe back.
	if action == "dislike" {
		request.ExcludeRecipeIDs = append(request.ExcludeRecipeIDs, current.RecipeID)
	}

	inPlan := map[string]bool{}
	for _, meal := range stored.Meals {
		inPlan[meal.RecipeID] = true
	}
	replacement, err := s.generator.Replacement(ctx, userID, request, slot, action, inPlan, current.RecipeID)
	if err != nil {
		return meals.Plan{}, err
	}

	if err := s.repo.ReplacePlanMealRecipe(ctx, userID, stored.ID, slot.Day, slot.MealType, replacement); err != nil {
		if errors.Is(err, db.ErrMealNotFound) {
			return meals.Plan{}, meals.ErrNotFound
		}
		return meals.Plan{}, err
	}

	// keepBasket is an explicit request not to re-price: the user is comparing
	// options and the shop has not changed yet.
	if !keepBasket {
		if err := s.reprice(ctx, userID, stored.ID); err != nil {
			return meals.Plan{}, err
		}
	}
	return s.Get(ctx, identity, stored.ID)
}

func findMeal(plan meals.MealPlan, slot meals.Slot) (meals.MealPlanMeal, bool) {
	for _, meal := range plan.Meals {
		if meal.Day == slot.Day && meal.MealType == slot.MealType {
			return meal, true
		}
	}
	return meals.MealPlanMeal{}, false
}

// complete fills a request in from what the server already knows about the
// user: their saved questionnaire answers, and what is in their pantry.
//
// Both are additive only. The profile fills fields the client left unsaid and
// overrides nothing — see MealProfile.ApplyTo — and the pantry is unioned into
// whatever pantry items the client sent rather than replacing them. Neither can
// widen what the user may eat: a filled-in allergy narrows the pool, a filled-in
// pantry item only changes what is bought, and the request is validated
// afterwards either way.
func (s *Service) complete(ctx context.Context, userID string, request meals.PlanRequest) (meals.PlanRequest, error) {
	if s.profile != nil {
		profile, err := s.profile.ForUser(ctx, userID)
		if err != nil {
			return request, err
		}
		if profile != nil {
			request = profile.ApplyTo(request)
		}
	}

	if s.pantry != nil {
		owned, err := s.pantry.IngredientIDsForUser(ctx, userID)
		if err != nil {
			// A pantry that cannot be read must not cost the user their plan.
			// The week is planned as though the cupboard were empty, which
			// over-buys rather than under-buys.
			s.logger.WarnContext(ctx, "could not read pantry for meal generation",
				"user_id", userID, "error", err.Error())
		} else if len(owned) > 0 {
			request.PantryItems = meals.Dedupe(append(append([]string{}, request.PantryItems...), owned...))
		}
	}

	return request, nil
}
