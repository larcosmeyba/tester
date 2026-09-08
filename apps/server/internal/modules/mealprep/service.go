package mealprep

import (
	"context"
	"strings"

	"github.com/helpthehive/server/internal/auth"
	"github.com/helpthehive/server/internal/db"
	"github.com/helpthehive/server/internal/domain/meals"
	"github.com/helpthehive/server/internal/modules/catalog"
	"github.com/helpthehive/server/internal/modules/grocery"
	"github.com/helpthehive/server/internal/modules/users"
)

// Repository is what this module needs from the database. It is declared here
// rather than imported so the module states its own requirements; *db.Store
// satisfies it.
type Repository interface {
	GetMealPlan(ctx context.Context, userID string, planID string) (meals.MealPlan, error)
	GetMealPrepPlan(ctx context.Context, userID string, mealPlanID string) (meals.PrepPlan, error)
	SaveMealPrepPlan(ctx context.Context, plan meals.PrepPlan) (meals.PrepPlan, error)
	SetMealPrepTaskDone(ctx context.Context, userID string, taskID string, done bool) (bool, error)
}

// Service resolves the viewer from the verified token on every call and scopes
// every query to that user. No method accepts a user id from the caller.
type Service struct {
	repo    Repository
	users   *users.Service
	catalog *catalog.Service
	grocery *grocery.Service
}

func NewService(repo Repository, usersService *users.Service, catalogService *catalog.Service, groceryService *grocery.Service) *Service {
	return &Service{repo: repo, users: usersService, catalog: catalogService, grocery: groceryService}
}

func (s *Service) userID(ctx context.Context, identity auth.Identity) (string, error) {
	viewer, err := s.users.Viewer(ctx, identity)
	if err != nil {
		return "", err
	}
	return viewer.User.ID, nil
}

// Get returns a plan's prep work, deriving and saving it the first time it is
// asked for.
//
// Deriving on read rather than on plan generation is deliberate: prep is a view
// of a plan, and a plan changes — a swapped meal or a changed serving count
// changes what is worth batching. Recomputing when asked means the list is
// never stale, and the ticks a user has already made are carried across.
func (s *Service) Get(ctx context.Context, identity auth.Identity, planID string) (*meals.PrepPlan, error) {
	userID, err := s.userID(ctx, identity)
	if err != nil {
		return nil, err
	}
	prep, err := s.derive(ctx, userID, strings.TrimSpace(planID))
	if err != nil {
		return nil, err
	}
	return &prep, nil
}

// Regenerate rebuilds a plan's prep work from the plan as it stands now.
func (s *Service) Regenerate(ctx context.Context, identity auth.Identity, planID string) (meals.PrepPlan, error) {
	userID, err := s.userID(ctx, identity)
	if err != nil {
		return meals.PrepPlan{}, err
	}
	return s.derive(ctx, userID, strings.TrimSpace(planID))
}

// SetTaskDone ticks one task off. It returns false when there was nothing to
// tick, which is also what another user's task id looks like.
func (s *Service) SetTaskDone(ctx context.Context, identity auth.Identity, taskID string, done bool) (bool, error) {
	userID, err := s.userID(ctx, identity)
	if err != nil {
		return false, err
	}
	return s.repo.SetMealPrepTaskDone(ctx, userID, strings.TrimSpace(taskID), done)
}

func (s *Service) derive(ctx context.Context, userID string, planID string) (meals.PrepPlan, error) {
	stored, err := s.repo.GetMealPlan(ctx, userID, planID)
	if db.IsNotFound(err) {
		return meals.PrepPlan{}, meals.ErrNotFound
	}
	if err != nil {
		return meals.PrepPlan{}, err
	}

	cat, err := s.catalog.Load(ctx, defaultPriceScope)
	if err != nil {
		return meals.PrepPlan{}, err
	}
	recipes, err := s.grocery.PlanRecipes(ctx, userID, stored)
	if err != nil {
		return meals.PrepPlan{}, err
	}

	planned := make([]meals.PlannedMeal, 0, len(stored.Meals))
	for _, meal := range stored.Meals {
		planned = append(planned, meals.PlannedMeal{
			Slot:            meals.Slot{Day: meal.Day, MealType: meal.MealType},
			RecipeID:        meal.RecipeID,
			ScaleFactor:     meal.ScaleFactor,
			ServingsPlanned: meal.ServingsPlanned,
		})
	}

	derived := Derive(Input{
		MealPlanID: stored.ID,
		UserID:     userID,
		Meals:      planned,
		Recipes:    recipes,
		Catalog:    cat,
	})
	return s.repo.SaveMealPrepPlan(ctx, derived)
}

// Prep is derived against US price data, the same scope everything else uses
// today.
const defaultPriceScope = "us"
