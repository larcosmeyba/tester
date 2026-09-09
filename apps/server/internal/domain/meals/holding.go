package meals

import "strings"

// What a household actually has, and how much of it.
//
// The pantry link on its own answers "do they have rice?". That is not the
// question a grocery list needs answered. A recipe wanting two cups of rice
// against one cup in the cupboard means buying one cup, not zero — and treating
// the ingredient as covered sends somebody home without dinner.
//
// So a holding carries an optional amount. Optional, because most pantry rows
// have no number: people type "a bag" and mean it. An unknown amount is a real
// state and is kept as one. It is never guessed at, never defaulted to a
// convenient figure, and never quietly treated as "enough".

// PantryHolding is one ingredient a user has on hand.
type PantryHolding struct {
	IngredientID string
	// Amount is nil when the user did not say how much. That is the common case.
	Amount *float64
	Unit   string
	// UseFirst ranks this above other pantry items when a plan is built.
	UseFirst bool
}

// Known reports whether this holding carries a usable quantity.
func (h PantryHolding) Known() bool { return h.Amount != nil && *h.Amount > 0 }

// Coverage is what a holding does to one line of a grocery list.
type Coverage int

const (
	// CoverageNone — the user does not have this ingredient at all.
	CoverageNone Coverage = iota
	// CoverageUnknown — they have it, but not how much. The line is treated as
	// covered, and the plan says so out loud so a shopper can check.
	CoverageUnknown
	// CoveragePartial — they have some. The remainder has to be bought.
	CoveragePartial
	// CoverageFull — they have at least as much as the recipes need.
	CoverageFull
)

// Subtract works out how much of a needed quantity a holding covers.
//
// It returns the amount still to buy and which kind of coverage produced it.
//
// Units must be comparable. Two mass units convert (GramsFor knows what a pound
// weighs); two identical units compare directly; anything else — cups against
// grams, "bag" against anything — does not, because converting it would need a
// density the catalogue does not hold. An incomparable pair is reported as
// unknown rather than as a number nobody can justify.
func Subtract(neededQty float64, neededUnit string, holding PantryHolding) (remaining float64, coverage Coverage) {
	if holding.IngredientID == "" {
		return neededQty, CoverageNone
	}
	if !holding.Known() {
		return 0, CoverageUnknown
	}

	have, want, ok := comparable(*holding.Amount, holding.Unit, neededQty, neededUnit)
	if !ok {
		// They have some of it; the units cannot be lined up. Saying "buy the
		// full amount" would over-buy and saying "buy nothing" would under-buy.
		// Unknown is the only honest answer.
		return 0, CoverageUnknown
	}
	if have >= want {
		return 0, CoverageFull
	}
	// Back into the unit the line is stated in, so the shopper reads a quantity
	// that matches the recipe rather than a converted one.
	shortfallRatio := (want - have) / want
	return neededQty * shortfallRatio, CoveragePartial
}

// comparable puts two quantities into the same unit, or reports that it cannot.
func comparable(haveQty float64, haveUnit string, wantQty float64, wantUnit string) (have, want float64, ok bool) {
	haveGrams, haveIsMass := GramsFor(haveQty, haveUnit)
	wantGrams, wantIsMass := GramsFor(wantQty, wantUnit)
	if haveIsMass && wantIsMass {
		return haveGrams, wantGrams, true
	}
	// The same unit, however it was spelled: "2 cups" against "1 cup".
	haveKey, wantKey := comparableUnitKey(haveUnit), comparableUnitKey(wantUnit)
	if haveKey == wantKey {
		// Covers both a shared named unit and a bare count on both sides —
		// "3" eggs against "2" eggs.
		return haveQty, wantQty, true
	}
	return 0, 0, false
}

// comparableUnitKey is a comparison key for units that are not masses.
//
// It singularises, so "cup" and "cups" are one unit. It is deliberately
// separate from normalizeUnit, which backs the mass table and lists its plurals
// explicitly — widening that would change what converts to grams.
func comparableUnitKey(unit string) string {
	key := normalizeUnit(unit)
	if len(key) > 2 && strings.HasSuffix(key, "s") {
		return strings.TrimSuffix(key, "s")
	}
	return key
}

// HoldingsByIngredient indexes holdings for lookup, keeping the most useful one
// per ingredient: a known quantity beats an unknown one, and among known
// quantities the larger wins, because that is what the household actually has
// across however many jars it is spread over.
func HoldingsByIngredient(holdings []PantryHolding) map[string]PantryHolding {
	out := make(map[string]PantryHolding, len(holdings))
	for _, holding := range holdings {
		if holding.IngredientID == "" {
			continue
		}
		existing, seen := out[holding.IngredientID]
		if !seen {
			out[holding.IngredientID] = holding
			continue
		}
		out[holding.IngredientID] = merge(existing, holding)
	}
	return out
}

// merge combines two rows of the same ingredient. Amounts add up only when the
// units line up; otherwise the total is unknowable and is reported as unknown
// rather than as one of the two numbers.
func merge(a, b PantryHolding) PantryHolding {
	useFirst := a.UseFirst || b.UseFirst
	switch {
	case !a.Known() && !b.Known():
		return PantryHolding{IngredientID: a.IngredientID, UseFirst: useFirst}
	case a.Known() && !b.Known():
		// One jar is measured and another is not. The total is at least the
		// measured one but could be more, and pretending otherwise would
		// under-buy. Unknown.
		return PantryHolding{IngredientID: a.IngredientID, UseFirst: useFirst}
	case !a.Known() && b.Known():
		return PantryHolding{IngredientID: a.IngredientID, UseFirst: useFirst}
	}

	haveA, haveB, ok := comparable(*a.Amount, a.Unit, *b.Amount, b.Unit)
	if !ok {
		return PantryHolding{IngredientID: a.IngredientID, UseFirst: useFirst}
	}
	total := haveA + haveB
	// Report the total in a's unit. When both were masses the sum is in grams,
	// so say grams.
	unit := a.Unit
	if _, isMass := GramsFor(*a.Amount, a.Unit); isMass {
		unit = "g"
	}
	return PantryHolding{IngredientID: a.IngredientID, Amount: &total, Unit: unit, UseFirst: useFirst}
}

// PantryIDs is the presence-only view, for the paths that only need to know
// whether an ingredient is owned at all.
func PantryIDs(holdings map[string]PantryHolding) map[string]bool {
	out := make(map[string]bool, len(holdings))
	for id := range holdings {
		out[id] = true
	}
	return out
}

// HoldingsFromIDs builds unknown-quantity holdings from a plain id list, so the
// presence-only callers keep working exactly as they did.
func HoldingsFromIDs(ids []string) map[string]PantryHolding {
	out := make(map[string]PantryHolding, len(ids))
	for _, id := range ids {
		if strings.TrimSpace(id) == "" {
			continue
		}
		out[id] = PantryHolding{IngredientID: id}
	}
	return out
}
