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
	// AssumeCovered means the caller asserts this ingredient is handled and no
	// quantity is needed — the questionnaire's "I already have rice", which is
	// a statement of intent about the shop rather than a measurement.
	//
	// It is deliberately different from a pantry row with no amount. There the
	// user recorded an item and simply did not say how much, which is not the
	// same as saying "do not buy this", so the requirement stays on the list.
	AssumeCovered bool
}

// Known reports whether this holding carries a usable quantity.
func (h PantryHolding) Known() bool { return h.Amount != nil && *h.Amount > 0 }

// Coverage is what a holding does to one line of a grocery list.
type Coverage int

const (
	// CoverageNone — the user does not have this ingredient at all.
	CoverageNone Coverage = iota
	// CoverageUnknown — they have it, but not how much. The requirement stays
	// on the list at its full quantity, flagged so a shopper knows the pantry
	// may already cover some or all of it. Nothing is assumed to be enough.
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
// Units must be comparable. Two masses convert, two volumes convert, and two
// spellings of the same unit compare directly. Mass against volume does not,
// because it needs a density that depends on the ingredient and that the
// catalogue does not hold — a cup of rice and a cup of oil do not weigh the
// same. An incomparable pair is reported as unknown rather than as a number
// nobody can justify.
func Subtract(neededQty float64, neededUnit string, holding PantryHolding) (remaining float64, coverage Coverage) {
	if holding.IngredientID == "" {
		return neededQty, CoverageNone
	}
	if holding.AssumeCovered {
		return 0, CoverageFull
	}
	if !holding.Known() {
		// They have some of this. How much is not known, so the requirement is
		// kept in full and marked. Zeroing it here would be assuming enough
		// exists, which is the one thing a pantry row without a number cannot
		// tell us.
		return neededQty, CoverageUnknown
	}

	have, want, ok := comparable(*holding.Amount, holding.Unit, neededQty, neededUnit)
	if !ok {
		// They have some of it, in a unit that cannot be lined up with the
		// recipe's. The amount they hold is unusable here, so this is the same
		// state as having no number at all.
		return neededQty, CoverageUnknown
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
	// Volumes convert among themselves: teaspoons, tablespoons, cups, litres.
	haveMl, haveIsVolume := MillilitresFor(haveQty, haveUnit)
	wantMl, wantIsVolume := MillilitresFor(wantQty, wantUnit)
	if haveIsVolume && wantIsVolume {
		return haveMl, wantMl, true
	}
	// One of each is exactly the case that needs a density. Refused.
	if (haveIsMass && wantIsVolume) || (haveIsVolume && wantIsMass) {
		return 0, 0, false
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
	// Report the total in the unit the conversion produced: grams for masses,
	// millilitres for volumes, otherwise whatever a was already stated in.
	unit := a.Unit
	if IsMassUnit(a.Unit) {
		unit = "g"
	} else if IsVolumeUnit(a.Unit) {
		unit = "ml"
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

// HoldingsFromIDs builds holdings from a plain id list, for the callers whose
// input is an assertion that these ingredients are covered rather than a record
// of what is in a cupboard. Presence-only behaviour is preserved exactly.
func HoldingsFromIDs(ids []string) map[string]PantryHolding {
	out := make(map[string]PantryHolding, len(ids))
	for _, id := range ids {
		if strings.TrimSpace(id) == "" {
			continue
		}
		out[id] = PantryHolding{IngredientID: id, AssumeCovered: true}
	}
	return out
}
