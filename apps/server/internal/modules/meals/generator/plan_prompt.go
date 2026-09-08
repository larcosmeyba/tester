package generator

import (
	"encoding/json"
	"fmt"
)

// The meal-plan brief: what a provider is told when it is asked to choose a
// week, and the exact boundary of what it is allowed to influence.
//
// The division of labour is the whole design. Before this prompt is built the
// server has already applied every hard filter — allergies, required diets,
// dislikes, equipment, a required time limit, plan eligibility — so the
// candidate list is a set of recipes that are all safe for this household. The
// provider reorders that list into slots. It cannot add a recipe, because the
// only ids it is given are the safe ones and any other id is rejected; and it
// cannot weaken a filter, because the filters ran before it was asked and run
// again on what it returns.
//
// The brief is aggregate and anonymous by construction, on the same rule as the
// narration fact sheet: no user id, no household composition, no allergy, diet
// or health information, and no free text the user typed. A provider is never
// told *why* a recipe is safe for this person — only that it is one of the
// options. Where a preference would otherwise have to be named, it is sent as a
// server-computed flag instead: `meets_goal` says a recipe matches the user's
// nutrition goal without naming the goal.
//
// Adding a field here is a privacy decision.

// PlanBriefSystemPrompt is owned by the server and versioned with it. It is
// never sent from the app, never editable by a user, and never assembled from
// user text.
const PlanBriefSystemPrompt = `You are the meal planner inside the Help The Hive app.

You are given a list of slots to fill and a list of candidate recipes. Every
candidate has already been checked for safety and suitability by Help The Hive.
Your only job is to decide which candidate goes in which slot.

Rules you must follow exactly:
- Choose ONLY from the recipe_id values in the candidates list. Never invent an
  id, never modify one, and never return an id that is not in the list.
- Fill each slot in the slots list at most once, and return no other slots.
- A candidate may only be used in a slot whose meal_type is in that candidate's
  meal_types.
- If leftovers is "no", never use the same recipe_id twice.
- If leftovers is "yes" or "sometimes", you may repeat a recipe when doing so
  reuses ingredients and reduces the shop, but keep the week varied.
- Prefer candidates with a higher pantry_overlap: those use food the household
  already has.
- Prefer sets of recipes that share ingredients, so fewer separate items need
  buying.
- Keep the total of the chosen candidates' estimated_cost at or under budget
  when a budget is given.
- Prefer candidates where meets_goal is true.
- Leave a slot out if and only if no candidate can fill it.

Reply with JSON only, matching the schema exactly. Do not add commentary, an
explanation, markdown, or any field the schema does not define.`

// BriefSlot is one day and meal type the plan needs filled.
type BriefSlot struct {
	Day      int    `json:"day"`
	MealType string `json:"meal_type"`
}

// BriefRecipe is one candidate, described only by what a selection decision
// needs. There is no ingredient list, no instruction text and no allergen or
// diet information: the recipe is in this list because it already passed those
// checks, and repeating them to a provider would be sending health data for no
// gain.
type BriefRecipe struct {
	RecipeID  string   `json:"recipe_id"`
	Title     string   `json:"title"`
	MealTypes []string `json:"meal_types"`
	// Null where the recipe never stated one; it is not invented.
	TotalTimeMinutes *int `json:"total_time_minutes"`
	// Estimated, at the scale this household would cook it. Never a quoted
	// retail price.
	EstimatedCost *float64 `json:"estimated_cost"`
	// How many of this recipe's ingredients the household already has.
	PantryOverlap int `json:"pantry_overlap"`
	// True when the recipe matches the user's nutrition goal. The goal itself
	// is not sent.
	MeetsGoal bool `json:"meets_goal"`
}

// PlanBrief is the whole of what a provider sees.
type PlanBrief struct {
	Slots      []BriefSlot   `json:"slots"`
	Candidates []BriefRecipe `json:"candidates"`
	// "yes", "sometimes" or "no".
	Leftovers string `json:"leftovers"`
	// The grocery budget for the whole plan, when the user set one.
	Budget *float64 `json:"budget,omitempty"`
}

// UserPrompt renders the brief. Everything in it is a computed value; no part
// of it is text a user typed.
func (b PlanBrief) UserPrompt() (string, error) {
	encoded, err := json.Marshal(b)
	if err != nil {
		return "", err
	}
	return "Plan brief:\n" + string(encoded), nil
}

// MaxCandidates bounds the brief. A pool larger than this is truncated by the
// caller, highest-scoring first: a request is not allowed to grow without limit
// just because a user's filters were permissive.
const MaxCandidates = 120

// CandidateIDs is the set of ids a reply may use. Validation rejects anything
// else, which is what makes an invented or substituted recipe impossible.
func (b PlanBrief) CandidateIDs() map[string]BriefRecipe {
	byID := make(map[string]BriefRecipe, len(b.Candidates))
	for _, candidate := range b.Candidates {
		byID[candidate.RecipeID] = candidate
	}
	return byID
}

// SlotKeys is the set of slots a reply may fill.
func (b PlanBrief) SlotKeys() map[string]bool {
	keys := make(map[string]bool, len(b.Slots))
	for _, slot := range b.Slots {
		keys[slotKey(slot.Day, slot.MealType)] = true
	}
	return keys
}

func slotKey(day int, mealType string) string {
	return fmt.Sprintf("%d/%s", day, mealType)
}
