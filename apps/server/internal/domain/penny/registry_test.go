package penny

import (
	"slices"
	"testing"
)

// The registry is the list of everything Penny can do. These tests are about
// keeping it honest rather than about any one tool.

func TestEveryToolDeclaresItsRequiredArguments(t *testing.T) {
	for _, tool := range Tools() {
		for _, required := range tool.Required {
			if !slices.Contains(tool.Arguments, required) {
				t.Errorf("%s requires %q but does not declare it as an argument", tool.Name, required)
			}
		}
		for _, sensitive := range tool.Sensitive {
			if !slices.Contains(tool.Arguments, sensitive) {
				t.Errorf("%s marks %q sensitive but does not declare it as an argument", tool.Name, sensitive)
			}
		}
		if tool.Description == "" {
			t.Errorf("%s has no description; the model is told nothing about it", tool.Name)
		}
	}
}

// Anything that changes a user's week, their shopping or their money is
// something they get to agree to first. This encodes that decision so it cannot
// be quietly reversed by a one-word edit to the registry.
func TestHighImpactWritesRequireConfirmation(t *testing.T) {
	mustConfirm := []string{"mealplan.generate", "grocery.create", "budget.set_weekly"}
	for _, name := range mustConfirm {
		tool, err := Lookup(name)
		if err != nil {
			t.Fatalf("%s is missing from the registry", name)
		}
		if !tool.NeedsConfirmation() {
			t.Errorf("%s no longer requires confirmation", name)
		}
	}
}

// Penny reads benefits information. She does not fill in, approve or submit a
// government form, and no tool exists that would let her.
func TestNoBenefitsToolWrites(t *testing.T) {
	for _, tool := range Tools() {
		if tool.Scope == ScopeBenefits && tool.Mutates() {
			t.Errorf("%s writes to the benefits system; Penny is read-only there", tool.Name)
		}
	}
}

func TestValidateArgumentsRejectsUndeclaredArguments(t *testing.T) {
	tool, err := Lookup("pantry.add")
	if err != nil {
		t.Fatal(err)
	}

	err = tool.ValidateArguments(map[string]any{
		"name": "milk", "quantity": "1 gal", "location": "REFRIGERATOR",
		// A model and a server disagreeing about a tool is not something to
		// resolve by ignoring the difference.
		"user_id": "somebody-else",
	})
	if err == nil {
		t.Fatal("an undeclared argument was accepted")
	}
}

func TestValidateArgumentsRequiresDeclaredRequirements(t *testing.T) {
	tool, _ := Lookup("grocery.create")
	if err := tool.ValidateArguments(map[string]any{}); err == nil {
		t.Fatal("a missing required argument was accepted")
	}
}

func TestRedactHidesSensitiveValues(t *testing.T) {
	tool, _ := Lookup("memory.upsert")
	redacted := tool.Redact(map[string]any{
		"kind":    "preference",
		"content": "cooks for four on weeknights",
	})
	if redacted["content"] != "[redacted]" {
		t.Fatal("a sensitive argument reached the audit log verbatim")
	}
	if redacted["kind"] != "preference" {
		t.Fatal("a non-sensitive argument was redacted")
	}
}

func TestToolsForScopesOffersOnlyGrantedTools(t *testing.T) {
	tools := ToolsForScopes([]Scope{ScopePantry})
	if len(tools) == 0 {
		t.Fatal("the pantry scope offered no tools")
	}
	for _, tool := range tools {
		if tool.Scope != ScopePantry {
			t.Errorf("%s was offered under the pantry scope alone", tool.Name)
		}
	}
}
