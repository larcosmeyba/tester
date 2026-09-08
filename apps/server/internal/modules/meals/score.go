package meals

import "github.com/helpthehive/server/internal/db"

// Scoring ranks the recipes that already passed every hard filter. It expresses
// preference only: nothing here can put a filtered-out recipe back into a plan.
//
// Weights are deliberately plain integers so a plan's ordering can be reasoned
// about and tested, rather than emerging from tuned constants nobody can read.
const (
	weightPantryMatch     = 30.0
	weightPantryPreferred = 45.0
	weightNutritionGoal   = 15.0
	weightLikedIngredient = 8.0
	weightLikedCuisine    = 10.0
	weightStyleMatch      = 10.0
	weightFamilyFriendly  = 6.0
	weightWithinTime      = 8.0
	weightRepeatPenalty   = 25.0
)

// Score rates one recipe against the request.
func Score(recipe db.Recipe, request PlanRequest, catalog *Catalog, pantry map[string]bool) float64 {
	var total float64

	total += pantryScore(recipe, request, catalog, pantry)

	for _, preference := range request.NutritionPreferences {
		if hasTag(recipe, "nutrition."+preference.Goal) {
			total += weightNutritionGoal
		}
	}

	liked := set(request.Likes.Ingredients...)
	for _, line := range recipe.Ingredients {
		if line.IngredientID != nil && catalog.Matches(*line.IngredientID, liked) {
			total += weightLikedIngredient
		}
	}
	if recipe.Cuisine != nil {
		for _, cuisine := range request.Likes.Cuisines {
			if cuisine == *recipe.Cuisine {
				total += weightLikedCuisine
			}
		}
	}

	for _, style := range request.CookingStyle {
		if matchesStyle(recipe, style) {
			total += weightStyleMatch
		}
	}

	if request.Household.Children != nil && *request.Household.Children > 0 &&
		hasTag(recipe, "household.family_friendly") {
		total += weightFamilyFriendly
	}

	// A preferred time limit is a nudge; a required one was already a filter.
	if request.CookingTime.MaxMinutes != nil && request.CookingTime.Strength == StrengthPreferred &&
		recipe.TotalTimeMinutes != nil && *recipe.TotalTimeMinutes <= *request.CookingTime.MaxMinutes {
		total += weightWithinTime
	}

	return total
}

// pantryScore rewards recipes that use what the household already has. "Use
// what I have" raises the weight rather than adding a separate rule.
func pantryScore(recipe db.Recipe, request PlanRequest, catalog *Catalog, pantry map[string]bool) float64 {
	lines := PurchasableLines(recipe)
	var resolved, owned int
	for _, line := range lines {
		if line.IngredientID == nil {
			continue
		}
		resolved++
		if catalog.Matches(*line.IngredientID, pantry) {
			owned++
		}
	}
	if resolved == 0 {
		return 0
	}
	weight := weightPantryMatch
	if contains(request.CookingStyle, "use_what_i_have") {
		weight = weightPantryPreferred
	}
	return float64(owned) / float64(resolved) * weight
}

func matchesStyle(recipe db.Recipe, style string) bool {
	switch style {
	case "quick_easy":
		return recipe.TotalTimeMinutes != nil && *recipe.TotalTimeMinutes <= 30
	case "few_ingredients":
		return len(recipe.Ingredients) > 0 && len(recipe.Ingredients) <= 6
	case "one_pot":
		return hasTag(recipe, "method.one_pot")
	case "meal_prep":
		return hasTag(recipe, "method.meal_prep")
	case "family_friendly":
		return hasTag(recipe, "household.family_friendly")
	case "kid_friendly":
		return hasTag(recipe, "household.kid_friendly")
	case "freezer_friendly":
		return hasTag(recipe, "method.freezer_friendly")
	case "variety":
		return false
	case "lowest_cost", "use_what_i_have":
		// Both are handled by cost ordering and the pantry weight above.
		return false
	}
	return hasTag(recipe, "style."+style)
}

func hasTag(recipe db.Recipe, tag string) bool {
	return contains(recipe.Tags, tag)
}

func contains(values []string, value string) bool {
	for _, existing := range values {
		if existing == value {
			return true
		}
	}
	return false
}
