package pdf

import "testing"

// The label finder is what makes a government form mappable when its fields are
// called "Text1 PG 1", so its rules are worth pinning down.

func TestLabelIsTakenFromTheTextLeftOfTheBox(t *testing.T) {
	runs := []TextRun{
		{Text: "Monthly rent", X: 60, Y: 500, Size: 10},
		{Text: "Something far away", X: 20, Y: 300, Size: 10},
	}
	label, placement := LabelFor(runs, Rect{X: 150, Y: 496, W: 100, H: 12})
	if label != "Monthly rent" || placement != "left" {
		t.Fatalf("expected the text on the same line to the left, got %q (%s)", label, placement)
	}
}

func TestLabelFallsBackToTheTextAboveTheBox(t *testing.T) {
	runs := []TextRun{{Text: "ZIP code", X: 150, Y: 516, Size: 10}}
	label, placement := LabelFor(runs, Rect{X: 150, Y: 500, W: 70, H: 12})
	if label != "ZIP code" || placement != "above" {
		t.Fatalf("expected the text directly above, got %q (%s)", label, placement)
	}
}

func TestTheNearestLabelWinsNotTheFirstOnTheLine(t *testing.T) {
	runs := []TextRun{
		{Text: "SECTION 2", X: 20, Y: 500, Size: 10},
		{Text: "City", X: 120, Y: 500, Size: 10},
	}
	label, _ := LabelFor(runs, Rect{X: 150, Y: 496, W: 100, H: 12})
	if label != "City" {
		t.Fatalf("expected the nearest text, got %q", label)
	}
}

func TestALabelSplitAcrossRunsIsStitchedBackTogether(t *testing.T) {
	// Forms routinely emit one label as several runs.
	runs := []TextRun{
		{Text: "Monthly", X: 60, Y: 500, Size: 10},
		{Text: "rent", X: 105, Y: 500, Size: 10},
	}
	label, _ := LabelFor(runs, Rect{X: 130, Y: 496, W: 100, H: 12})
	if label != "Monthly rent" {
		t.Fatalf("expected the pieces joined, got %q", label)
	}
}

func TestNothingCloseEnoughMeansNoLabel(t *testing.T) {
	// Saying nothing beats attaching the wrong label: a mis-labelled box is how
	// somebody's income ends up reviewed as their rent.
	runs := []TextRun{{Text: "Far away", X: 20, Y: 100, Size: 10}}
	if label, _ := LabelFor(runs, Rect{X: 400, Y: 700, W: 80, H: 12}); label != "" {
		t.Fatalf("expected no label, got %q", label)
	}
}

func TestWritingRulesAreNotMistakenForLabels(t *testing.T) {
	// The dots and underscores forms use to draw a writing line sit exactly
	// where a label would.
	runs := []TextRun{
		{Text: "________", X: 120, Y: 500, Size: 10},
		{Text: "Employer", X: 40, Y: 500, Size: 10},
	}
	label, _ := LabelFor(runs, Rect{X: 150, Y: 496, W: 100, H: 12})
	if label != "Employer" {
		t.Fatalf("expected the rule ignored and the real label used, got %q", label)
	}
}

func TestTrailingPunctuationIsTrimmed(t *testing.T) {
	runs := []TextRun{{Text: "Last name:", X: 60, Y: 500, Size: 10}}
	if label, _ := LabelFor(runs, Rect{X: 150, Y: 496, W: 100, H: 12}); label != "Last name" {
		t.Fatalf("expected the colon trimmed, got %q", label)
	}
}
