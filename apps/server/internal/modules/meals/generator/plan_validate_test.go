package generator

import (
	"errors"
	"strings"
	"testing"
)

// The validator is the boundary between a model's output and a user's week.
// Every test here is a thing a provider could return that must not reach a
// plan.

func testBrief() PlanBrief {
	return PlanBrief{
		Slots: []BriefSlot{
			{Day: 1, MealType: "dinner"},
			{Day: 2, MealType: "dinner"},
			{Day: 1, MealType: "breakfast"},
		},
		Candidates: []BriefRecipe{
			{RecipeID: "rice_beans", Title: "Rice and beans", MealTypes: []string{"dinner"}},
			{RecipeID: "chicken_rice", Title: "Chicken and rice", MealTypes: []string{"dinner"}},
			{RecipeID: "oats", Title: "Oats", MealTypes: []string{"breakfast"}},
		},
		Leftovers: "sometimes",
	}
}

func TestValidPlanDraftIsAccepted(t *testing.T) {
	raw := `{"selections":[
		{"day":1,"meal_type":"dinner","recipe_id":"rice_beans"},
		{"day":2,"meal_type":"dinner","recipe_id":"chicken_rice"}
	]}`

	selections, err := ValidatePlanDraft(raw, testBrief())
	if err != nil {
		t.Fatalf("ValidatePlanDraft() = %v, want a valid draft to be accepted", err)
	}
	if len(selections) != 2 {
		t.Fatalf("selections = %d, want 2", len(selections))
	}
}

// A reply is reordered into the brief's slot order, so a plan is assembled the
// same way whatever order a model happens to emit.
func TestSelectionsAreReturnedInBriefSlotOrder(t *testing.T) {
	raw := `{"selections":[
		{"day":1,"meal_type":"breakfast","recipe_id":"oats"},
		{"day":1,"meal_type":"dinner","recipe_id":"rice_beans"}
	]}`

	selections, err := ValidatePlanDraft(raw, testBrief())
	if err != nil {
		t.Fatalf("ValidatePlanDraft() = %v", err)
	}
	if selections[0].MealType != "dinner" || selections[1].MealType != "breakfast" {
		t.Fatalf("selections = %v, want the brief's own slot order", selections)
	}
}

// The rule that makes an invented recipe impossible.
func TestRecipeThatWasNotOfferedIsRejected(t *testing.T) {
	raw := `{"selections":[{"day":1,"meal_type":"dinner","recipe_id":"peanut_stew"}]}`

	if _, err := ValidatePlanDraft(raw, testBrief()); !errors.Is(err, ErrPlanUnknownRecipe) {
		t.Fatalf("ValidatePlanDraft() = %v, want ErrPlanUnknownRecipe: a model must not be able to name a recipe the server did not offer", err)
	}
}

func TestSlotThatWasNotAskedForIsRejected(t *testing.T) {
	raw := `{"selections":[{"day":5,"meal_type":"dinner","recipe_id":"rice_beans"}]}`

	if _, err := ValidatePlanDraft(raw, testBrief()); !errors.Is(err, ErrPlanUnknownSlot) {
		t.Fatalf("ValidatePlanDraft() = %v, want ErrPlanUnknownSlot", err)
	}
}

func TestSameSlotFilledTwiceIsRejected(t *testing.T) {
	raw := `{"selections":[
		{"day":1,"meal_type":"dinner","recipe_id":"rice_beans"},
		{"day":1,"meal_type":"dinner","recipe_id":"chicken_rice"}
	]}`

	if _, err := ValidatePlanDraft(raw, testBrief()); !errors.Is(err, ErrPlanDuplicateSlot) {
		t.Fatalf("ValidatePlanDraft() = %v, want ErrPlanDuplicateSlot", err)
	}
}

// A breakfast recipe in a dinner slot is a category error, not a preference.
func TestRecipeUsedInAMealTypeItDoesNotBelongToIsRejected(t *testing.T) {
	raw := `{"selections":[{"day":1,"meal_type":"dinner","recipe_id":"oats"}]}`

	if _, err := ValidatePlanDraft(raw, testBrief()); !errors.Is(err, ErrPlanWrongMealType) {
		t.Fatalf("ValidatePlanDraft() = %v, want ErrPlanWrongMealType", err)
	}
}

