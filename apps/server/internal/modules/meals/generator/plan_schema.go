package generator

import "encoding/json"

// The structured output contract.
//
// The reply is JSON and only JSON. Where a provider supports schema-constrained
// decoding this schema is sent with the request so malformed output is a
// provider-side error rather than something to detect afterwards; where it does
// not, the same shape is enforced by plan_validate.go on the way back. The
// schema is not a substitute for validation — a provider that ignores it, or
// that returns a well-formed object full of ids that do not exist, is caught by
// the validator either way.
//
// The object is deliberately narrow. A provider returns slot assignments and
// nothing else: no prices, no quantities, no ingredient lists, no prose. Every
// number a user eventually sees is computed by the server from catalogue data,
// so there is no field here for a model to put one in.

// PlanSelection is one slot assignment.
type PlanSelection struct {
	Day      int    `json:"day"`
	MealType string `json:"meal_type"`
	RecipeID string `json:"recipe_id"`
}

// PlanDraft is the whole reply.
type PlanDraft struct {
	Selections []PlanSelection `json:"selections"`
}

// PlanSchemaName identifies the schema to providers that name their response
// formats.
const PlanSchemaName = "help_the_hive_meal_plan_v1"

// PlanResponseSchema is the JSON Schema a provider is asked to satisfy.
// additionalProperties is false at every level: a reply carrying a field this
// schema does not define is rejected rather than partially trusted.
func PlanResponseSchema() map[string]any {
	return map[string]any{
		"type":                 "object",
		"additionalProperties": false,
		"required":             []string{"selections"},
		"properties": map[string]any{
			"selections": map[string]any{
				"type":     "array",
				"maxItems": MaxPlanSelections,
				"items": map[string]any{
					"type":                 "object",
					"additionalProperties": false,
					"required":             []string{"day", "meal_type", "recipe_id"},
					"properties": map[string]any{
						"day": map[string]any{
							"type":    "integer",
							"minimum": 1,
							"maximum": MaxPlanDays,
						},
						"meal_type": map[string]any{
							"type": "string",
							"enum": PlannableMealTypes,
						},
						"recipe_id": map[string]any{
							"type":      "string",
							"minLength": 1,
							"maxLength": 128,
						},
					},
				},
			},
		},
	}
}

// MaxPlanSelections caps a reply at the largest plan the product allows: seven
// days times the four plannable categories. A provider cannot return a longer
// list and make the server do work proportional to it.
const MaxPlanSelections = MaxPlanDays * 4

// MaxPlanDays mirrors the plan-length limit the request validator enforces. It
// is repeated here rather than imported so this package stays free of the
// engine — the seam only ever depends on the schema it publishes.
const MaxPlanDays = 7

// PlannableMealTypes are the four categories a slot can hold. `dessert` and
// `side` exist on recipes but are never planned into a slot.
var PlannableMealTypes = []string{"breakfast", "lunch", "dinner", "snack"}

// SchemaJSON renders the schema for logging and for provider payloads.
func SchemaJSON() ([]byte, error) {
	return json.Marshal(PlanResponseSchema())
}
