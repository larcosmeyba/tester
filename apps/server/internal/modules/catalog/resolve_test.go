package catalog

import "testing"

import "github.com/helpthehive/server/internal/domain/meals"

func ingredient(id, displayName string) meals.Ingredient {
	return meals.Ingredient{ID: id, DisplayName: displayName}
}

func testResolver() *Resolver {
	return NewResolver([]meals.Ingredient{
		ingredient("milk", "Milk"),
		ingredient("egg", "Egg"),
		ingredient("black_beans_canned", "Black Beans (canned)"),
		ingredient("chicken_thigh_bs", "Chicken Thighs (boneless, skinless)"),
		ingredient("rice_white", "White Rice"),
	})
}

func TestResolvesAnExactName(t *testing.T) {
	got := testResolver().Resolve("Milk")
	if got.IngredientID != "milk" || got.Outcome != OutcomeExactName {
		t.Fatalf("Resolve(\"Milk\") = %+v, want milk / exact_name", got)
	}
}

func TestResolutionIgnoresCaseSpacingAndPunctuation(t *testing.T) {
	for _, name := range []string{"milk", "  MILK  ", "Milk.", "mIlK"} {
		got := testResolver().Resolve(name)
		if got.IngredientID != "milk" {
			t.Errorf("Resolve(%q) = %+v, want milk", name, got)
		}
	}
}

func TestResolvesTheCatalogueIDAsTyped(t *testing.T) {
	// Somebody typing the id, or its words, reaches the same row.
	for _, name := range []string{"black_beans_canned", "black beans canned"} {
		got := testResolver().Resolve(name)
		if got.IngredientID != "black_beans_canned" {
			t.Errorf("Resolve(%q) = %+v, want black_beans_canned", name, got)
		}
	}
}

func TestResolvesADisplayNameWithoutItsQualifier(t *testing.T) {
	// "Chicken Thighs (boneless, skinless)" is reachable as "Chicken Thighs".
	got := testResolver().Resolve("chicken thighs")
	if got.IngredientID != "chicken_thigh_bs" {
		t.Fatalf("Resolve(\"chicken thighs\") = %+v, want chicken_thigh_bs", got)
	}
}

func TestResolvesAPluralToItsSingular(t *testing.T) {
	got := testResolver().Resolve("Eggs")
	if got.IngredientID != "egg" || got.Outcome != OutcomeSingular {
		t.Fatalf("Resolve(\"Eggs\") = %+v, want egg / singular", got)
	}
}

func TestUnknownNameStaysUnresolved(t *testing.T) {
	got := testResolver().Resolve("Blue Raspberry Cordial")
	if got.Resolved() {
		t.Fatalf("Resolve(unknown) = %+v, want no match — the catalogue does not know this", got)
	}
	if got.Outcome != OutcomeUnmatched {
		t.Errorf("Outcome = %q, want unmatched", got.Outcome)
	}
}

// The rule that matters most: never guess between candidates.
func TestAmbiguousNameResolvesToNothing(t *testing.T) {
	resolver := NewResolver([]meals.Ingredient{
		ingredient("milk_whole", "Milk (whole)"),
		ingredient("milk_skim", "Milk (skim)"),
	})

	got := resolver.Resolve("Milk")
	if got.Resolved() {
		t.Fatalf("Resolve(\"Milk\") = %+v, want no match: two entries answer to it", got)
	}
	if got.Outcome != OutcomeAmbiguous {
		t.Fatalf("Outcome = %q, want ambiguous", got.Outcome)
	}
	if len(got.Candidates) != 2 {
		t.Errorf("Candidates = %v, want both entries reported so a human can fix the catalogue", got.Candidates)
	}
}

func TestNothingSimilarIsEverMatched(t *testing.T) {
	resolver := testResolver()
	// Near misses a fuzzy matcher would happily accept. Each one would put an
	// ingredient the user does not own into a plan.
	for _, name := range []string{"mil", "milky", "almond milk", "rice", "chicken"} {
		if got := resolver.Resolve(name); got.Resolved() {
			t.Errorf("Resolve(%q) = %+v, want no match — this is a guess, not a match", name, got)
		}
	}
}

func TestEmptyNameIsUnresolved(t *testing.T) {
	for _, name := range []string{"", "   ", "!!!"} {
		if got := testResolver().Resolve(name); got.Resolved() {
			t.Errorf("Resolve(%q) = %+v, want no match", name, got)
		}
	}
}

// An exact display name is not demoted by another entry reaching the same key
// through a stripped qualifier.
func TestExactNameOutranksAStrippedQualifier(t *testing.T) {
	resolver := NewResolver([]meals.Ingredient{
		ingredient("rice_white", "White Rice"),
		ingredient("rice_white_long", "White Rice (long grain)"),
	})
	got := resolver.Resolve("White Rice")
	if got.Outcome != OutcomeAmbiguous {
		t.Fatalf("Outcome = %q, want ambiguous: two entries claim this name", got.Outcome)
	}
	if got.Resolved() {
		t.Fatal("an ambiguous name must not resolve")
	}
}
