package recipes

import (
	"errors"
	"strings"

	"github.com/helpthehive/server/internal/domain/meals"
)

// Accepting a draft, with the reviewer's corrections.
//
// An import is a proposal. The video may never have said how much of something
// to use, or named an ingredient the catalogue does not know — and the person
// who chose the video is the one who can settle both. This is where they do.
//
// It is a patch, never a whole recipe: the client cannot restate the recipe,
// only fill in the values a source commonly fails to give. Everything supplied
// here is recorded as `human` confidence, because a person stated it — not the
// source, and not an inference.

// ErrUnknownIngredient is returned when a reviewer resolves a line to an
// ingredient the catalogue does not have.
var ErrUnknownIngredient = errors.New("that ingredient is not in the catalogue")

// ErrInvalidPatch is returned for a correction that cannot apply.
var ErrInvalidPatch = errors.New("that correction does not fit the draft")

type AcceptPatch struct {
	Servings    *float64
	Ingredients []IngredientPatch
}

type IngredientPatch struct {
	Position     int
	Quantity     *float64
	Unit         *string
	IngredientID *string
}

// Empty reports whether the reviewer changed nothing, in which case the draft
// is accepted exactly as extracted.
func (p AcceptPatch) Empty() bool {
	return p.Servings == nil && len(p.Ingredients) == 0
}

// applyPatch returns the draft with the reviewer's corrections applied.
//
// It does not decide whether the result is plannable — resolution does that
// afterwards, from the catalogue. All this does is record what a person said.
func applyPatch(draft meals.Recipe, patch AcceptPatch, catalog *meals.Catalog) (meals.Recipe, error) {
	patched := draft
	patched.Ingredients = make([]meals.RecipeIngredient, len(draft.Ingredients))
	copy(patched.Ingredients, draft.Ingredients)

	if patch.Servings != nil {
		if *patch.Servings <= 0 {
			return meals.Recipe{}, ErrInvalidPatch
		}
		servings := *patch.Servings
		patched.Servings = &servings
		// Stated by a person, so neither `source` nor `inferred`.
		patched.ServingsConfidence = "human"
	}

	byPosition := make(map[int]*meals.RecipeIngredient, len(patched.Ingredients))
	for i := range patched.Ingredients {
		byPosition[patched.Ingredients[i].Position] = &patched.Ingredients[i]
	}

	for _, correction := range patch.Ingredients {
		line, ok := byPosition[correction.Position]
		if !ok {
			// Addressing a line that is not in the draft means the client is
			// working from a different version of it.
			return meals.Recipe{}, ErrInvalidPatch
		}

		if correction.Quantity != nil {
			if *correction.Quantity <= 0 {
				return meals.Recipe{}, ErrInvalidPatch
			}
			quantity := *correction.Quantity
			line.Quantity = &quantity
			// The gap this note described is now closed. Grams are recomputed
			// by resolution, not here.
			line.MissingInformation = nil
			line.Grams = nil
		}
		if correction.Unit != nil {
			unit := strings.TrimSpace(*correction.Unit)
			if unit == "" {
				line.Unit = nil
			} else {
				line.Unit = &unit
			}
			line.Grams = nil
		}
		if correction.IngredientID != nil {
			id := strings.TrimSpace(*correction.IngredientID)
			if id == "" {
				return meals.Recipe{}, ErrInvalidPatch
			}
			// A reviewer may choose from the catalogue; they may not invent an
			// entry in it.
			if catalog == nil {
				return meals.Recipe{}, ErrUnknownIngredient
			}
			ingredient, found := catalog.Ingredient(id)
			if !found {
				return meals.Recipe{}, ErrUnknownIngredient
			}
			line.IngredientID = &id
			if line.DisplayName == nil {
				name := ingredient.DisplayName
				line.DisplayName = &name
			}
			line.MissingInformation = nil
		}
	}

	patched.MissingInformation = prunePatchedNotes(patched)
	return patched, nil
}

// prunePatchedNotes clears the notes that resolution is authoritative for, so
// it can restate them from what is now true.
//
// Resolution seeds its note set from whatever it is given, so a note left here
// survives the correction that made it false — the recipe would stay
// unplannable forever because of a gap the reviewer had already closed.
// Categories resolution does not recompute (the extractor's notes about times
// or steps, say) are kept: nothing downstream would restate those.
func prunePatchedNotes(recipe meals.Recipe) []string {
	kept := make([]string, 0, len(recipe.MissingInformation))
	for _, note := range recipe.MissingInformation {
		if resolutionOwnsNote(note) {
			continue
		}
		kept = append(kept, note)
	}
	return kept
}

// resolutionOwnsNote reports whether ResolveAgainstCatalog recomputes this
// note. It covers both vocabularies: the domain's own constants and the
// extraction service's recipe-level "ingredient_quantities".
func resolutionOwnsNote(note string) bool {
	switch {
	case note == meals.MissingServings:
		return true
	case note == "ingredient_quantities":
		return true
	case note == meals.MissingQuantity, strings.HasPrefix(note, meals.MissingQuantity+":"):
		return true
	case note == meals.MissingIngredient, strings.HasPrefix(note, meals.MissingIngredient+":"):
		return true
	}
	return false
}
