package provider

import (
	"encoding/json"
	"errors"
	"fmt"
	"strings"
)

// Asking a model to arrange a week.
//
// The model is given a menu of recipes that have *already* passed every hard
// filter — allergies, required diets, equipment, time, dislikes — and asked
// only which of them to put where. It cannot widen that menu, because it never
// sees anything outside it, and the server checks every id it returns against
// the menu before acting on it.
//
// So the model contributes judgement about variety, ingredient reuse,
// leftovers and what goes together, and contributes nothing about safety.

// ArrangeSystemPrompt is deliberately narrow. It asks for an assignment and
// nothing else: no new recipes, no quantities, no prose, no claims.
const ArrangeSystemPrompt = `You arrange a week of meals for the Help The Hive app.

You are given a numbered menu of recipes and a list of slots to fill. Choose
which recipe goes in each slot.

Rules:
- Use only recipe ids from the menu. Never invent an id, a recipe or a slot.
- Fill every slot you are given, once each, unless the menu is too small.
- Favour variety across the week, and favour recipes that share ingredients
  with other recipes you chose, so less is bought and less is wasted.
- Respect the leftovers preference you are given: "no" means never repeat a
  recipe, "yes" means repeating one is welcome, "sometimes" means at most twice.
- Prefer recipes marked pantryFriendly: their ingredients are already owned.

Reply with JSON only, in exactly this shape, and nothing else:
{"assignments":[{"day":1,"mealType":"dinner","recipeId":"..."}]}`

// ArrangeCandidate is one recipe as the model sees it. It carries no
// ingredient quantities, no prices and nothing about the user: enough to judge
// variety and overlap, and no more.
type ArrangeCandidate struct {
	RecipeID         string   `json:"recipeId"`
	Title            string   `json:"title"`
	MealTypes        []string `json:"mealTypes"`
	Cuisine          string   `json:"cuisine,omitempty"`
	TotalTimeMinutes *int     `json:"totalTimeMinutes,omitempty"`
	// Catalogue ids, so the model can see which recipes share ingredients.
	IngredientIDs []string `json:"ingredientIds"`
	// True when the user already has most of this recipe's ingredients.
	PantryFriendly bool `json:"pantryFriendly"`
}

// ArrangeSlot is one day and meal type to fill.
type ArrangeSlot struct {
	Day      int    `json:"day"`
	MealType string `json:"mealType"`
}

// ArrangeFacts is everything sent to the provider.
//
// It is aggregate and anonymous by construction: no user id, no email, no
// household composition, no allergy, no diet, no health information, and none
// of the free text the user typed. The filtering that used those has already
// happened — what is left is a menu and a shape of week.
type ArrangeFacts struct {
	Slots     []ArrangeSlot      `json:"slots"`
	Menu      []ArrangeCandidate `json:"menu"`
	Leftovers string             `json:"leftovers"`
	// Style hints such as "one_pot" or "quick_easy". Vocabulary values only,
	// never the user's own words.
	CookingStyle []string `json:"cookingStyle,omitempty"`
}

// UserPrompt renders the facts as the JSON the system prompt describes.
func (f ArrangeFacts) UserPrompt() (string, error) {
	encoded, err := json.Marshal(f)
	if err != nil {
		return "", err
	}
	return string(encoded), nil
}

// Assignment is one slot filled.
type Assignment struct {
	Day      int    `json:"day"`
	MealType string `json:"mealType"`
	RecipeID string `json:"recipeId"`
}

type arrangeReply struct {
	Assignments []Assignment `json:"assignments"`
}

// ErrArrangementUnusable means the reply could not be trusted and the
// deterministic planner should be used instead.
var ErrArrangementUnusable = errors.New("arrangement could not be used")

// MaxArrangeAssignments bounds a reply. A model that returns thousands of
// assignments is malfunctioning, and parsing them all is work done for nothing.
const MaxArrangeAssignments = 200

// ParseArrangement reads a reply and checks its shape only.
//
// Shape is all that is checked here: whether the ids are real, whether the
// slots were asked for, and whether the recipes are ones the user may eat are
// all decided by the server against the menu it built. This function's job is
// to make sure there is something well-formed to check.
func ParseArrangement(raw string) ([]Assignment, error) {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return nil, ErrArrangementUnusable
	}
	// Models often wrap JSON in a fenced block despite being told not to.
	trimmed = strings.TrimPrefix(trimmed, "```json")
	trimmed = strings.TrimPrefix(trimmed, "```")
	trimmed = strings.TrimSuffix(trimmed, "```")

	var reply arrangeReply
	if err := json.Unmarshal([]byte(strings.TrimSpace(trimmed)), &reply); err != nil {
		return nil, fmt.Errorf("%w: %s", ErrArrangementUnusable, err)
	}
	if len(reply.Assignments) == 0 {
		return nil, ErrArrangementUnusable
	}
	if len(reply.Assignments) > MaxArrangeAssignments {
		return nil, ErrArrangementUnusable
	}
	for _, assignment := range reply.Assignments {
		if assignment.RecipeID == "" || assignment.MealType == "" || assignment.Day < 1 {
			return nil, ErrArrangementUnusable
		}
	}
	return reply.Assignments, nil
}
