package meals

import "testing"

func amount(v float64) *float64 { return &v }

func holding(id string, qty *float64, unit string) PantryHolding {
	return PantryHolding{IngredientID: id, Amount: qty, Unit: unit}
}

func TestNoHoldingMeansBuyTheLot(t *testing.T) {
	remaining, coverage := Subtract(2, "cup", PantryHolding{})
	if coverage != CoverageNone || remaining != 2 {
		t.Fatalf("Subtract(no holding) = %v/%v, want 2/CoverageNone", remaining, coverage)
	}
}

func TestUnknownQuantityKeepsTheFullRequirement(t *testing.T) {
	// The common case: someone typed "a bag of rice". They have some. How much
	// is genuinely not known — and an unmeasured jar is not evidence of enough,
	// so the requirement stays in full and is flagged.
	remaining, coverage := Subtract(2, "cup", holding("rice", nil, ""))
	if coverage != CoverageUnknown {
		t.Fatalf("coverage = %v, want CoverageUnknown", coverage)
	}
	if remaining != 2 {
		t.Errorf("remaining = %v, want the full 2: nothing here says there is enough", remaining)
	}
}

// An explicit assertion that an ingredient is handled is a different statement
// from a pantry row with no number, and keeps its old meaning.
func TestAssertedCoverageStillBuysNothing(t *testing.T) {
	remaining, coverage := Subtract(2, "cup", PantryHolding{IngredientID: "rice", AssumeCovered: true})
	if coverage != CoverageFull || remaining != 0 {
		t.Fatalf("Subtract(asserted) = %v/%v, want 0/CoverageFull", remaining, coverage)
	}
}

func TestEnoughOnHandCoversTheLine(t *testing.T) {
	remaining, coverage := Subtract(2, "cup", holding("rice", amount(3), "cup"))
	if coverage != CoverageFull || remaining != 0 {
		t.Fatalf("Subtract = %v/%v, want 0/CoverageFull", remaining, coverage)
	}
}

// The example from the brief.
func TestPartialCoverageBuysOnlyTheShortfall(t *testing.T) {
	remaining, coverage := Subtract(2, "cup", holding("rice", amount(1), "cup"))
	if coverage != CoveragePartial {
		t.Fatalf("coverage = %v, want CoveragePartial", coverage)
	}
	if remaining != 1 {
		t.Fatalf("remaining = %v, want 1 cup — 2 needed, 1 owned", remaining)
	}
}

func TestMassUnitsConvertBeforeSubtracting(t *testing.T) {
	// One pound on hand, 900g needed: 453.6g covers just over half.
	remaining, coverage := Subtract(900, "g", holding("flour", amount(1), "lb"))
	if coverage != CoveragePartial {
		t.Fatalf("coverage = %v, want CoveragePartial", coverage)
	}
	if remaining <= 400 || remaining >= 500 {
		t.Fatalf("remaining = %v g, want roughly 446 (900 - 453.6)", remaining)
	}
}

func TestMassUnitsCanCoverFully(t *testing.T) {
	_, coverage := Subtract(400, "g", holding("flour", amount(1), "lb"))
	if coverage != CoverageFull {
		t.Fatalf("coverage = %v, want CoverageFull: a pound exceeds 400g", coverage)
	}
}

// The rule that keeps this honest: no density is ever invented.
func TestIncomparableUnitsAreUnknownNotConverted(t *testing.T) {
	for _, c := range []struct{ haveUnit, needUnit string }{
		{"cup", "g"},
		{"g", "cup"},
		{"bag", "cup"},
		{"cup", "bag"},
	} {
		remaining, coverage := Subtract(2, c.needUnit, holding("x", amount(1), c.haveUnit))
		if coverage != CoverageUnknown {
			t.Errorf("have %s / need %s: coverage = %v, want CoverageUnknown — converting would need a density nobody has",
				c.haveUnit, c.needUnit, coverage)
		}
		if remaining != 2 {
			t.Errorf("have %s / need %s: remaining = %v, want the full 2", c.haveUnit, c.needUnit, remaining)
		}
	}
}

func TestBareCountsCompare(t *testing.T) {
	remaining, coverage := Subtract(3, "", holding("egg", amount(2), ""))
	if coverage != CoveragePartial || remaining != 1 {
		t.Fatalf("Subtract = %v/%v, want 1/CoveragePartial", remaining, coverage)
	}
}

func TestUnitSpellingDoesNotMatter(t *testing.T) {
	remaining, coverage := Subtract(2, "cups", holding("rice", amount(3), "cup"))
	if coverage != CoverageFull || remaining != 0 {
		t.Fatalf("Subtract(cups vs cup) = %v/%v, want 0/CoverageFull", remaining, coverage)
	}
}

func TestZeroOnHandIsNotAHolding(t *testing.T) {
	_, coverage := Subtract(2, "cup", holding("rice", amount(0), "cup"))
	if coverage != CoverageUnknown {
		t.Fatalf("coverage = %v, want CoverageUnknown: zero is not a usable amount", coverage)
	}
}

func TestMergingTwoMeasuredJarsAddsThemUp(t *testing.T) {
	merged := HoldingsByIngredient([]PantryHolding{
		holding("rice", amount(1), "cup"),
		holding("rice", amount(2), "cup"),
	})
	got := merged["rice"]
	if !got.Known() {
		t.Fatalf("merged = %+v, want a known total", got)
	}
	// Volumes are summed in millilitres, so three cups comes back as ~709 ml.
	threeCups, _ := MillilitresFor(3, "cup")
	if got.Unit != "ml" || *got.Amount != threeCups {
		t.Fatalf("merged = %+v, want %v ml (three cups)", got, threeCups)
	}
}

