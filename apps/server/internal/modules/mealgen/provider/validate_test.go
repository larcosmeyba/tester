package provider

import (
	"errors"
	"strings"
	"testing"
)

func facts() PlanFacts {
	budget := 100.0
	headroom := 41.5
	return PlanFacts{
		MealsPlanned:      5,
		Days:              5,
		EstimatedCostLow:  47.25,
		EstimatedCostHigh: 58.50,
		CostConfidence:    "medium",
		Budget:            &budget,
		Headroom:          &headroom,
		PantryItemsUsed:   3,
		MealTitles:        []string{"Burrito Bowls", "Stir-Fry"},
	}
}

func TestValidateMessageAcceptsAReplyThatOnlyQuotesGivenNumbers(t *testing.T) {
	raw := `{"message": "Here are 5 meals for the week, estimated between 47.25 and 58.50."}`

	message, err := ValidateMessage(raw, facts())
	if err != nil {
		t.Fatalf("ValidateMessage() error = %v", err)
	}
	if message == "" {
		t.Fatal("a valid reply must return its message")
	}
}

func TestValidateMessageAcceptsAFencedReply(t *testing.T) {
	raw := "```json\n{\"message\": \"Your 5 meals are ready.\"}\n```"
	if _, err := ValidateMessage(raw, facts()); err != nil {
		t.Fatalf("ValidateMessage() error = %v", err)
	}
}

func TestValidateMessageRejectsAnInventedNumber(t *testing.T) {
	// $52.10 is nowhere in the fact sheet: the model produced it itself.
	raw := `{"message": "Your groceries will come to about 52.10 this week."}`

	if _, err := ValidateMessage(raw, facts()); !errors.Is(err, ErrInventedValue) {
		t.Fatalf("error = %v, want ErrInventedValue", err)
	}
}

func TestValidateMessageRejectsEligibilityAndApprovalClaims(t *testing.T) {
	for _, raw := range []string{
		`{"message": "Good news, you qualify for this plan."}`,
		`{"message": "You are approved."}`,
		`{"message": "This plan is guaranteed to fit your budget."}`,
		`{"message": "Your application was submitted."}`,
	} {
		if _, err := ValidateMessage(raw, facts()); !errors.Is(err, ErrForbidden) {
			t.Fatalf("reply %q gave error %v, want ErrForbidden", raw, err)
		}
	}
}

func TestValidateMessageRejectsUnstructuredOrEmptyReplies(t *testing.T) {
	if _, err := ValidateMessage("Here is your plan!", facts()); !errors.Is(err, ErrNotStructured) {
		t.Fatal("a reply that is not the expected JSON must be rejected")
	}
	if _, err := ValidateMessage(`{"message": "   "}`, facts()); !errors.Is(err, ErrEmpty) {
		t.Fatal("an empty message must be rejected")
	}
}

func TestValidateMessageRejectsAnOverlongReply(t *testing.T) {
	long := `{"message": "`
	for i := 0; i < 700; i++ {
		long += "a"
	}
	long += `"}`

	if _, err := ValidateMessage(long, facts()); !errors.Is(err, ErrTooLong) {
		t.Fatal("an overlong reply must be rejected")
	}
}

func TestValidateMessageStripsMarkup(t *testing.T) {
	raw := `{"message": "Here are **5 meals** for the week."}`

	message, err := ValidateMessage(raw, facts())
	if err != nil {
		t.Fatalf("ValidateMessage() error = %v", err)
	}
	for _, character := range []string{"*", "_", "#", "[", "]"} {
		if strings.Contains(message, character) {
			t.Fatalf("message = %q, want markup removed", message)
		}
	}
}

func TestDisabledProviderReportsItselfRatherThanFailing(t *testing.T) {
	_, err := Disabled{}.Complete(t.Context(), Request{})
	if !errors.Is(err, ErrNoProvider) {
		t.Fatalf("error = %v, want ErrNoProvider", err)
	}
}

func TestNewRejectsAProviderMissingItsSettings(t *testing.T) {
	if _, err := New(Config{Kind: "openai_compatible"}); err == nil {
		t.Fatal("a provider with no base URL, model or key must fail at start-up")
	}
	if _, err := New(Config{Kind: "mystery"}); err == nil {
		t.Fatal("an unknown provider must fail at start-up")
	}
	provider, err := New(Config{})
	if err != nil || provider.Name() != "disabled" {
		t.Fatalf("New(empty) = %v, %v; want the disabled provider", provider, err)
	}
}
