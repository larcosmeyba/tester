package meals

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"strings"
	"time"

	"github.com/helpthehive/server/internal/auth"
	"github.com/helpthehive/server/internal/db"
	"github.com/helpthehive/server/internal/modules/meals/generator"
	"github.com/helpthehive/server/internal/modules/users"
)

// ErrNotFound is returned for anything the caller may not see. It does not
// distinguish "no such plan" from "somebody else's plan": a user must not be
// able to learn that another user's plan exists.
var ErrNotFound = errors.New("not found")

// Service is the meal system's entry point. Every method starts by resolving
// the viewer from the verified token and scopes its queries to that user; no
// method accepts a user id from the caller.
type Service struct {
	store    *db.Store
	users    *users.Service
	narrator *Narrator
	logger   *slog.Logger
	now      func() time.Time
}

func NewService(store *db.Store, usersService *users.Service, provider generator.Provider, logger *slog.Logger) *Service {
	if logger == nil {
		logger = slog.Default()
	}
	return &Service{
		store:    store,
		users:    usersService,
		narrator: NewNarrator(provider, logger),
		logger:   logger,
		now:      time.Now,
	}
}

func (s *Service) userID(ctx context.Context, identity auth.Identity) (string, error) {
	viewer, err := s.users.Viewer(ctx, identity)
	if err != nil {
		return "", err
	}
	return viewer.User.ID, nil
}

// ---------------------------------------------------------------------------
// Recipes and ingredients
// ---------------------------------------------------------------------------

func (s *Service) ListRecipes(ctx context.Context, identity auth.Identity, filter db.RecipeFilter) ([]db.Recipe, error) {
	userID, err := s.userID(ctx, identity)
	if err != nil {
		return nil, err
	}
	return s.store.ListRecipes(ctx, userID, filter)
}

func (s *Service) GetRecipe(ctx context.Context, identity auth.Identity, recipeID string) (db.Recipe, error) {
	userID, err := s.userID(ctx, identity)
	if err != nil {
		return db.Recipe{}, err
	}
	recipe, err := s.store.GetRecipe(ctx, userID, strings.TrimSpace(recipeID))
	if db.IsNotFound(err) {
		return db.Recipe{}, ErrNotFound
	}
	return recipe, err
}

func (s *Service) SaveRecipe(ctx context.Context, identity auth.Identity, recipeID string) (bool, error) {
	userID, err := s.userID(ctx, identity)
	if err != nil {
		return false, err
	}
	return s.store.SaveRecipeForUser(ctx, userID, strings.TrimSpace(recipeID))
}

func (s *Service) UnsaveRecipe(ctx context.Context, identity auth.Identity, recipeID string) (bool, error) {
	userID, err := s.userID(ctx, identity)
	if err != nil {
		return false, err
	}
	return s.store.UnsaveRecipeForUser(ctx, userID, strings.TrimSpace(recipeID))
}

// Ingredients is the shared catalogue. It holds no user data, so it is the one
// meal query that is the same for everybody.
func (s *Service) Ingredients(ctx context.Context, search string, limit int) ([]db.Ingredient, error) {
	return s.store.SearchIngredients(ctx, search, limit)
}

// ---------------------------------------------------------------------------
// Plans
// ---------------------------------------------------------------------------

// Generate builds a week from a questionnaire, saves it as the user's active
// plan, and returns it. Any previous active plan is archived in the same
// transaction.
func (s *Service) Generate(ctx context.Context, identity auth.Identity, request PlanRequest) (Plan, error) {
	userID, err := s.userID(ctx, identity)
	if err != nil {
		return Plan{}, err
	}

	request.Normalize()
	if err := request.Validate(); err != nil {
		return Plan{}, err
	}

	catalog, err := s.catalog(ctx)
	if err != nil {
		return Plan{}, err
	}
	library, err := s.store.ListRecipes(ctx, userID, db.RecipeFilter{PlannableOnly: true, Limit: 200})
	if err != nil {
		return Plan{}, err
	}

	pool := EligibleRecipes(library, request, catalog)
	plan := NewPlanner(catalog).Build(request, pool, db.NewID())

	message, source := s.narrator.Describe(ctx, plan)
	plan.PennyMessage = message

	saved, err := s.persist(ctx, userID, request, plan, source)
	if err != nil {
		return Plan{}, err
	}
	return saved, nil
}

