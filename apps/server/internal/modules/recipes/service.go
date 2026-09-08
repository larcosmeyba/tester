// Package recipes owns the recipe library: what a user can browse, read and
// save.
//
// It is deliberately separate from the generator and the plan. Browsing the
// library is a read of shared reference data plus whatever the viewer owns; it
// involves no planning, no pricing and no questionnaire, and nothing here
// should have to change when the engine does.
package recipes

import (
	"context"
	"strings"

	"github.com/helpthehive/server/internal/auth"
	"github.com/helpthehive/server/internal/db"
	"github.com/helpthehive/server/internal/domain/meals"
	"github.com/helpthehive/server/internal/modules/users"
)

// Repository is what this module needs from the database. It is declared here
// rather than imported so the module states its own requirements; *db.Store
// satisfies it.
type Repository interface {
	ListRecipes(ctx context.Context, userID string, filter meals.RecipeFilter) ([]meals.Recipe, error)
	GetRecipe(ctx context.Context, userID string, recipeID string) (meals.Recipe, error)
	SaveRecipeForUser(ctx context.Context, userID string, recipeID string) (bool, error)
	UnsaveRecipeForUser(ctx context.Context, userID string, recipeID string) (bool, error)
}

// Service resolves the viewer from the verified token on every call and scopes
// its queries to that user. No method accepts a user id from the caller.
type Service struct {
	repo  Repository
	users *users.Service
}

func NewService(repo Repository, usersService *users.Service) *Service {
	return &Service{repo: repo, users: usersService}
}

func (s *Service) userID(ctx context.Context, identity auth.Identity) (string, error) {
	viewer, err := s.users.Viewer(ctx, identity)
	if err != nil {
		return "", err
	}
	return viewer.User.ID, nil
}

// List returns the public library plus the viewer's own recipes. Ownership is
// filtered in SQL, never here: doing it in the caller would mean the rows had
// already been read.
func (s *Service) List(ctx context.Context, identity auth.Identity, filter meals.RecipeFilter) ([]meals.Recipe, error) {
	userID, err := s.userID(ctx, identity)
	if err != nil {
		return nil, err
	}
	return s.repo.ListRecipes(ctx, userID, filter)
}

// Get reports a recipe the viewer may not see as not found, never as
// forbidden: saying a recipe exists but is somebody else's is itself a
// disclosure.
func (s *Service) Get(ctx context.Context, identity auth.Identity, recipeID string) (meals.Recipe, error) {
	userID, err := s.userID(ctx, identity)
	if err != nil {
		return meals.Recipe{}, err
	}
	recipe, err := s.repo.GetRecipe(ctx, userID, strings.TrimSpace(recipeID))
	if db.IsNotFound(err) {
		return meals.Recipe{}, meals.ErrNotFound
	}
	return recipe, err
}

func (s *Service) Save(ctx context.Context, identity auth.Identity, recipeID string) (bool, error) {
	userID, err := s.userID(ctx, identity)
	if err != nil {
		return false, err
	}
	return s.repo.SaveRecipeForUser(ctx, userID, strings.TrimSpace(recipeID))
}

func (s *Service) Unsave(ctx context.Context, identity auth.Identity, recipeID string) (bool, error) {
	userID, err := s.userID(ctx, identity)
	if err != nil {
		return false, err
	}
	return s.repo.UnsaveRecipeForUser(ctx, userID, strings.TrimSpace(recipeID))
}
