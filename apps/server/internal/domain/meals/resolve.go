package meals

import (
	"fmt"
	"sort"
	"strings"
)

// Resolving an imported recipe against the ingredient catalogue.
//
// An extraction is a proposal. This is where it is measured against what the
// system actually knows, and the answer is only ever recorded — never
// invented. Nothing here fills in a quantity, a time, a serving count or a
// nutrition figure the source did not state.

// Notes recorded on a recipe when the catalogue cannot vouch for something.
// They are shown to the person reviewing the import, which is the point: the
// gap is theirs to close, not the extractor's to guess at.
const (
	MissingServings   = "servings"
	MissingIngredient = "ingredient_not_in_catalogue"
	MissingQuantity   = "ingredient_quantity"
)

// ResolveAgainstCatalog matches a recipe's ingredient lines to the canonical
// catalogue, converts stated masses to grams, and recomputes what is missing
// and whether the recipe may be planned.
//
// This is the only place BaseMealPlanEligible is ever widened. An extractor
// may say a recipe is complete; only the catalogue can confirm that every line
// it needs to buy and scale is one the system actually knows.
//
// Matching is exact-after-normalization and never guesses — see
// Catalog.FindByName. A line the catalogue does not know keeps its raw text,
// gains a note saying so, and leaves the recipe ineligible for automatic
// planning. It stays perfectly readable: an unplannable recipe is still a
// recipe, and the user can cook from it.
//
// The returned recipe is a copy; the input is not modified.
func ResolveAgainstCatalog(recipe Recipe, catalog *Catalog) Recipe {
	resolved := recipe
	resolved.Ingredients = make([]RecipeIngredient, len(recipe.Ingredients))
	copy(resolved.Ingredients, recipe.Ingredients)

	notes := newNoteSet(recipe.MissingInformation)

	for i := range resolved.Ingredients {
		line := &resolved.Ingredients[i]

		// Optional and to-taste lines are never bought and never scaled, so
		// neither an unknown identity nor a missing quantity holds a recipe
		// back on their account.
		optional := line.IsOptional || line.IsToTaste

		if line.IngredientID == nil && catalog != nil {
			if ingredient, ok := catalog.FindByName(candidateName(*line)); ok {
				id := ingredient.ID
				line.IngredientID = &id
				if line.DisplayName == nil {
					name := ingredient.DisplayName
					line.DisplayName = &name
				}
			}
		}

		// Grams are arithmetic when the source stated a mass, and a guess
		// otherwise — see units.go. An unconvertible unit leaves Grams nil and
		// is not a defect in the line: the quantity stands as stated.
		if line.Grams == nil && line.Quantity != nil && line.Unit != nil {
			if grams, ok := GramsFor(*line.Quantity, *line.Unit); ok {
				line.Grams = &grams
			}
		}

		if optional {
			continue
		}
		if line.IngredientID == nil {
			notes.add(fmt.Sprintf("%s:%s", MissingIngredient, displayFor(*line)))
			noteLine(line, "This ingredient is not in the Help The Hive catalogue yet.")
			continue
		}
		if line.Quantity == nil {
			notes.add(fmt.Sprintf("%s:%s", MissingQuantity, displayFor(*line)))
			noteLine(line, "The source did not say how much of this to use.")
		}
	}

	if resolved.Servings == nil || *resolved.Servings <= 0 {
		notes.add(MissingServings)
	}

	resolved.MissingInformation = notes.sorted()

	// Recomputed, never trusted from the extractor. A recipe the system cannot
	// fully quantify is viewable but is never planned automatically, because
	// planning it would mean scaling and pricing figures nobody stated.
	resolved.BaseMealPlanEligible = len(resolved.MissingInformation) == 0

	return resolved
}

// candidateName is what to look the line up by: the extractor's display name
// when it gave one, otherwise the raw text as written in the video.
func candidateName(line RecipeIngredient) string {
	if line.DisplayName != nil && strings.TrimSpace(*line.DisplayName) != "" {
		return *line.DisplayName
	}
	return line.RawText
}

func displayFor(line RecipeIngredient) string {
	name := strings.TrimSpace(candidateName(line))
	if name == "" {
		return fmt.Sprintf("line %d", line.Position)
	}
	return name
}

// noteLine records why a line is incomplete, without overwriting a note the
// extractor already made about it.
func noteLine(line *RecipeIngredient, note string) {
	if line.MissingInformation != nil && strings.TrimSpace(*line.MissingInformation) != "" {
		return
	}
	text := note
	line.MissingInformation = &text
}

type noteSet struct {
	seen map[string]bool
}

func newNoteSet(existing []string) *noteSet {
	set := &noteSet{seen: make(map[string]bool, len(existing)+4)}
	for _, note := range existing {
		set.add(note)
	}
	return set
}

func (s *noteSet) add(note string) {
	note = strings.TrimSpace(note)
	if note != "" {
		s.seen[note] = true
	}
}

func (s *noteSet) sorted() []string {
	out := make([]string, 0, len(s.seen))
	for note := range s.seen {
		out = append(out, note)
	}
	sort.Strings(out)
	return out
}
