package grocery

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/helpthehive/server/internal/auth"
	"github.com/helpthehive/server/internal/db"
	"github.com/helpthehive/server/internal/domain/meals"
	"github.com/helpthehive/server/internal/modules/catalog"
	"github.com/helpthehive/server/internal/modules/grocery/retailer"
	"github.com/helpthehive/server/internal/modules/users"
)

// Repository is what grocery needs from the database. It is declared here
// rather than imported so the module states its own requirements; *db.Store
// satisfies it.
type Repository interface {
	GetMealPlan(ctx context.Context, userID string, planID string) (meals.MealPlan, error)
	ListRecipesByIDs(ctx context.Context, userID string, recipeIDs []string) ([]meals.Recipe, error)
	GetGroceryList(ctx context.Context, userID string, planID string) (meals.GroceryList, error)
	SaveGroceryList(ctx context.Context, list meals.GroceryList) (meals.GroceryList, error)
	SetGroceryItemChecked(ctx context.Context, userID string, planID string, ingredientID string, checked bool) (bool, error)
	SetPlanStartDate(ctx context.Context, userID string, planID string, start time.Time) error
}

// Service owns the list a user shops from. Every method resolves the viewer
// from the verified token and scopes its queries to that user; no method
// accepts a user id from the caller.
type Service struct {
	repo     Repository
	users    *users.Service
	catalog  *catalog.Service
	retailer retailer.Handoff
	now      func() time.Time
}

// NewService takes a retailer handoff. Passing nil — which every deployment
// does today — means the provider-neutral list is all there is, which is the
// whole point of the seam: nothing about a plan, its costs or its shopping list
// depends on a retailer existing.
func NewService(repo Repository, usersService *users.Service, catalogService *catalog.Service, handoff retailer.Handoff) *Service {
	if handoff == nil {
		handoff = retailer.Unconfigured{}
	}
	return &Service{
		repo:     repo,
		users:    usersService,
		catalog:  catalogService,
		retailer: handoff,
		now:      time.Now,
	}
}

// PrepareRetailerCart offers a finished list to the configured retailer.
//
// The list is built first and is never shaped by what a retailer can sell: this
// takes the same consolidated, pantry-aware, priced list the user already sees
// and asks somewhere to sell it. With no retailer configured it reports that
// plainly rather than failing.
func (s *Service) PrepareRetailerCart(ctx context.Context, identity auth.Identity, planID string) (retailer.Cart, error) {
	list, err := s.List(ctx, identity, planID)
	if err != nil {
		return retailer.Cart{}, err
	}
	if list == nil {
		return retailer.Cart{}, meals.ErrNotFound
	}
	// Only what must be bought is offered: a retailer has no business being
	// asked for what is already in somebody's cupboard.
	return s.retailer.Prepare(ctx, meals.GroceryListResult{
		PlanID:   list.PlanID,
		Sections: PurchaseSections(list.Sections),
		Cost:     list.Cost,
	})
}

func (s *Service) userID(ctx context.Context, identity auth.Identity) (string, error) {
	viewer, err := s.users.Viewer(ctx, identity)
	if err != nil {
		return "", err
	}
	return viewer.User.ID, nil
}