func TestMergingAMeasuredAndAnUnmeasuredJarIsUnknown(t *testing.T) {
	// One jar says 1 cup, the other says nothing. The total is at least a cup
	// and possibly much more; claiming "1 cup" would under-buy.
	merged := HoldingsByIngredient([]PantryHolding{
		holding("rice", amount(1), "cup"),
		holding("rice", nil, ""),
	})
	if merged["rice"].Known() {
		t.Fatalf("merged = %+v, want an unknown total", merged["rice"])
	}
}

func TestMergingIncomparableUnitsIsUnknown(t *testing.T) {
	merged := HoldingsByIngredient([]PantryHolding{
		holding("rice", amount(1), "cup"),
		holding("rice", amount(500), "g"),
	})
	if merged["rice"].Known() {
		t.Fatalf("merged = %+v, want unknown: cups and grams do not add up without a density", merged["rice"])
	}
}

func TestMergingKeepsUseFirst(t *testing.T) {
	merged := HoldingsByIngredient([]PantryHolding{
		{IngredientID: "rice", Amount: amount(1), Unit: "cup"},
		{IngredientID: "rice", Amount: amount(1), Unit: "cup", UseFirst: true},
	})
	if !merged["rice"].UseFirst {
		t.Error("use-first was lost when two rows of the same ingredient merged")
	}
}

func TestPresenceViewsRoundTrip(t *testing.T) {
	holdings := HoldingsFromIDs([]string{"rice", "beans", "", "  "})
	if len(holdings) != 2 {
		t.Fatalf("HoldingsFromIDs = %v, want the two real ids", holdings)
	}
	for _, h := range holdings {
		if h.Known() {
			t.Errorf("holding %+v should carry no quantity", h)
		}
		if !h.AssumeCovered {
			t.Errorf("holding %+v should be an assertion of coverage, not an unmeasured row", h)
		}
	}
	ids := PantryIDs(holdings)
	if !ids["rice"] || !ids["beans"] || len(ids) != 2 {
		t.Fatalf("PantryIDs = %v, want rice and beans", ids)
	}
}

// Volume conversions. These are definitions — three teaspoons make a tablespoon
// everywhere — so they are safe in a way a density never is.
func TestVolumeUnitsConvertAmongThemselves(t *testing.T) {
	cases := []struct {
		name         string
		needQty      float64
		needUnit     string
		haveQty      float64
		haveUnit     string
		wantCoverage Coverage
	}{
		{"tbsp covers tsp", 3, "tsp", 1, "tbsp", CoverageFull},
		{"tsp under-covers tbsp", 1, "tbsp", 1, "tsp", CoveragePartial},
		{"cup covers tbsp", 16, "tbsp", 1, "cup", CoverageFull},
		{"litre covers ml", 500, "ml", 1, "l", CoverageFull},
		{"ml under-covers litre", 1, "l", 500, "ml", CoveragePartial},
		{"quart covers cups", 3, "cup", 1, "quart", CoverageFull},
	}
	for _, c := range cases {
		_, coverage := Subtract(c.needQty, c.needUnit, holding("x", amount(c.haveQty), c.haveUnit))
		if coverage != c.wantCoverage {
			t.Errorf("%s: coverage = %v, want %v", c.name, coverage, c.wantCoverage)
		}
	}
}

func TestVolumeShortfallIsInTheRecipesUnit(t *testing.T) {
	// Needs 2 cups, has 1 cup: buy 1 cup, stated in cups.
	remaining, coverage := Subtract(2, "cups", holding("rice", amount(1), "cup"))
	if coverage != CoveragePartial || remaining != 1 {
		t.Fatalf("Subtract = %v/%v, want 1/CoveragePartial", remaining, coverage)
	}
}

// The line that must never be crossed.
func TestVolumeAndMassNeverConvert(t *testing.T) {
	for _, c := range []struct{ haveUnit, needUnit string }{
		{"cup", "g"}, {"g", "cup"}, {"tbsp", "oz"}, {"lb", "ml"},
	} {
		_, coverage := Subtract(2, c.needUnit, holding("rice", amount(1), c.haveUnit))
		if coverage != CoverageUnknown {
			t.Errorf("have %s / need %s: coverage = %v, want CoverageUnknown — this needs a density the catalogue does not hold",
				c.haveUnit, c.needUnit, coverage)
		}
	}
}

func TestVolumeUnitRecognition(t *testing.T) {
	for _, unit := range []string{"tsp", "tbsp", "cup", "cups", "ml", "l", "quart", "gal", "fl oz"} {
		if !IsVolumeUnit(unit) {
			t.Errorf("IsVolumeUnit(%q) = false, want true", unit)
		}
		if IsMassUnit(unit) {
			t.Errorf("IsMassUnit(%q) = true; a volume is not a mass", unit)
		}
	}
	for _, unit := range []string{"g", "kg", "oz", "lb"} {
		if !IsMassUnit(unit) {
			t.Errorf("IsMassUnit(%q) = false, want true", unit)
		}
		if IsVolumeUnit(unit) {
			t.Errorf("IsVolumeUnit(%q) = true; a mass is not a volume", unit)
		}
	}
	for _, unit := range []string{"bag", "pinch", "clove", ""} {
		if IsVolumeUnit(unit) || IsMassUnit(unit) {
			t.Errorf("%q should convert to neither", unit)
		}
	}
}
