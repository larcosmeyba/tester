package meals

import (
	"context"
	"fmt"
	"sort"

	"github.com/helpthehive/server/internal/auth"
	"github.com/helpthehive/server/internal/db"
)

// Saved meal preferences: the questionnaire, kept between plans.
//
// The chain the product describes is Questionnaire → Saved Meal Preferences →
// Existing Pantry → Budget → Hard Filters → AI Meal Plan → Validation →
// Grocery List. This file is the second link and the third: it turns an answer
// set into something durable, reads it back as the starting point for the next
// plan, and folds in what the user's pantry already holds.

// Preferences returns the viewer's saved questionnaire, or nil when they have
// never answered it. Having no saved preferences is a normal state, not an
// error: it is what a new user looks like.
func (s *Service) Preferences(ctx context.Context, identity auth.Identity) (*PlanRequest, error) {
	userID, err := s.userID(ctx, identity)
	if err != nil {
		return nil, err
	}
	saved, err := s.store.GetMealPreferences(ctx, userID)
	if db.IsNotFound(err) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	request := requestFromSaved(saved)
	return &request, nil
}

// SavePreferences validates and stores an answer set. It runs the same
// Normalize and Validate the generator runs, so preferences that could not
// produce a plan are rejected at the point they are saved rather than at the
// point somebody tries to cook from them.
func (s *Service) SavePreferences(ctx context.Context, identity auth.Identity, request PlanRequest) (PlanRequest, error) {
	userID, err := s.userID(ctx, identity)
	if err != nil {
		return PlanRequest{}, err
	}
	request.Normalize()
	if err := request.Validate(); err != nil {
		return PlanRequest{}, err
	}
	saved, err := s.store.SaveMealPreferences(ctx, savedFromRequest(userID, request))
	if err != nil {
		return PlanRequest{}, err
	}
	return requestFromSaved(saved), nil
}

// DeletePreferences forgets the questionnaire. Plans the user has already
// generated keep their own snapshot and are unaffected.
func (s *Service) DeletePreferences(ctx context.Context, identity auth.Identity) (bool, error) {
	userID, err := s.userID(ctx, identity)
	if err != nil {
		return false, err
	}
	return s.store.DeleteMealPreferences(ctx, userID)
}

// resolveRequest produces the request the engine will actually plan from.
//
// A caller may send a full answer set, or nothing at all. When they send one it
// is saved, because answering the questionnaire is what saving it means. When
// they send nothing the saved one is used, and a user who has never answered it
// is told so rather than being given a plan built from defaults nobody chose.
func (s *Service) resolveRequest(ctx context.Context, userID string, submitted *PlanRequest) (PlanRequest, error) {
	if submitted != nil {
		request := *submitted
		request.Normalize()
		if err := request.Validate(); err != nil {
			return PlanRequest{}, err
		}
		if _, err := s.store.SaveMealPreferences(ctx, savedFromRequest(userID, request)); err != nil {
			return PlanRequest{}, err
		}
		// The answer set the user actually sent is what this plan is built
		// from, not what came back from storage. The two agree on everything
		// the questionnaire durably holds; where they differ — a pantry list
		// the client sent for this plan only — the user's own request wins.
		return request, nil
	}

	saved, err := s.store.GetMealPreferences(ctx, userID)
	if db.IsNotFound(err) {
		return PlanRequest{}, ErrNoPreferences
	}
	if err != nil {
		return PlanRequest{}, err
	}
	request := requestFromSaved(saved)
	request.Normalize()
	if err := request.Validate(); err != nil {
		return PlanRequest{}, err
	}
	return request, nil
}

// withPantry folds the user's saved pantry into the request.
//
// This is the step that makes "use what I already have" true rather than
// aspirational. The client may send pantry ids of its own — the questionnaire
// has a pantry step — and they are kept; what the pantry holds is added to
// them, never substituted for them. The union is what the planner credits, so
// an ingredient already at home is scored for, not bought again, and appears on
// the grocery list marked as in the pantry rather than vanishing from it.
//
// Items the catalogue could not resolve are surfaced as an assumption. They are
// not guessed at: see db.ResolvePantryIngredients.
func (s *Service) withPantry(ctx context.Context, userID string, request PlanRequest) (PlanRequest, []string, error) {
	resolution, err := s.store.ResolvePantryIngredients(ctx, userID, s.now().UTC())
	if err != nil {
		return request, nil, err
	}

	combined := append(append([]string{}, request.PantryItems...), resolution.IngredientIDs...)
	request.PantryItems = dedupe(combined)
	sort.Strings(request.PantryItems)

	var notes []string
	if count := len(resolution.IngredientIDs); count > 0 {
		notes = append(notes, fmt.Sprintf(
			"%s from your pantry %s used before anything was added to the grocery list.",
			pluralIngredients(count), wasWere(count)))
	}
	if resolution.UnresolvedCount > 0 {
		notes = append(notes, fmt.Sprintf(
			"%s in your pantry could not be matched to the ingredient catalogue (%s), so %s still on the grocery list.",
			pluralItems(resolution.UnresolvedCount),
			joinDisplay(resolution.UnresolvedNames),
			isAre(resolution.UnresolvedCount)))
	}
	return request, notes, nil
}