// Accept turns the plan into a saved grocery list. It is what "shop on my own"
// and the retailer handoff both read.
func (s *Service) Accept(ctx context.Context, identity auth.Identity, planID string) (meals.GroceryListResult, error) {
	userID, err := s.userID(ctx, identity)
	if err != nil {
		return meals.GroceryListResult{}, err
	}
	stored, err := s.repo.GetMealPlan(ctx, userID, strings.TrimSpace(planID))
	if db.IsNotFound(err) {
		return meals.GroceryListResult{}, meals.ErrNotFound
	}
	if err != nil {
		return meals.GroceryListResult{}, err
	}

	basket, cat, err := s.BasketFor(ctx, userID, stored)
	if err != nil {
		return meals.GroceryListResult{}, err
	}

	// Whatever the user has already ticked stays ticked when a list is rebuilt.
	checked := map[string]bool{}
	if existing, err := s.repo.GetGroceryList(ctx, userID, stored.ID); err == nil {
		for _, item := range existing.Items {
			checked[item.IngredientID] = item.IsChecked
		}
	} else if !db.IsNotFound(err) {
		return meals.GroceryListResult{}, err
	}

	list := meals.GroceryList{
		MealPlanID:         stored.ID,
		UserID:             userID,
		EstimatedCostPoint: &basket.Cost.Point,
		EstimatedCostLow:   &basket.Cost.Low,
		EstimatedCostHigh:  &basket.Cost.High,
		CostConfidence:     &basket.Cost.Confidence,
	}
	for _, item := range basket.Items {
		list.Items = append(list.Items, meals.GroceryListItem{
			IngredientID:   item.IngredientID,
			DisplayName:    item.DisplayName,
			NeededQty:      item.NeededQty,
			Unit:           item.Unit,
			Packages:       item.Packages,
			PackageLabel:   item.PackageLabel,
			EstimatedPrice: item.EstimatedPrice,
			PriceTier:      item.PriceTier,
			InPantry:       item.InPantry,
			IsChecked:      checked[item.IngredientID],
			UsedBy:         item.UsedBy,
		})
	}
	if _, err := s.repo.SaveGroceryList(ctx, list); err != nil {
		return meals.GroceryListResult{}, err
	}
	if err := s.repo.SetPlanStartDate(ctx, userID, stored.ID, s.now().UTC()); err != nil {
		return meals.GroceryListResult{}, err
	}

	planIDCopy := stored.ID
	return meals.GroceryListResult{
		PlanID:   &planIDCopy,
		Sections: GroupByAisle(ItemsWithChecks(basket.Items, checked), cat),
		Cost:     basket.Cost,
	}, nil
}

// List reads a saved list. It returns nil before a plan is accepted rather than
// inventing one.
func (s *Service) List(ctx context.Context, identity auth.Identity, planID string) (*meals.GroceryListResult, error) {
	userID, err := s.userID(ctx, identity)
	if err != nil {
		return nil, err
	}
	stored, err := s.repo.GetGroceryList(ctx, userID, strings.TrimSpace(planID))
	if db.IsNotFound(err) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	cat, err := s.catalog.Load(ctx, defaultPriceScope)
	if err != nil {
		return nil, err
	}

	items := make([]meals.GroceryItem, 0, len(stored.Items))
	for _, item := range stored.Items {
		items = append(items, meals.GroceryItem{
			IngredientID:   item.IngredientID,
			DisplayName:    item.DisplayName,
			NeededQty:      item.NeededQty,
			Unit:           item.Unit,
			Packages:       item.Packages,
			PackageLabel:   item.PackageLabel,
			EstimatedPrice: item.EstimatedPrice,
			PriceTier:      item.PriceTier,
			InPantry:       item.InPantry,
			IsChecked:      item.IsChecked,
			UsedBy:         item.UsedBy,
		})
	}

	planIDCopy := stored.MealPlanID
	return &meals.GroceryListResult{
		PlanID:   &planIDCopy,
		Sections: GroupByAisle(items, cat),
		Cost:     CostRangeOf(stored),
	}, nil
}

func (s *Service) SetItemChecked(ctx context.Context, identity auth.Identity, planID string, ingredientID string, checked bool) (bool, error) {
	userID, err := s.userID(ctx, identity)
	if err != nil {
		return false, err
	}
	return s.repo.SetGroceryItemChecked(ctx, userID, strings.TrimSpace(planID), strings.TrimSpace(ingredientID), checked)
}

// FromRecipes prices an ad-hoc selection ("choose my recipes"). It saves
// nothing: the user has not committed to a week.
func (s *Service) FromRecipes(ctx context.Context, identity auth.Identity, recipeIDs []string, householdSize int, pantryItems []string) (meals.GroceryListResult, error) {
	userID, err := s.userID(ctx, identity)
	if err != nil {
		return meals.GroceryListResult{}, err
	}
	recipeIDs = meals.Dedupe(recipeIDs)
	if len(recipeIDs) == 0 {
		return meals.GroceryListResult{}, errors.New("choose at least one recipe")
	}
	if len(recipeIDs) > meals.MaxIDListLength {
		return meals.GroceryListResult{}, errors.New("too many recipes were selected")
	}
	if householdSize < meals.MinHouseholdSize || householdSize > meals.MaxHouseholdSize {
		return meals.GroceryListResult{}, errors.New("household size is invalid")
	}

	recipes, err := s.repo.ListRecipesByIDs(ctx, userID, recipeIDs)
	if err != nil {
		return meals.GroceryListResult{}, err
	}
	if len(recipes) == 0 {
		return meals.GroceryListResult{}, meals.ErrNotFound
	}
	cat, err := s.catalog.Load(ctx, defaultPriceScope)
	if err != nil {
		return meals.GroceryListResult{}, err
	}

	occurrences := make([]meals.PlannedRecipe, 0, len(recipes))
	for _, recipe := range recipes {
		occurrences = append(occurrences, meals.PlannedRecipe{
			Recipe: recipe,
			Scale:  meals.ScaleFactor(recipe, householdSize),
		})
	}
	basket := BuildBasket(occurrences, meals.Set(meals.Dedupe(pantryItems)...), cat)

	return meals.GroceryListResult{
		Sections: GroupByAisle(basket.Items, cat),
		Cost:     basket.Cost,
	}, nil
}

