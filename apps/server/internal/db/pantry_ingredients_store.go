package db

import (
	"context"
	"strings"
	"time"
)

// PantryResolution is what the pantry contributes to a plan: the canonical
// ingredient ids the generator can credit, and a count of the items it could
// not resolve.
//
// The unresolved count is reported to the user rather than swallowed. Silently
// dropping a pantry item is the failure mode that matters here — it puts an
// ingredient on the shopping list that the user already owns, or, worse, the
// wrong match takes one off a list they needed.
type PantryResolution struct {
	IngredientIDs []string
	// Items held in the pantry that no catalogue row matched.
	UnresolvedCount int
	// Their display names, for the assumption line the user sees. Capped by the
	// caller; the pantry is not a source of unbounded text.
	UnresolvedNames []string
}

// ResolvePantryIngredients pulls what the user already has.
//
// Two things count as a match, and nothing else does:
//
//  1. An explicit ingredient_id, set when the item was linked to the catalogue.
//  2. An exact, case-insensitive match of the item's name to a catalogue
//     display name.
//
// Fuzzy matching is deliberately absent. "Milk" resolving to "coconut milk"
// would credit a household for something they do not have and quietly remove it
// from their shopping list, so an item the catalogue cannot resolve exactly
// stays unresolved and is reported as such.
//
// Items that are used, expired, or past their expiration date are not in the
// pantry any more and are not credited.
func (s *Store) ResolvePantryIngredients(ctx context.Context, userID string, asOf time.Time) (PantryResolution, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT p.name, COALESCE(
			p.ingredient_id,
			(SELECT c.id FROM ingredients c
			 WHERE lower(c.display_name) = lower(btrim(p.name))
			 ORDER BY c.id
			 LIMIT 1))
		FROM pantry_items p
		WHERE p.user_id = $1
		  AND p.status = 'ACTIVE'
		  AND p.expiration_date >= $2::date
		ORDER BY p.name
	`, userID, asOf.UTC())
	if err != nil {
		return PantryResolution{}, err
	}
	defer rows.Close()

	var resolution PantryResolution
	seen := map[string]bool{}
	for rows.Next() {
		var name string
		var ingredientID *string
		if err := rows.Scan(&name, &ingredientID); err != nil {
			return PantryResolution{}, err
		}
		if ingredientID == nil || strings.TrimSpace(*ingredientID) == "" {
			resolution.UnresolvedCount++
			if len(resolution.UnresolvedNames) < maxReportedUnresolved {
				resolution.UnresolvedNames = append(resolution.UnresolvedNames, strings.TrimSpace(name))
			}
			continue
		}
		if seen[*ingredientID] {
			continue
		}
		seen[*ingredientID] = true
		resolution.IngredientIDs = append(resolution.IngredientIDs, *ingredientID)
	}
	return resolution, rows.Err()
}

// A pantry can hold hundreds of items; the assumption line the user reads
// names at most this many of the unmatched ones.
const maxReportedUnresolved = 5

// LinkPantryItemIngredient sets or clears the catalogue row a pantry item
// refers to. Passing nil unlinks, which returns the item to being display text
// the generator does not credit.
func (s *Store) LinkPantryItemIngredient(ctx context.Context, userID string, itemID string, ingredientID *string) (bool, error) {
	tag, err := s.pool.Exec(ctx, `
		UPDATE pantry_items
		SET ingredient_id = $3, updated_at = now()
		WHERE user_id = $1 AND id = $2
	`, userID, itemID, ingredientID)
	if err != nil {
		return false, err
	}
	return tag.RowsAffected() > 0, nil
}
