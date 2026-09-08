package penny

import "strings"

// Routing decides which scopes a turn gets before the model sees anything.
//
// This is the cheapest safety control there is. A model that was never shown
// budget.set_weekly cannot be talked into calling it, whatever the message
// said, and no amount of prompt injection adds a tool to a list the server
// built. Every other control assumes an adversary who got past this one.
//
// The classifier is deliberately generous — it grants a scope on weak evidence
// — because the cost of a missing scope is Penny saying she cannot help with
// something she can, and the cost of an extra scope is bounded by every gate
// downstream. It is a narrowing, not a decision.

// alwaysGranted are the scopes every turn gets. Profile and memory shape how
// Penny talks rather than what she can change, and knowledge is how she avoids
// answering benefits questions from the model's own recall.
var alwaysGranted = []Scope{ScopeProfile, ScopeMemory, ScopeKnowledge}

var scopeSignals = map[Scope][]string{
	ScopePantry:    {"pantry", "fridge", "refrigerator", "freezer", "cupboard", "on hand", "have in", "expiring", "expire", "going bad", "leftover", "spoil"},
	ScopeMealPlan:  {"meal", "meals", "dinner", "lunch", "breakfast", "cook", "cooking", "recipe", "recipes", "plan my week", "meal plan", "what should i make", "eat"},
	ScopeGrocery:   {"grocery", "groceries", "shopping list", "shop", "store", "buy", "cart", "aisle"},
	ScopeBenefits:  {"snap", "wic", "medicaid", "liheap", "ebt", "food stamps", "benefit", "benefits", "assistance", "application", "apply", "qualify", "eligible", "eligibility"},
	ScopeResources: {"food bank", "pantry near", "clinic", "shelter", "resource", "resources", "near me", "nearby", "local", "help with", "utility", "utilities"},
	ScopeBudget:    {"budget", "afford", "spend", "spending", "cost", "cheaper", "save money", "expensive", "bill", "bills", "per week"},
	ScopeHousehold: {"household", "family", "kids", "children", "my son", "my daughter", "we are", "people", "feed"},
}

// Route returns the scopes a message may use.
func Route(input string) []Scope {
	lowered := strings.ToLower(input)

	granted := make([]Scope, 0, len(scopeSignals)+len(alwaysGranted))
	granted = append(granted, alwaysGranted...)

	seen := make(map[Scope]struct{}, len(granted))
	for _, scope := range granted {
		seen[scope] = struct{}{}
	}

	// Scope order is fixed rather than map order so that two identical messages
	// produce two identical tool lists. A tool list that reshuffles per request
	// makes an eval failure impossible to reproduce.
	for _, scope := range scopeOrder {
		if _, already := seen[scope]; already {
			continue
		}
		for _, signal := range scopeSignals[scope] {
			if strings.Contains(lowered, signal) {
				granted = append(granted, scope)
				seen[scope] = struct{}{}
				break
			}
		}
	}

	// Meals and groceries are one thought to a user even when they only said
	// one of the words, and household size is what a plan is built for.
	if _, ok := seen[ScopeMealPlan]; ok {
		granted = appendScope(granted, seen, ScopeGrocery, ScopeHousehold, ScopePantry)
	}
	if _, ok := seen[ScopeGrocery]; ok {
		granted = appendScope(granted, seen, ScopeMealPlan, ScopeHousehold)
	}
	// Someone asking about a program wants to know where to go about it.
	if _, ok := seen[ScopeBenefits]; ok {
		granted = appendScope(granted, seen, ScopeResources)
	}

	return granted
}

var scopeOrder = []Scope{
	ScopeHousehold, ScopePantry, ScopeMealPlan, ScopeGrocery,
	ScopeBenefits, ScopeResources, ScopeBudget,
}

func appendScope(granted []Scope, seen map[Scope]struct{}, scopes ...Scope) []Scope {
	for _, scope := range scopes {
		if _, ok := seen[scope]; ok {
			continue
		}
		seen[scope] = struct{}{}
		granted = append(granted, scope)
	}
	return granted
}
