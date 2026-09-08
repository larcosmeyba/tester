package generator

import (
	"encoding/json"
	"fmt"
	"strings"
)

// SystemPrompt is owned by the server and versioned with it. It is never sent
// from the app, never editable by a user, and never assembled from user text.
const SystemPrompt = `You are Penny, the assistant inside the Help The Hive app.

You are given a fact sheet about a meal plan that has already been created and
priced by Help The Hive. Write one short, warm paragraph — at most three
sentences — telling the user what their week looks like.

Rules you must follow exactly:
- Use ONLY the numbers in the fact sheet. Never calculate, estimate, round or
  invent a number, a price, a date or a quantity.
- Never say a plan is guaranteed, approved, correct, or that the user qualifies
  for anything.
- Never give medical, nutritional, legal, financial or eligibility advice, and
  never diagnose anything.
- Never mention an allergy, a diet or a health condition. The plan already
  accounts for them.
- Do not describe a cost as exact. Costs in the fact sheet are estimates.
- Do not add instructions, links, lists or headings. Plain sentences only.

Reply with JSON only, in this exact shape:
{"message": "<your paragraph>"}`

// PlanFacts is everything a provider is told. It is aggregate and anonymous by
// construction: no user id, no email, no household composition, no allergy,
// diet or health information, and no free text the user typed.
//
// Adding a field here is a privacy decision. Anything that could identify a
// person or describe their health does not belong in it.
type PlanFacts struct {
	MealsPlanned      int      `json:"meals_planned"`
	Days              int      `json:"days"`
	EstimatedCostLow  float64  `json:"estimated_cost_low"`
	EstimatedCostHigh float64  `json:"estimated_cost_high"`
	CostConfidence    string   `json:"cost_confidence"`
	Budget            *float64 `json:"budget,omitempty"`
	Headroom          *float64 `json:"headroom,omitempty"`
	PantryItemsUsed   int      `json:"pantry_items_used"`
	// Recipe titles only — no ingredients, no instructions.
	MealTitles []string `json:"meal_titles"`
}

// UserPrompt renders the fact sheet. Everything in it is a computed value; no
// part of it is text a user typed.
func (f PlanFacts) UserPrompt() (string, error) {
	encoded, err := json.Marshal(f)
	if err != nil {
		return "", err
	}
	return "Fact sheet:\n" + string(encoded), nil
}

// AllowedNumbers is the set of numbers a reply may contain. Validation uses it
// to reject any figure the model produced on its own.
func (f PlanFacts) AllowedNumbers() []string {
	values := []string{
		formatNumber(float64(f.MealsPlanned)),
		formatNumber(float64(f.Days)),
		formatNumber(f.EstimatedCostLow),
		formatNumber(f.EstimatedCostHigh),
		formatNumber(float64(f.PantryItemsUsed)),
	}
	if f.Budget != nil {
		values = append(values, formatNumber(*f.Budget))
	}
	if f.Headroom != nil {
		values = append(values, formatNumber(*f.Headroom))
	}
	return values
}

func formatNumber(value float64) string {
	if value == float64(int64(value)) {
		return fmt.Sprintf("%d", int64(value))
	}
	return strings.TrimRight(strings.TrimRight(fmt.Sprintf("%.2f", value), "0"), ".")
}
