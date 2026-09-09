package catalog

import (
	"strings"
	"unicode"

	"github.com/helpthehive/server/internal/domain/meals"
)

// Resolving free text to a canonical ingredient.
//
// A person types "Milk" into their pantry. The meal generator matches on
// ingredient ids. Something has to connect the two, and that something must be
// conservative: a wrong match puts an ingredient a user does not own into a
// plan, or — much worse — routes an allergen check at the wrong row.
//
// So this resolver only ever makes matches it can justify exactly. It does no
// fuzzy matching, no edit distance, no "closest" anything. When it is not
// certain it says so, and the item stays unresolved, which is a supported
// state rather than a failure: the pantry keeps it, shows it, and the planner
// simply does not count it.

// Outcome says why a name did or did not resolve. It is recorded so an
// unresolved pantry item can be explained rather than just being empty.
type Outcome string

const (
	// OutcomeExactName — the name matched a catalogue display name exactly,
	// once normalised.
	OutcomeExactName Outcome = "exact_name"
	// OutcomeExactID — the name matched a catalogue id, e.g. someone typing
	// "black beans canned" for black_beans_canned.
	OutcomeExactID Outcome = "exact_id"
	// OutcomeSingular — matched after removing a trailing plural "s".
	OutcomeSingular Outcome = "singular"
	// OutcomeAmbiguous — more than one catalogue entry matched. Deliberately
	// unresolved: picking one of several would be a guess.
	OutcomeAmbiguous Outcome = "ambiguous"
	// OutcomeUnmatched — nothing matched.
	OutcomeUnmatched Outcome = "unmatched"
)

// Resolution is the answer for one name.
type Resolution struct {
	// IngredientID is empty unless Outcome resolved.
	IngredientID string
	Outcome      Outcome
	// Candidates lists what an ambiguous name matched, so a human reviewing
	// the catalogue can see why it could not be decided.
	Candidates []string
}

// Resolved reports whether the name produced a usable ingredient id.
func (r Resolution) Resolved() bool { return r.IngredientID != "" }

// Resolver indexes a catalogue for lookup. Build one per catalogue read; it
// holds no state beyond the index.
type Resolver struct {
	// byKey maps a normalised key to every ingredient id that claims it. A key
	// with more than one id is ambiguous by construction.
	byKey map[string]map[string]Outcome
}

// NewResolver indexes the catalogue.
//
// Both the display name and the id are indexed, because people type both: "Black
// Beans (canned)" and "black beans canned" should reach the same row. A
// parenthetical qualifier is additionally indexed without it, so "Chicken
// Thighs (boneless, skinless)" is reachable as "chicken thighs" — unless
// another entry claims that key too, in which case it becomes ambiguous and
// neither is chosen.
func NewResolver(ingredients []meals.Ingredient) *Resolver {
	resolver := &Resolver{byKey: map[string]map[string]Outcome{}}
	for _, ingredient := range ingredients {
		resolver.index(normalize(ingredient.DisplayName), ingredient.ID, OutcomeExactName)
		resolver.index(normalize(ingredient.ID), ingredient.ID, OutcomeExactID)
		if base := normalize(stripParenthetical(ingredient.DisplayName)); base != "" {
			resolver.index(base, ingredient.ID, OutcomeExactName)
		}
	}
	return resolver
}

func (r *Resolver) index(key, id string, outcome Outcome) {
	if key == "" {
		return
	}
	if r.byKey[key] == nil {
		r.byKey[key] = map[string]Outcome{}
	}
	// A stronger claim wins: an entry whose display name IS this key should not
	// be demoted by another entry reaching it through a stripped qualifier.
	if existing, ok := r.byKey[key][id]; !ok || rank(outcome) < rank(existing) {
		r.byKey[key][id] = outcome
	}
}

func rank(outcome Outcome) int {
	switch outcome {
	case OutcomeExactName:
		return 0
	case OutcomeExactID:
		return 1
	}
	return 2
}

// Resolve matches one free-text name.
func (r *Resolver) Resolve(name string) Resolution {
	key := normalize(name)
	if key == "" {
		return Resolution{Outcome: OutcomeUnmatched}
	}
	if resolution, ok := r.lookup(key); ok {
		return resolution
	}

	// Second and last pass: a trailing plural. "Eggs" reaches "Egg". This is a
	// spelling rule, not a similarity score — it either produces an exact key
	// or it does not.
	if singular := strings.TrimSuffix(key, "s"); singular != key && singular != "" {
		if resolution, ok := r.lookup(singular); ok {
			if resolution.Resolved() {
				resolution.Outcome = OutcomeSingular
			}
			return resolution
		}
	}

	return Resolution{Outcome: OutcomeUnmatched}
}

func (r *Resolver) lookup(key string) (Resolution, bool) {
	ids, ok := r.byKey[key]
	if !ok || len(ids) == 0 {
		return Resolution{}, false
	}
	if len(ids) > 1 {
		// Two catalogue entries answer to the same name. Choosing between them
		// would be a coin flip wearing a suit.
		candidates := make([]string, 0, len(ids))
		for id := range ids {
			candidates = append(candidates, id)
		}
		sortStrings(candidates)
		return Resolution{Outcome: OutcomeAmbiguous, Candidates: candidates}, true
	}
	for id, outcome := range ids {
		return Resolution{IngredientID: id, Outcome: outcome}, true
	}
	return Resolution{}, false
}

// normalize reduces a name to a comparison key: lower case, punctuation and
// separators flattened to single spaces, ends trimmed. It deliberately does
// nothing cleverer — every transformation here is reversible in the reader's
// head, which is what makes a match explainable.
func normalize(value string) string {
	var b strings.Builder
	b.Grow(len(value))
	lastWasSpace := true
	for _, r := range strings.ToLower(strings.TrimSpace(value)) {
		switch {
		case unicode.IsLetter(r) || unicode.IsDigit(r):
			b.WriteRune(r)
			lastWasSpace = false
		default:
			if !lastWasSpace {
				b.WriteRune(' ')
				lastWasSpace = true
			}
		}
	}
	return strings.TrimSpace(b.String())
}

// stripParenthetical removes a trailing qualifier: "Chicken Thighs (boneless,
// skinless)" becomes "Chicken Thighs".
func stripParenthetical(value string) string {
	if i := strings.Index(value, "("); i > 0 {
		return strings.TrimSpace(value[:i])
	}
	return ""
}

func sortStrings(values []string) {
	for i := 1; i < len(values); i++ {
		for j := i; j > 0 && values[j] < values[j-1]; j-- {
			values[j], values[j-1] = values[j-1], values[j]
		}
	}
}
