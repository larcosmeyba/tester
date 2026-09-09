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

func TestUnknownQuantityIsUnknownNotEnough(t *testing.T) {
	// The common case: someone typed "a bag of rice". They have some. How much
	// is genuinely not known, and the plan has to say so rather than pick.
	remaining, coverage := Subtract(2, "cup", holding("rice", nil, ""))
	if coverage != CoverageUnknown {
		t.Fatalf("coverage = %v, want CoverageUnknown", coverage)
	}
	if remaining != 0 {
		t.Errorf("remaining = %v, want 0: it is covered, but only as far as anyone knows", remaining)
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
		if remaining != 0 {
			t.Errorf("have %s / need %s: remaining = %v, want 0", c.haveUnit, c.needUnit, remaining)
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
	if !got.Known() || *got.Amount != 3 {
		t.Fatalf("merged = %+v, want 3 cups", got)
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
	}
	ids := PantryIDs(holdings)
	if !ids["rice"] || !ids["beans"] || len(ids) != 2 {
		t.Fatalf("PantryIDs = %v, want rice and beans", ids)
	}
}
