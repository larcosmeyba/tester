package penny

import (
	"slices"
	"testing"
)

func TestRouteAlwaysGrantsTheBaseScopes(t *testing.T) {
	scopes := Route("hello")
	for _, required := range []Scope{ScopeProfile, ScopeMemory, ScopeKnowledge} {
		if !slices.Contains(scopes, required) {
			t.Fatalf("scope %q was not granted on a bare greeting", required)
		}
	}
}

// The point of routing: a question about dinner must not come with the ability
// to change somebody's budget.
func TestRouteWithholdsUnrelatedScopes(t *testing.T) {
	scopes := Route("what can I make for dinner tonight?")

	if slices.Contains(scopes, ScopeBudget) {
		t.Fatal("a meal question was granted the budget scope")
	}

	tools := ToolsForScopes(scopes)
	for _, tool := range tools {
		if tool.Name == "budget.set_weekly" {
			t.Fatal("budget.set_weekly was offered to a meal question")
		}
	}
	if len(tools) == 0 {
		t.Fatal("a meal question was offered no tools at all")
	}
}

func TestRouteGrantsRelatedScopesTogether(t *testing.T) {
	scopes := Route("plan my meals for the week")
	for _, expected := range []Scope{ScopeMealPlan, ScopeGrocery, ScopeHousehold, ScopePantry} {
		if !slices.Contains(scopes, expected) {
			t.Fatalf("scope %q was not granted for a meal planning request", expected)
		}
	}
}

func TestRouteGrantsBenefitsAndResourcesTogether(t *testing.T) {
	scopes := Route("do I qualify for SNAP?")
	if !slices.Contains(scopes, ScopeBenefits) {
		t.Fatal("a SNAP question was not granted the benefits scope")
	}
	if !slices.Contains(scopes, ScopeResources) {
		t.Fatal("a benefits question should also reach local resources")
	}
}

// Two identical messages must produce two identical tool lists, or an eval
// failure cannot be reproduced.
func TestRouteIsDeterministic(t *testing.T) {
	const input = "what's in my pantry and what should I buy?"
	first := Route(input)
	for i := 0; i < 20; i++ {
		if !slices.Equal(first, Route(input)) {
			t.Fatal("Route returned a different scope order for the same input")
		}
	}
}
