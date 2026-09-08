package meals

import (
	"errors"
	"fmt"
	"strings"
)

// Request bounds and vocabulary checks.
//
// These are domain invariants, not generator policy: a PlanRequest that breaks
// them is not a request the system can act on, whichever module receives it.
// They are also not UI constraints — they stop an oversized or hostile request
// from reaching the planner or an AI provider.

const (
	MinPlanDays        = 1
	MaxPlanDays        = 7
	MinHouseholdSize   = 1
	MaxHouseholdSize   = 8
	MaxFreeTextRunes   = 500
	MaxIDListLength    = 200
	MaxExcludedRecipes = 200
)

var (
	validDiets = Set(
		"vegan", "vegetarian", "pescatarian",
		"gluten_free", "dairy_free", "egg_free", "nut_free",
	)
	validAllergens = Set(
		"milk", "egg", "fish", "shellfish", "tree_nut", "peanut", "wheat", "soy", "sesame",
	)
	validNutritionGoals = Set(
		"high_protein", "high_fiber", "more_produce", "lower_sodium", "lower_calorie", "balanced",
	)
	validEquipment = Set(
		"stovetop", "oven", "microwave", "grill", "blender", "air_fryer", "slow_cooker", "instant_pot",
	)
	validCookingStyles = Set(
		"quick_easy", "few_ingredients", "one_pot", "meal_prep", "family_friendly",
		"kid_friendly", "freezer_friendly", "use_what_i_have", "lowest_cost", "variety",
	)
	validLeftovers  = Set("yes", "sometimes", "no")
	validBudgetMode = Set("lowest", "balanced", "variety")
	validStrength   = Set(StrengthRequired, StrengthPreferred)
)

// Normalize trims free text and applies the derived values the client is not
// trusted to compute.
func (r *PlanRequest) Normalize() {
	if r.PlanScope == "" {
		r.PlanScope = "us"
	}
	if r.Budget.Currency == "" {
		r.Budget.Currency = "USD"
	}
	if r.Budget.Mode == "" {
		r.Budget.Mode = "balanced"
	}
	if r.Leftovers == "" {
		r.Leftovers = "sometimes"
	}
	if r.CookingTime.Strength == "" {
		r.CookingTime.Strength = StrengthPreferred
	}
	r.DietaryOtherText = trimOptional(r.DietaryOtherText)
	r.Likes.FreeText = trimOptional(r.Likes.FreeText)
	r.Dislikes.FreeText = trimOptional(r.Dislikes.FreeText)
	r.PantryItems = Dedupe(r.PantryItems)
	r.AllergyIngredients = Dedupe(r.AllergyIngredients)
	r.ExcludeRecipeIDs = Dedupe(r.ExcludeRecipeIDs)
	r.Likes.Ingredients = Dedupe(r.Likes.Ingredients)
	r.Likes.Cuisines = Dedupe(r.Likes.Cuisines)
	r.Dislikes.Ingredients = Dedupe(r.Dislikes.Ingredients)
	r.Dislikes.Cuisines = Dedupe(r.Dislikes.Cuisines)
	r.Equipment = Dedupe(r.Equipment)
	r.CookingStyle = Dedupe(r.CookingStyle)
}