// BasketFor rebuilds a stored plan's basket from the recipes it actually
// contains, at the scales they were planned at. The meal plan module uses it to
// price a plan it is reading back, so there is one consolidation in the system
// rather than one per caller.
func (s *Service) BasketFor(ctx context.Context, userID string, stored meals.MealPlan) (meals.Basket, *meals.Catalog, error) {
	request, err := meals.DecodeRequest(stored.Request)
	if err != nil {
		return meals.Basket{}, nil, err
	}
	cat, err := s.catalog.Load(ctx, defaultPriceScope)
	if err != nil {
		return meals.Basket{}, nil, err
	}
	recipes, err := s.PlanRecipes(ctx, userID, stored)
	if err != nil {
		return meals.Basket{}, nil, err
	}

	occurrences := make([]meals.PlannedRecipe, 0, len(stored.Meals))
	for _, meal := range stored.Meals {
		recipe, ok := recipes[meal.RecipeID]
		if !ok {
			continue
		}
		occurrences = append(occurrences, meals.PlannedRecipe{Recipe: recipe, Scale: meal.ScaleFactor})
	}
	return BuildBasketWithHoldings(occurrences, requestHoldings(request), cat), cat, nil
}

// PlanRecipes loads every recipe a stored plan refers to, keyed by id.
func (s *Service) PlanRecipes(ctx context.Context, userID string, stored meals.MealPlan) (map[string]meals.Recipe, error) {
	ids := make([]string, 0, len(stored.Meals))
	for _, meal := range stored.Meals {
		ids = append(ids, meal.RecipeID)
	}
	recipes, err := s.repo.ListRecipesByIDs(ctx, userID, meals.Dedupe(ids))
	if err != nil {
		return nil, err
	}
	byID := make(map[string]meals.Recipe, len(recipes))
	for _, recipe := range recipes {
		byID[recipe.ID] = recipe
	}
	return byID, nil
}

// ItemsWithChecks re-applies the user's ticks to a freshly consolidated list.
func ItemsWithChecks(items []meals.GroceryItem, checked map[string]bool) []meals.GroceryItem {
	out := make([]meals.GroceryItem, 0, len(items))
	for _, item := range items {
		item.IsChecked = checked[item.IngredientID]
		out = append(out, item)
	}
	return out
}

// CostRangeOf reads back the range stored with a saved list. A list with no
// stored confidence is reported as low rather than assumed accurate.
func CostRangeOf(list meals.GroceryList) meals.CostRange {
	cost := meals.CostRange{Confidence: meals.ConfidenceLow}
	if list.EstimatedCostPoint != nil {
		cost.Point = *list.EstimatedCostPoint
	}
	if list.EstimatedCostLow != nil {
		cost.Low = *list.EstimatedCostLow
	}
	if list.EstimatedCostHigh != nil {
		cost.High = *list.EstimatedCostHigh
	}
	if list.CostConfidence != nil {
		cost.Confidence = *list.CostConfidence
	}
	return cost
}

// Everything is priced against US estimates today. `geographic_scope` exists on
// the price rows so this can become a user-derived value without a migration.
const defaultPriceScope = "us"

// requestHoldings prefers the server-filled quantities and falls back to
// presence-only, so a caller that never set them is unaffected.
func requestHoldings(request meals.PlanRequest) map[string]meals.PantryHolding {
	if len(request.PantryHoldings) > 0 {
		return request.PantryHoldings
	}
	return meals.HoldingsFromIDs(meals.Dedupe(request.PantryItems))
}