// ---------------------------------------------------------------------------
// Conversion
// ---------------------------------------------------------------------------

func requestFromSaved(p db.SavedPreferences) PlanRequest {
	request := PlanRequest{
		QuestionnaireVersion: p.QuestionnaireVersion,
		PlanScope:            p.PlanScope,
		Household: Household{
			Size:       p.HouseholdSize,
			Adults:     p.HouseholdAdults,
			Children:   p.HouseholdChildren,
			SizeIsPlus: p.HouseholdSizeIsPlus,
		},
		Meals: MealCounts{
			Breakfast: p.MealsBreakfast,
			Lunch:     p.MealsLunch,
			Dinner:    p.MealsDinner,
			Snack:     p.MealsSnack,
		},
		Days: p.Days,
		Budget: Budget{
			Amount:   p.BudgetAmount,
			Currency: p.BudgetCurrency,
			Mode:     p.BudgetMode,
		},
		DietaryOtherText:   p.DietaryOtherText,
		AllergyIngredients: p.AllergyIngredientIDs,
		Likes: FoodPreferences{
			Ingredients: p.LikesIngredientIDs,
			Cuisines:    p.LikesCuisines,
			FreeText:    p.LikesFreeText,
		},
		Dislikes: FoodPreferences{
			Ingredients: p.DislikesIngredientIDs,
			Cuisines:    p.DislikesCuisines,
			FreeText:    p.DislikesFreeText,
		},
		CookingTime: CookingTime{
			MaxMinutes: p.CookingTimeMaxMinutes,
			Strength:   p.CookingTimeStrength,
		},
		Equipment:        p.Equipment,
		CookingStyle:     p.CookingStyle,
		Leftovers:        p.Leftovers,
		ExcludeRecipeIDs: p.ExcludeRecipeIDs,
	}

	for _, pair := range p.DietaryRequirements {
		request.DietaryRequirements = append(request.DietaryRequirements,
			DietRequirement{Diet: pair.Value, Strength: pair.Strength})
	}
	// An allergy read back from storage is forced to `required` rather than
	// trusted. A row edited by hand, or written by an older version of this
	// code, must not be able to weaken a safety filter.
	for _, pair := range p.Allergies {
		request.Allergies = append(request.Allergies,
			AllergyRequirement{Allergen: pair.Value, Strength: StrengthRequired})
	}
	for _, pair := range p.NutritionPreferences {
		request.NutritionPreferences = append(request.NutritionPreferences,
			NutritionPreference{Goal: pair.Value, Strength: pair.Strength})
	}
	return request
}

func savedFromRequest(userID string, r PlanRequest) db.SavedPreferences {
	saved := db.SavedPreferences{
		UserID:               userID,
		QuestionnaireVersion: r.QuestionnaireVersion,
		PlanScope:            r.PlanScope,

		HouseholdSize:       r.Household.Size,
		HouseholdAdults:     r.Household.Adults,
		HouseholdChildren:   r.Household.Children,
		HouseholdSizeIsPlus: r.Household.SizeIsPlus,

		Days:           r.Days,
		MealsBreakfast: r.Meals.Breakfast,
		MealsLunch:     r.Meals.Lunch,
		MealsDinner:    r.Meals.Dinner,
		MealsSnack:     r.Meals.Snack,

		BudgetAmount:   r.Budget.Amount,
		BudgetCurrency: r.Budget.Currency,
		BudgetMode:     r.Budget.Mode,

		DietaryOtherText:     r.DietaryOtherText,
		AllergyIngredientIDs: r.AllergyIngredients,

		LikesIngredientIDs:    r.Likes.Ingredients,
		LikesCuisines:         r.Likes.Cuisines,
		LikesFreeText:         r.Likes.FreeText,
		DislikesIngredientIDs: r.Dislikes.Ingredients,
		DislikesCuisines:      r.Dislikes.Cuisines,
		DislikesFreeText:      r.Dislikes.FreeText,

		CookingTimeMaxMinutes: r.CookingTime.MaxMinutes,
		CookingTimeStrength:   r.CookingTime.Strength,

		Leftovers:        r.Leftovers,
		Equipment:        r.Equipment,
		CookingStyle:     r.CookingStyle,
		ExcludeRecipeIDs: r.ExcludeRecipeIDs,
	}

	for _, requirement := range r.DietaryRequirements {
		saved.DietaryRequirements = append(saved.DietaryRequirements,
			db.StrengthPair{Value: requirement.Diet, Strength: requirement.Strength})
	}
	for _, allergy := range r.Allergies {
		saved.Allergies = append(saved.Allergies,
			db.StrengthPair{Value: allergy.Allergen, Strength: StrengthRequired})
	}
	for _, preference := range r.NutritionPreferences {
		saved.NutritionPreferences = append(saved.NutritionPreferences,
			db.StrengthPair{Value: preference.Goal, Strength: preference.Strength})
	}
	// The pantry is not part of the questionnaire's durable form: it is read
	// from the pantry itself on every generation, so a stale copy can never
	// tell the planner someone owns something they have since used.
	return saved
}

func pluralIngredients(count int) string {
	if count == 1 {
		return "1 ingredient"
	}
	return fmt.Sprintf("%d ingredients", count)
}

func isAre(count int) string {
	if count == 1 {
		return "it is"
	}
	return "they are"
}
