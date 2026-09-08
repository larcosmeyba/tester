package penny

import (
	"fmt"
	"sort"
)

// Risk is how much it costs the user if a tool call is wrong.
//
// It is not a measure of how likely the model is to be wrong. A capable model
// and a careless one get the same gates, because the gates exist for the case
// where the model was steered by someone other than the user.
type Risk string

const (
	// RiskRead changes nothing. Wrong means Penny read something she did not
	// need, within data the user already owns.
	RiskRead Risk = "read"
	// RiskWrite changes the user's data in a way they can undo in the app in a
	// tap or two: a pantry item, a checked-off grocery line.
	RiskWrite Risk = "write"
	// RiskConfirm changes something the user would be upset to find changed:
	// their week's meals, their grocery list, their budget. These never execute
	// on the model's say-so. They come back as a proposal.
	RiskConfirm Risk = "confirm"
)

// Scope is a family of tools. The router grants a turn a set of scopes based on
// what the user appears to be asking about, and the gateway refuses any tool
// outside them.
//
// Restricting which tools a model can see is more reliable than instructing it
// not to use them, so the scope set is the primary control and the prompt is a
// secondary one.
type Scope string

const (
	ScopeProfile   Scope = "profile"
	ScopeHousehold Scope = "household"
	ScopePantry    Scope = "pantry"
	ScopeMealPlan  Scope = "mealplan"
	ScopeGrocery   Scope = "grocery"
	ScopeBenefits  Scope = "benefits"
	ScopeResources Scope = "resources"
	ScopeBudget    Scope = "budget"
	ScopeKnowledge Scope = "knowledge"
	ScopeMemory    Scope = "memory"
)

// Tool describes one capability. The registry below is the only list of tools
// that exists on the server; a name absent from it cannot be called, however
// convincingly a model asks.
type Tool struct {
	Name  string
	Scope Scope
	Risk  Risk
	// What the tool does, in the words the model is given. Kept here rather
	// than in the agent so that the description and the permission cannot drift
	// apart across two repositories.
	Description string
	// Argument names the tool accepts. The gateway rejects anything else rather
	// than ignoring it: an unexpected argument means the model and the server
	// disagree about this tool, and guessing which is right is how a wrong
	// write happens.
	Arguments []string
	// Arguments that must be present.
	Required []string
	// Arguments whose values never reach a log or an audit row. A pantry item's
	// name is fine; a free-text note the user typed is not.
	Sensitive []string
}

// Requires reports whether the tool may run under the granted scopes.
func (t Tool) Requires(granted []Scope) bool {
	for _, scope := range granted {
		if scope == t.Scope {
			return true
		}
	}
	return false
}

// NeedsConfirmation reports whether a call must come back as a proposal rather
// than execute.
func (t Tool) NeedsConfirmation() bool { return t.Risk == RiskConfirm }

// Mutates reports whether the tool writes anything at all.
func (t Tool) Mutates() bool { return t.Risk != RiskRead }

// ValidateArguments checks a call's arguments against the tool's declaration.
// It does not check types or values — a tool's handler owns that, because only
// the handler knows what a valid quantity or a valid date is for its service.
// What it does own is the closed set: no argument the tool did not declare.
func (t Tool) ValidateArguments(args map[string]any) error {
	allowed := make(map[string]struct{}, len(t.Arguments))
	for _, name := range t.Arguments {
		allowed[name] = struct{}{}
	}
	unknown := make([]string, 0)
	for name := range args {
		if _, ok := allowed[name]; !ok {
			unknown = append(unknown, name)
		}
	}
	if len(unknown) > 0 {
		sort.Strings(unknown)
		return fmt.Errorf("tool %s does not accept %v", t.Name, unknown)
	}
	for _, name := range t.Required {
		if _, ok := args[name]; !ok {
			return fmt.Errorf("tool %s requires %s", t.Name, name)
		}
	}
	return nil
}

// Redact returns the arguments with sensitive values replaced. Audit rows and
// logs get this, never the original.
func (t Tool) Redact(args map[string]any) map[string]any {
	if len(args) == 0 {
		return map[string]any{}
	}
	sensitive := make(map[string]struct{}, len(t.Sensitive))
	for _, name := range t.Sensitive {
		sensitive[name] = struct{}{}
	}
	out := make(map[string]any, len(args))
	for name, value := range args {
		if _, ok := sensitive[name]; ok {
			out[name] = "[redacted]"
			continue
		}
		out[name] = value
	}
	return out
}