func TestRepeatedRecipeIsRejectedOnlyWhenLeftoversAreDeclined(t *testing.T) {
	raw := `{"selections":[
		{"day":1,"meal_type":"dinner","recipe_id":"rice_beans"},
		{"day":2,"meal_type":"dinner","recipe_id":"rice_beans"}
	]}`

	allowed := testBrief()
	allowed.Leftovers = "sometimes"
	if _, err := ValidatePlanDraft(raw, allowed); err != nil {
		t.Fatalf("ValidatePlanDraft() = %v, want a repeat to be allowed when leftovers are welcome", err)
	}

	declined := testBrief()
	declined.Leftovers = "no"
	if _, err := ValidatePlanDraft(raw, declined); !errors.Is(err, ErrPlanRepeatedRecipe) {
		t.Fatalf("ValidatePlanDraft() = %v, want ErrPlanRepeatedRecipe", err)
	}
}

// A reply carrying a field the schema does not define means the provider
// answered a different question. The safe reading is to discard all of it.
func TestReplyWithAnUnknownFieldIsRejected(t *testing.T) {
	for name, raw := range map[string]string{
		"unknown field on a selection": `{"selections":[{"day":1,"meal_type":"dinner","recipe_id":"rice_beans","estimated_cost":42.00}]}`,
		"unknown field on the object":  `{"selections":[{"day":1,"meal_type":"dinner","recipe_id":"rice_beans"}],"total_cost":42.00}`,
	} {
		t.Run(name, func(t *testing.T) {
			if _, err := ValidatePlanDraft(raw, testBrief()); !errors.Is(err, ErrPlanNotStructured) {
				t.Fatalf("ValidatePlanDraft() = %v, want ErrPlanNotStructured", err)
			}
		})
	}
}

func TestNonStructuredRepliesAreRejected(t *testing.T) {
	for name, raw := range map[string]string{
		"prose":            "Here is a lovely week of meals for you!",
		"empty":            "",
		"an array":         `[{"day":1,"meal_type":"dinner","recipe_id":"rice_beans"}]`,
		"trailing content": `{"selections":[]} and here is why I chose it`,
		"truncated":        `{"selections":[{"day":1,`,
	} {
		t.Run(name, func(t *testing.T) {
			if _, err := ValidatePlanDraft(raw, testBrief()); err == nil {
				t.Fatal("ValidatePlanDraft() = nil, want a non-structured reply to be rejected")
			}
		})
	}
}

// Providers commonly wrap JSON in a code fence. That alone is not a reason to
// throw away an otherwise valid answer.
func TestFencedJSONIsAccepted(t *testing.T) {
	raw := "```json\n" + `{"selections":[{"day":1,"meal_type":"dinner","recipe_id":"rice_beans"}]}` + "\n```"

	if _, err := ValidatePlanDraft(raw, testBrief()); err != nil {
		t.Fatalf("ValidatePlanDraft() = %v, want fenced JSON to be accepted", err)
	}
}

func TestEmptySelectionListIsRejected(t *testing.T) {
	if _, err := ValidatePlanDraft(`{"selections":[]}`, testBrief()); !errors.Is(err, ErrPlanEmpty) {
		t.Fatalf("ValidatePlanDraft() = nil, want ErrPlanEmpty")
	}
}

// A provider cannot make the server do work proportional to a list it invented.
func TestReplyLongerThanThePlanHasSlotsIsRejected(t *testing.T) {
	var selections []string
	for i := 0; i < 40; i++ {
		selections = append(selections, `{"day":1,"meal_type":"dinner","recipe_id":"rice_beans"}`)
	}
	raw := `{"selections":[` + strings.Join(selections, ",") + `]}`

	if _, err := ValidatePlanDraft(raw, testBrief()); !errors.Is(err, ErrPlanTooLong) {
		t.Fatalf("ValidatePlanDraft() = %v, want ErrPlanTooLong", err)
	}
}

// The brief is what a provider is told, and it must not become a channel for
// anything about the person it is planning for.
func TestBriefCarriesNoIdentifyingOrHealthInformation(t *testing.T) {
	brief := testBrief()
	budget := 120.0
	brief.Budget = &budget

	prompt, err := brief.UserPrompt()
	if err != nil {
		t.Fatalf("UserPrompt() = %v", err)
	}
	for _, forbidden := range []string{
		"allerg", "diet", "vegan", "vegetarian", "peanut", "household_size",
		"user_id", "email", "free_text", "dislike",
	} {
		if strings.Contains(strings.ToLower(prompt), forbidden) {
			t.Fatalf("the plan brief contains %q; it must carry no identifying, dietary or health information", forbidden)
		}
	}
}
