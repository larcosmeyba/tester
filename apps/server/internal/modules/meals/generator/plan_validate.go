package generator

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
)

// A provider's plan reply is untrusted input.
//
// It is parsed strictly, bounded, and checked against the brief it was given
// before any part of it becomes a plan. Nothing here decides whether a recipe is
// safe — that was decided before the provider was asked, by code reading
// reviewed catalogue data. What this file decides is narrower and absolute: that
// the reply refers only to things the server offered, once each, in slots the
// server asked for.
//
// Every failure returns an error and no selections. The caller does not repair a
// bad reply — it falls back to the deterministic planner, so a model that
// misbehaves costs a user nothing.

var (
	ErrPlanNotStructured  = errors.New("ai plan response was not the expected JSON object")
	ErrPlanEmpty          = errors.New("ai plan response contained no selections")
	ErrPlanTooLong        = errors.New("ai plan response contained more selections than the plan has slots")
	ErrPlanUnknownRecipe  = errors.New("ai plan response named a recipe that was not offered")
	ErrPlanUnknownSlot    = errors.New("ai plan response named a slot the plan did not ask for")
	ErrPlanDuplicateSlot  = errors.New("ai plan response filled the same slot twice")
	ErrPlanWrongMealType  = errors.New("ai plan response used a recipe in a meal type it does not belong to")
	ErrPlanRepeatedRecipe = errors.New("ai plan response repeated a recipe when leftovers were declined")
)

// ValidatePlanDraft parses and checks a provider's reply against the brief.
//
// The returned selections are in the brief's own slot order, not the order the
// provider happened to emit them in, so a plan is assembled the same way
// whatever a model returns.
func ValidatePlanDraft(raw string, brief PlanBrief) ([]PlanSelection, error) {
	draft, err := decodePlanDraft(raw)
	if err != nil {
		return nil, err
	}
	if len(draft.Selections) == 0 {
		return nil, ErrPlanEmpty
	}
	if len(draft.Selections) > len(brief.Slots) || len(draft.Selections) > MaxPlanSelections {
		return nil, ErrPlanTooLong
	}

	candidates := brief.CandidateIDs()
	allowedSlots := brief.SlotKeys()

	filled := make(map[string]PlanSelection, len(draft.Selections))
	usedRecipes := map[string]int{}

	for _, selection := range draft.Selections {
		recipeID := strings.TrimSpace(selection.RecipeID)
		mealType := strings.TrimSpace(selection.MealType)
		key := slotKey(selection.Day, mealType)

		if !allowedSlots[key] {
			return nil, ErrPlanUnknownSlot
		}
		if _, taken := filled[key]; taken {
			return nil, ErrPlanDuplicateSlot
		}

		// The single rule that makes an invented recipe impossible: an id the
		// server did not offer is not looked up, not resolved and not guessed
		// at. It ends the reply.
		candidate, known := candidates[recipeID]
		if !known {
			return nil, ErrPlanUnknownRecipe
		}
		if !containsString(candidate.MealTypes, mealType) {
			return nil, ErrPlanWrongMealType
		}

		usedRecipes[recipeID]++
		if brief.Leftovers == "no" && usedRecipes[recipeID] > 1 {
			return nil, ErrPlanRepeatedRecipe
		}

		filled[key] = PlanSelection{Day: selection.Day, MealType: mealType, RecipeID: recipeID}
	}

	ordered := make([]PlanSelection, 0, len(filled))
	for _, slot := range brief.Slots {
		if selection, ok := filled[slotKey(slot.Day, slot.MealType)]; ok {
			ordered = append(ordered, selection)
		}
	}
	return ordered, nil
}

// decodePlanDraft accepts the JSON object the schema asks for, tolerating a
// fenced code block around it because providers commonly add one.
//
// Unknown fields are an error rather than something to ignore. A reply carrying
// a field the schema does not define means the provider answered a different
// question, and the safe reading of that is to discard the whole reply rather
// than to keep the parts that happened to parse.
func decodePlanDraft(raw string) (PlanDraft, error) {
	trimmed := strings.TrimSpace(raw)
	trimmed = strings.TrimPrefix(trimmed, "```json")
	trimmed = strings.TrimPrefix(trimmed, "```")
	trimmed = strings.TrimSuffix(trimmed, "```")
	trimmed = strings.TrimSpace(trimmed)
	if trimmed == "" {
		return PlanDraft{}, ErrPlanNotStructured
	}

	decoder := json.NewDecoder(bytes.NewReader([]byte(trimmed)))
	decoder.DisallowUnknownFields()

	var draft PlanDraft
	if err := decoder.Decode(&draft); err != nil {
		return PlanDraft{}, ErrPlanNotStructured
	}
	// Anything after the object means the reply was not a single JSON object.
	if decoder.More() {
		return PlanDraft{}, ErrPlanNotStructured
	}
	return draft, nil
}

func containsString(values []string, value string) bool {
	for _, existing := range values {
		if existing == value {
			return true
		}
	}
	return false
}

// PlanRejection describes why a reply was discarded, for logs. The reply itself
// is never logged: it may contain whatever the model made up.
func PlanRejection(err error) string {
	if err == nil {
		return ""
	}
	return fmt.Sprintf("plan_rejected:%s", err.Error())
}