// Current returns the plan the user is on, or nil when they have none. Having
// no plan is a normal state, not an error.
func (s *Service) Current(ctx context.Context, identity auth.Identity) (*Plan, error) {
	userID, err := s.userID(ctx, identity)
	if err != nil {
		return nil, err
	}
	stored, err := s.store.GetActiveMealPlan(ctx, userID)
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

func (s *Service) Get(ctx context.Context, identity auth.Identity, planID string) (Plan, error) {
	userID, err := s.userID(ctx, identity)
	if err != nil {
		return Plan{}, err
	}
	stored, err := s.store.GetMealPlan(ctx, userID, strings.TrimSpace(planID))
	if db.IsNotFound(err) {
		return Plan{}, ErrNotFound
	}
	if err != nil {
		return Plan{}, err
	}
	return s.rehydrate(ctx, userID, stored)
}

func (s *Service) Delete(ctx context.Context, identity auth.Identity, planID string) (bool, error) {
	userID, err := s.userID(ctx, identity)
	if err != nil {
		return false, err
	}
	return s.store.DeleteMealPlan(ctx, userID, strings.TrimSpace(planID))
}

// Move relocates one meal to another slot. The basket does not change, so the
// plan is not re-priced and not regenerated.
func (s *Service) Move(ctx context.Context, identity auth.Identity, planID string, from Slot, to Slot) (Plan, error) {
	userID, err := s.userID(ctx, identity)
	if err != nil {
		return Plan{}, err
	}
	if err := validateSlot(from); err != nil {
		return Plan{}, err
	}
	if err := validateSlot(to); err != nil {
		return Plan{}, err
	}

	stored, err := s.store.GetMealPlan(ctx, userID, strings.TrimSpace(planID))
	if db.IsNotFound(err) {
		return Plan{}, ErrNotFound
	}
	if err != nil {
		return Plan{}, err
	}
	if to.Day > stored.Days {
		return Plan{}, errors.New("that day is outside this plan")
	}
	for _, meal := range stored.Meals {
		if meal.Day == to.Day && meal.MealType == to.MealType {
			return Plan{}, errors.New("that slot already has a meal")
		}
	}

	if err := s.store.MoveMealPlanMeal(ctx, userID, stored.ID, from.Day, from.MealType, to.Day, to.MealType); err != nil {
		if errors.Is(err, db.ErrMealNotFound) {
			return Plan{}, ErrNotFound
		}
		return Plan{}, err
	}
	return s.Get(ctx, identity, stored.ID)
}

// Swap replaces the recipe in one slot. `regenerate_week` rebuilds the whole
// plan from the stored questionnaire; every other action re-picks a single slot
// against the same filters, so a swap can never introduce a recipe the user's
// allergies or diet excluded.
func (s *Service) Swap(ctx context.Context, identity auth.Identity, planID string, slot Slot, action string, keepBasket bool) (Plan, error) {
	userID, err := s.userID(ctx, identity)
	if err != nil {
		return Plan{}, err
	}
	if err := validateSlot(slot); err != nil {
		return Plan{}, err
	}
	if !validSwapActions[action] {
		return Plan{}, errors.New("swap action is invalid")
	}

	stored, err := s.store.GetMealPlan(ctx, userID, strings.TrimSpace(planID))
	if db.IsNotFound(err) {
		return Plan{}, ErrNotFound
	}
	if err != nil {
		return Plan{}, err
	}

	request, err := decodeRequest(stored.Request)
	if err != nil {
		return Plan{}, err
	}

	current, ok := findMeal(stored, slot)
	if !ok {
		return Plan{}, ErrNotFound
	}

	if action == "regenerate_week" {
		return s.Generate(ctx, identity, request)
	}

	// "I don't like this" is remembered, so a regeneration will not bring the
	// same recipe back.
	if action == "dislike" {
		request.ExcludeRecipeIDs = append(request.ExcludeRecipeIDs, current.RecipeID)
	}

	catalog, err := s.catalog(ctx)
	if err != nil {
		return Plan{}, err
	}
	library, err := s.store.ListRecipes(ctx, userID, db.RecipeFilter{PlannableOnly: true, Limit: 200})
	if err != nil {
		return Plan{}, err
	}
	pool := EligibleRecipes(library, request, catalog)

	inPlan := map[string]bool{}
	for _, meal := range stored.Meals {
		inPlan[meal.RecipeID] = true
	}
	replacement, ok := chooseReplacement(pool, slot, action, request, catalog, inPlan, current.RecipeID)
	if !ok {
		return Plan{}, errors.New("no other recipe matches your requirements for that slot")
	}

	pantry := set(request.PantryItems...)
	scale := ScaleFactor(replacement, request.Household.Size)
	if err := s.store.ReplacePlanMealRecipe(ctx, userID, stored.ID, slot.Day, slot.MealType, db.MealPlanMeal{
		RecipeID:            replacement.ID,
		ScaleFactor:         scale,
		ServingsPlanned:     ServingsPlanned(replacement, request.Household.Size, scale),
		PantryIngredientIDs: pantryUsed(replacement, pantry, catalog),
		ConsumedCost:        consumedCost(replacement, scale, pantry, catalog),
	}); err != nil {
		if errors.Is(err, db.ErrMealNotFound) {
			return Plan{}, ErrNotFound
		}
		return Plan{}, err
	}

	// keepBasket is an explicit request not to re-price: the user is comparing
	// options and the shop has not changed yet.
	if !keepBasket {
		if err := s.reprice(ctx, userID, stored.ID); err != nil {
			return Plan{}, err
		}
	}
	return s.Get(ctx, identity, stored.ID)
}

var validSwapActions = set("swap_slot", "cheaper", "higher_protein", "faster", "dislike", "regenerate_week")

// chooseReplacement re-picks one slot. The candidate pool has already passed
// every hard filter, so the action only reorders what is already safe.
func chooseReplacement(pool []db.Recipe, slot Slot, action string, request PlanRequest, catalog *Catalog, inPlan map[string]bool, currentID string) (db.Recipe, bool) {
	pantry := set(request.PantryItems...)
	var best db.Recipe
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
			if cost := consumedCost(recipe, ScaleFactor(recipe, request.Household.Size), pantry, catalog); cost != nil {
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

// ---------------------------------------------------------------------------
// Grocery lists
// ---------------------------------------------------------------------------

// Accept turns the plan into a saved grocery list. It is what "shop on my own"
// and the Instacart handoff both read.
func (s *Service) Accept(ctx context.Context, identity auth.Identity, planID string) (GroceryListResult, error) {
	userID, err := s.userID(ctx, identity)
	if err != nil {
		return GroceryListResult{}, err
	}
	stored, err := s.store.GetMealPlan(ctx, userID, strings.TrimSpace(planID))
	if db.IsNotFound(err) {
		return GroceryListResult{}, ErrNotFound
	}
	if err != nil {
		return GroceryListResult{}, err
	}

	basket, catalog, err := s.basketFor(ctx, userID, stored)
	if err != nil {
		return GroceryListResult{}, err
	}

	// Whatever the user has already ticked stays ticked when a list is rebuilt.
	checked := map[string]bool{}
	if existing, err := s.store.GetGroceryList(ctx, userID, stored.ID); err == nil {
		for _, item := range existing.Items {
			checked[item.IngredientID] = item.IsChecked
		}
	} else if !db.IsNotFound(err) {
		return GroceryListResult{}, err
	}

	list := db.GroceryList{
		MealPlanID:         stored.ID,
		UserID:             userID,
		EstimatedCostPoint: &basket.Cost.Point,
		EstimatedCostLow:   &basket.Cost.Low,
		EstimatedCostHigh:  &basket.Cost.High,
		CostConfidence:     &basket.Cost.Confidence,
	}
	for _, item := range basket.Items {
		list.Items = append(list.Items, db.GroceryListItem{
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
	if _, err := s.store.SaveGroceryList(ctx, list); err != nil {
		return GroceryListResult{}, err
	}
	if err := s.store.SetPlanStartDate(ctx, userID, stored.ID, s.now().UTC()); err != nil {
		return GroceryListResult{}, err
	}

	planIDCopy := stored.ID
	return GroceryListResult{
		PlanID:   &planIDCopy,
		Sections: GroupByAisle(itemsWithChecks(basket.Items, checked), catalog),
		Cost:     basket.Cost,
	}, nil
}

// GroceryList reads a saved list. It returns nil before a plan is accepted
// rather than inventing one.
func (s *Service) GroceryList(ctx context.Context, identity auth.Identity, planID string) (*GroceryListResult, error) {
	userID, err := s.userID(ctx, identity)
	if err != nil {
		return nil, err
	}
	stored, err := s.store.GetGroceryList(ctx, userID, strings.TrimSpace(planID))
	if db.IsNotFound(err) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	catalog, err := s.catalog(ctx)
	if err != nil {
		return nil, err
	}

	items := make([]GroceryItem, 0, len(stored.Items))
	for _, item := range stored.Items {
		items = append(items, GroceryItem{
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
	return &GroceryListResult{
		PlanID:   &planIDCopy,
		Sections: GroupByAisle(items, catalog),
		Cost:     costRangeFrom(stored),
	}, nil
}

func (s *Service) SetGroceryItemChecked(ctx context.Context, identity auth.Identity, planID string, ingredientID string, checked bool) (bool, error) {
	userID, err := s.userID(ctx, identity)
	if err != nil {
		return false, err
	}
	return s.store.SetGroceryItemChecked(ctx, userID, strings.TrimSpace(planID), strings.TrimSpace(ingredientID), checked)
}

// GroceryListFromRecipes prices an ad-hoc selection ("choose my recipes"). It
// saves nothing: the user has not committed to a week.
func (s *Service) GroceryListFromRecipes(ctx context.Context, identity auth.Identity, recipeIDs []string, householdSize int, pantryItems []string) (GroceryListResult, error) {
	userID, err := s.userID(ctx, identity)
	if err != nil {
		return GroceryListResult{}, err
	}
	recipeIDs = dedupe(recipeIDs)
	if len(recipeIDs) == 0 {
		return GroceryListResult{}, errors.New("choose at least one recipe")
	}
	if len(recipeIDs) > MaxIDListLength {
		return GroceryListResult{}, errors.New("too many recipes were selected")
	}
	if householdSize < MinHouseholdSize || householdSize > MaxHouseholdSize {
		return GroceryListResult{}, errors.New("household size is invalid")
	}

	recipes, err := s.store.ListRecipesByIDs(ctx, userID, recipeIDs)
	if err != nil {
		return GroceryListResult{}, err
	}
	if len(recipes) == 0 {
		return GroceryListResult{}, ErrNotFound
	}
	catalog, err := s.catalog(ctx)
	if err != nil {
		return GroceryListResult{}, err
	}

	occurrences := make([]PlannedRecipe, 0, len(recipes))
	for _, recipe := range recipes {
		occurrences = append(occurrences, PlannedRecipe{
			Recipe: recipe,
			Scale:  ScaleFactor(recipe, householdSize),
		})
	}
	pantry := set(dedupe(pantryItems)...)
	basket := BuildBasket(occurrences, pantry, catalog)

	return GroceryListResult{
		Sections: GroupByAisle(basket.Items, catalog),
		Cost:     basket.Cost,
	}, nil
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

func (s *Service) catalog(ctx context.Context) (*Catalog, error) {
	ingredients, err := s.store.ListIngredients(ctx)
	if err != nil {
		return nil, err
	}
	ids := make([]string, 0, len(ingredients))
	for _, ingredient := range ingredients {
		ids = append(ids, ingredient.ID)
	}
	prices, err := s.store.ListPricesForIngredients(ctx, ids, "us")
	if err != nil {
		return nil, err
	}
	return NewCatalog(ingredients, prices), nil
}

func (s *Service) persist(ctx context.Context, userID string, request PlanRequest, plan Plan, source string) (Plan, error) {
	snapshot, err := json.Marshal(request)
	if err != nil {
		return Plan{}, err
	}

	stored := db.MealPlan{
		ID:                 plan.PlanID,
		UserID:             userID,
		StartDate:          s.now().UTC(),
		Days:               request.Days,
		HouseholdSize:      request.Household.Size,
		Request:            snapshot,
		EstimatedCostPoint: &plan.Summary.EstimatedCost.Point,
		EstimatedCostLow:   &plan.Summary.EstimatedCost.Low,
		EstimatedCostHigh:  &plan.Summary.EstimatedCost.High,
		CostConfidence:     &plan.Summary.EstimatedCost.Confidence,
		PennyMessage:       plan.PennyMessage,
		Assumptions:        plan.Assumptions,
		GenerationSource:   source,
		GenerationVersion:  EngineVersion,
	}
	if request.Budget.Enabled() {
		amount := request.Budget.Amount
		stored.BudgetAmount = &amount
	}
	for _, meal := range plan.Meals {
		stored.Meals = append(stored.Meals, db.MealPlanMeal{
			Day:                 meal.Slot.Day,
			MealType:            meal.Slot.MealType,
			RecipeID:            meal.RecipeID,
			ScaleFactor:         meal.ScaleFactor,
			ServingsPlanned:     meal.ServingsPlanned,
			PantryIngredientIDs: meal.PantryIngredientsUsed,
			ConsumedCost:        meal.ConsumedCost,
			Why:                 meal.Why,
		})
	}

	saved, err := s.store.SaveMealPlan(ctx, stored)
	if err != nil {
		return Plan{}, err
	}
	plan.PlanID = saved.ID
	return plan, nil
}

// rehydrate rebuilds the API shape of a stored plan. The grocery list is
// recomputed from the stored meals unless the user has already accepted the
// plan, in which case the saved list is returned so their ticks survive.
func (s *Service) rehydrate(ctx context.Context, userID string, stored db.MealPlan) (Plan, error) {
	request, err := decodeRequest(stored.Request)
	if err != nil {
		return Plan{}, err
	}
	basket, catalog, err := s.basketFor(ctx, userID, stored)
	if err != nil {
		return Plan{}, err
	}

	recipes, err := s.planRecipes(ctx, userID, stored)
	if err != nil {
		return Plan{}, err
	}

	meals := make([]PlannedMeal, 0, len(stored.Meals))
	pantryUsedIDs := map[string]bool{}
	var consumedTotal float64
	var consumedKnown bool

	for _, meal := range stored.Meals {
		recipe, ok := recipes[meal.RecipeID]
		title := meal.RecipeID
		var totalTime *int
		var protein *float64
		if ok {
			title = recipe.Title
			totalTime = recipe.TotalTimeMinutes
			protein = recipe.ProteinG
		}
		meals = append(meals, PlannedMeal{
			Slot:                  Slot{Day: meal.Day, MealType: meal.MealType},
			RecipeID:              meal.RecipeID,
			Title:                 title,
			TotalTimeMinutes:      totalTime,
			ScaleFactor:           meal.ScaleFactor,
			ServingsPlanned:       meal.ServingsPlanned,
			ProteinGPerServing:    protein,
			GoalIndicator:         primaryGoal(request),
			PantryIngredientsUsed: meal.PantryIngredientIDs,
			ConsumedCost:          meal.ConsumedCost,
			Why:                   meal.Why,
		})
		for _, id := range meal.PantryIngredientIDs {
			pantryUsedIDs[id] = true
		}
		if meal.ConsumedCost != nil {
			consumedTotal += *meal.ConsumedCost
			consumedKnown = true
		}
	}

	summary := PlanSummary{
		HouseholdSize:        stored.HouseholdSize,
		MealsPlanned:         len(meals),
		Budget:               stored.BudgetAmount,
		EstimatedCost:        basket.Cost,
		PantryItemsUsed:      sortedKeys(pantryUsedIDs),
		BalancedMealBaseline: &BalancedMealBaseline{Applied: true},
		NutritionGoal:        nutritionSummary(request, meals),
	}
	if stored.BudgetAmount != nil {
		headroom := roundCents(*stored.BudgetAmount - basket.Cost.High)
		summary.Headroom = &headroom
	}
	if consumedKnown {
		rounded := roundCents(consumedTotal)
		summary.ConsumedCostTotal = &rounded
	}

	plan := Plan{
		PlanID:       stored.ID,
		Status:       "ok",
		Summary:      summary,
		Meals:        meals,
		GroceryList:  GroupByAisle(basket.Items, catalog),
		PennyMessage: stored.PennyMessage,
		SwapOptions:  []string{"swap_slot", "cheaper", "higher_protein", "faster", "dislike", "regenerate_week"},
		Assumptions:  stored.Assumptions,
	}

	// Once accepted, the saved list is authoritative so the user's ticks show.
	if saved, err := s.store.GetGroceryList(ctx, userID, stored.ID); err == nil {
		checked := map[string]bool{}
		for _, item := range saved.Items {
			checked[item.IngredientID] = item.IsChecked
		}
		plan.GroceryList = GroupByAisle(itemsWithChecks(basket.Items, checked), catalog)
	} else if !db.IsNotFound(err) {
		return Plan{}, err
	}

	return plan, nil
}

func (s *Service) planRecipes(ctx context.Context, userID string, stored db.MealPlan) (map[string]db.Recipe, error) {
	ids := make([]string, 0, len(stored.Meals))
	for _, meal := range stored.Meals {
		ids = append(ids, meal.RecipeID)
	}
	recipes, err := s.store.ListRecipesByIDs(ctx, userID, dedupe(ids))
	if err != nil {
		return nil, err
	}
	byID := make(map[string]db.Recipe, len(recipes))
	for _, recipe := range recipes {
		byID[recipe.ID] = recipe
	}
	return byID, nil
}

func (s *Service) basketFor(ctx context.Context, userID string, stored db.MealPlan) (Basket, *Catalog, error) {
	request, err := decodeRequest(stored.Request)
	if err != nil {
		return Basket{}, nil, err
	}
	catalog, err := s.catalog(ctx)
	if err != nil {
		return Basket{}, nil, err
	}
	recipes, err := s.planRecipes(ctx, userID, stored)
	if err != nil {
		return Basket{}, nil, err
	}

	occurrences := make([]PlannedRecipe, 0, len(stored.Meals))
	for _, meal := range stored.Meals {
		recipe, ok := recipes[meal.RecipeID]
		if !ok {
			continue
		}
		occurrences = append(occurrences, PlannedRecipe{Recipe: recipe, Scale: meal.ScaleFactor})
	}
	return BuildBasket(occurrences, set(request.PantryItems...), catalog), catalog, nil
}

// reprice recalculates the plan-level cost after a swap and rewrites Penny's
// message, so the message and the numbers can never drift apart.
func (s *Service) reprice(ctx context.Context, userID string, planID string) error {
	stored, err := s.store.GetMealPlan(ctx, userID, planID)
	if err != nil {
		return err
	}
	plan, err := s.rehydrate(ctx, userID, stored)
	if err != nil {
		return err
	}
	cost := plan.Summary.EstimatedCost
	return s.store.UpdateMealPlanCost(ctx, userID, planID, &cost.Point, &cost.Low, &cost.High,
		&cost.Confidence, DeterministicMessage(plan), plan.Assumptions)
}

func itemsWithChecks(items []GroceryItem, checked map[string]bool) []GroceryItem {
	out := make([]GroceryItem, 0, len(items))
	for _, item := range items {
		item.IsChecked = checked[item.IngredientID]
		out = append(out, item)
	}
	return out
}

func costRangeFrom(list db.GroceryList) CostRange {
	cost := CostRange{Confidence: ConfidenceLow}
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

func decodeRequest(raw []byte) (PlanRequest, error) {
	var request PlanRequest
	if len(raw) == 0 {
		return request, errors.New("this plan has no saved questionnaire")
	}
	if err := json.Unmarshal(raw, &request); err != nil {
		return PlanRequest{}, errors.New("this plan's saved questionnaire could not be read")
	}
	request.Normalize()
	return request, nil
}

func findMeal(plan db.MealPlan, slot Slot) (db.MealPlanMeal, bool) {
	for _, meal := range plan.Meals {
		if meal.Day == slot.Day && meal.MealType == slot.MealType {
			return meal, true
		}
	}
	return db.MealPlanMeal{}, false
}

func validateSlot(slot Slot) error {
	if slot.Day < 1 || slot.Day > MaxPlanDays {
		return errors.New("day is outside the plan")
	}
	if !contains(PlannableMealTypes, slot.MealType) {
		return errors.New("meal type cannot be planned")
	}
	return nil
}

// EngineVersion is recorded on every plan so a plan can always be traced to the
// engine that produced it.
const EngineVersion = "v1"
