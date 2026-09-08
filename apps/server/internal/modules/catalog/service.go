// Package catalog reads the canonical ingredient catalogue — the reviewed
// allergen and diet flags, the parent/child relationships and the price rows —
// out of the database and hands back the indexed view the rest of the meal
// system works against.
//
// It is its own module because the catalogue is shared reference data: the
// generator asks it what is safe, grocery asks what things cost, and the
// pantry and allergy pickers read it directly.
package catalog

import (
	"context"

	"github.com/helpthehive/server/internal/domain/meals"
)

// Repository is what this module needs from the database. It is declared here
// rather than imported so the module states its own requirements; *db.Store
// satisfies it.
type Repository interface {
	ListIngredients(ctx context.Context) ([]meals.Ingredient, error)
	SearchIngredients(ctx context.Context, search string, limit int) ([]meals.Ingredient, error)
	ListPricesForIngredients(ctx context.Context, ingredientIDs []string, scope string) ([]meals.IngredientPrice, error)
}

type Service struct {
	repo Repository
}

func NewService(repo Repository) *Service { return &Service{repo: repo} }

// Load builds the indexed catalogue the engine works against. Ingredients and
// their prices are read together so a plan is never priced against a catalogue
// that has moved underneath it mid-request.
func (s *Service) Load(ctx context.Context, scope string) (*meals.Catalog, error) {
	ingredients, err := s.repo.ListIngredients(ctx)
	if err != nil {
		return nil, err
	}
	ids := make([]string, 0, len(ingredients))
	for _, ingredient := range ingredients {
		ids = append(ids, ingredient.ID)
	}
	prices, err := s.repo.ListPricesForIngredients(ctx, ids, scope)
	if err != nil {
		return nil, err
	}
	return meals.NewCatalog(ingredients, prices), nil
}

// Search backs the ingredient picker. The catalogue holds no user data, so it
// is the one meal query that is the same for everybody and needs no viewer.
func (s *Service) Search(ctx context.Context, search string, limit int) ([]meals.Ingredient, error) {
	return s.repo.SearchIngredients(ctx, search, limit)
}