// Validate rejects a request the planner cannot honour. Every message is safe
// to show a user: none of them echo back stored data.
func (r PlanRequest) Validate() error {
	if r.Days < MinPlanDays || r.Days > MaxPlanDays {
		return fmt.Errorf("a plan must cover between %d and %d days", MinPlanDays, MaxPlanDays)
	}
	if r.Household.Size < MinHouseholdSize || r.Household.Size > MaxHouseholdSize {
		return fmt.Errorf("household size must be between %d and %d", MinHouseholdSize, MaxHouseholdSize)
	}
	if r.Household.Adults != nil && *r.Household.Adults < 0 {
		return errors.New("adults cannot be negative")
	}
	if r.Household.Children != nil && *r.Household.Children < 0 {
		return errors.New("children cannot be negative")
	}
	if r.Meals.Total() < 1 {
		return errors.New("choose at least one meal to plan")
	}
	for _, mealType := range PlannableMealTypes {
		if r.Meals.For(mealType) < 0 {
			return errors.New("meal counts cannot be negative")
		}
		if r.Meals.For(mealType) > r.Days {
			return fmt.Errorf("cannot plan more %s meals than days", mealType)
		}
	}
	if r.Budget.Amount < 0 {
		return errors.New("budget cannot be negative")
	}
	if !validBudgetMode[r.Budget.Mode] {
		return errors.New("budget mode is invalid")
	}
	if !validLeftovers[r.Leftovers] {
		return errors.New("leftovers preference is invalid")
	}
	if !validStrength[r.CookingTime.Strength] {
		return errors.New("cooking time strength is invalid")
	}
	if r.CookingTime.MaxMinutes != nil && *r.CookingTime.MaxMinutes <= 0 {
		return errors.New("cooking time limit must be positive")
	}
	for _, requirement := range r.DietaryRequirements {
		if !validDiets[requirement.Diet] {
			return errors.New("dietary requirement is invalid")
		}
		if !validStrength[requirement.Strength] {
			return errors.New("dietary requirement strength is invalid")
		}
	}
	for _, allergy := range r.Allergies {
		if !validAllergens[allergy.Allergen] {
			return errors.New("allergy is invalid")
		}
		// An allergy is never a preference. Anything else is rejected rather
		// than downgraded, so a client bug cannot weaken a safety filter.
		if allergy.Strength != StrengthRequired {
			return errors.New("allergies must be required")
		}
	}
	for _, preference := range r.NutritionPreferences {
		if !validNutritionGoals[preference.Goal] {
			return errors.New("nutrition goal is invalid")
		}
		if !validStrength[preference.Strength] {
			return errors.New("nutrition goal strength is invalid")
		}
	}
	for _, item := range r.Equipment {
		if !validEquipment[item] {
			return errors.New("equipment is invalid")
		}
	}
	for _, style := range r.CookingStyle {
		if !validCookingStyles[style] {
			return errors.New("cooking style is invalid")
		}
	}
	for _, list := range [][]string{
		r.PantryItems, r.AllergyIngredients, r.Likes.Ingredients, r.Dislikes.Ingredients,
	} {
		if len(list) > MaxIDListLength {
			return fmt.Errorf("no more than %d ingredients can be sent at once", MaxIDListLength)
		}
	}
	if len(r.ExcludeRecipeIDs) > MaxExcludedRecipes {
		return fmt.Errorf("no more than %d recipes can be excluded", MaxExcludedRecipes)
	}
	for _, text := range []*string{r.DietaryOtherText, r.Likes.FreeText, r.Dislikes.FreeText} {
		if text != nil && len([]rune(*text)) > MaxFreeTextRunes {
			return fmt.Errorf("free text must be %d characters or fewer", MaxFreeTextRunes)
		}
	}
	return nil
}

// Set builds a membership lookup from a list of values.
func Set(values ...string) map[string]bool {
	result := make(map[string]bool, len(values))
	for _, value := range values {
		result[value] = true
	}
	return result
}

// Dedupe trims, drops empties and removes repeats, preserving first-seen order.
func Dedupe(values []string) []string {
	if len(values) == 0 {
		return nil
	}
	seen := make(map[string]bool, len(values))
	result := make([]string, 0, len(values))
	for _, value := range values {
		value = strings.TrimSpace(value)
		if value == "" || seen[value] {
			continue
		}
		seen[value] = true
		result = append(result, value)
	}
	return result
}

func trimOptional(value *string) *string {
	if value == nil {
		return nil
	}
	trimmed := strings.TrimSpace(*value)
	if trimmed == "" {
		return nil
	}
	return &trimmed
}
