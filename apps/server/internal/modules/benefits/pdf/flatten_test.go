package pdf

import (
	"bytes"
	"strings"
	"testing"
)

func approvedAssignments() []Assignment {
	return []Assignment{
		{Ref: "last", Name: "applicantLastName", Type: FieldText, Text: "RIVERA"},
		{Ref: "first", Name: "applicantFirstName", Type: FieldText, Text: "Ana"},
		{Ref: "dob", Name: "dateOfBirth", Type: FieldText, Text: "03/07/1988"},
		{Ref: "heat", Name: "paysHeating", Type: FieldCheckbox, Checked: true},
		{Ref: "power", Name: "paysElectricity", Type: FieldCheckbox, Checked: false},
		{Ref: "citizen", Name: "isCitizen", Type: FieldRadio, Text: "Yes"},
		{Ref: "state", Name: "residenceState", Type: FieldDropdown, Text: "CA"},
		{Ref: "member1", Name: "member1Name", Type: FieldText, Text: "Rivera, Mateo"},
	}
}

func TestFlattenLeavesNoFormBehind(t *testing.T) {
	out, err := Flatten(bytes.NewReader(buildFixture(t)), approvedAssignments(), FlattenOptions{})
	if err != nil {
		t.Fatalf("flatten: %v", err)
	}

	inventory, err := Inspect(bytes.NewReader(out))
	if err != nil {
		t.Fatalf("inspect flattened: %v", err)
	}
	if inventory.HasAcroForm {
		t.Error("a flattened application must not still carry a fillable form")
	}
	if len(inventory.Fields) != 0 {
		t.Errorf("expected no fields left after flattening, got %v", fieldNames(inventory))
	}
	if inventory.PageCount != 2 {
		t.Errorf("flattening must not lose pages: expected 2, got %d", inventory.PageCount)
	}
}

func TestFlattenDrawsTheApprovedValuesOntoThePage(t *testing.T) {
	out, err := Flatten(bytes.NewReader(buildFixture(t)), approvedAssignments(), FlattenOptions{})
	if err != nil {
		t.Fatalf("flatten: %v", err)
	}

	page1 := string(pageContent(t, out, 1))
	for _, want := range []string{"(RIVERA)", "(Ana)", "(03/07/1988)", "(CA)"} {
		if !strings.Contains(page1, want) {
			t.Errorf("page 1 does not contain %s; a value the applicant approved was lost in flattening", want)
		}
	}

	// Second page, so flattening is proven across the whole document.
	page2 := string(pageContent(t, out, 2))
	if !strings.Contains(page2, `(Rivera, Mateo)`) {
		t.Error("page 2 does not carry the household member the applicant approved")
	}
}

func TestFlattenTicksOnlyTheBoxesThatWereTicked(t *testing.T) {
	out, err := Flatten(bytes.NewReader(buildFixture(t)), approvedAssignments(), FlattenOptions{})
	if err != nil {
		t.Fatalf("flatten: %v", err)
	}

	page1 := string(pageContent(t, out, 1))
	ticks := strings.Count(page1, "("+CheckGlyph+")")
	// One for the heating box, one for the "Yes" citizenship button. The
	// electricity box was answered "no" and must not be marked, and neither
	// must the "No" citizenship button.
	if ticks != 2 {
		t.Fatalf("expected exactly 2 ticks on the flattened page, got %d", ticks)
	}
}

func TestFlattenRefusesToLoseASelectedRadioOption(t *testing.T) {
	// If a radio value matched none of the group's buttons, the answer would
	// silently disappear from the submitted form. That must be an error.
	inventory, err := Inspect(bytes.NewReader(buildFixture(t)))
	if err != nil {
		t.Fatalf("inspect: %v", err)
	}
	_, err = placementsFor(inventory, []Assignment{
		{Ref: "citizen", Name: "isCitizen", Type: FieldRadio, Text: "Maybe"},
	}, FlattenOptions{})
	if err == nil || !strings.Contains(err.Error(), "on state") {
		t.Fatalf("expected an unmatched radio option to be refused, got %v", err)
	}
}

func TestFlattenIsDeterministicInWhatItDraws(t *testing.T) {
	fixture := buildFixture(t)
	first, err := Flatten(bytes.NewReader(fixture), approvedAssignments(), FlattenOptions{})
	if err != nil {
		t.Fatalf("flatten: %v", err)
	}
	second, err := Flatten(bytes.NewReader(fixture), approvedAssignments(), FlattenOptions{})
	if err != nil {
		t.Fatalf("flatten again: %v", err)
	}
	for page := 1; page <= 2; page++ {
		if !bytes.Equal(pageContent(t, first, page), pageContent(t, second, page)) {
			t.Fatalf("page %d flattened differently on a second identical run", page)
		}
	}
}

func TestFlattenedDocumentCannotBeRefilled(t *testing.T) {
	out, err := Flatten(bytes.NewReader(buildFixture(t)), approvedAssignments(), FlattenOptions{})
	if err != nil {
		t.Fatalf("flatten: %v", err)
	}
	// The point of flattening: what the applicant approved is now page content,
	// not editable form data.
	if _, err := Fill(bytes.NewReader(out), []Assignment{
		{Ref: "last", Name: "applicantLastName", Type: FieldText, Text: "SOMEONE ELSE"},
	}); err == nil {
		t.Fatal("a flattened application must not accept new form values")
	}
}

// A dropdown's box is taller than a text rule on the same line, and letting
// the font size follow the box would print one answer far larger than the
// answers beside it. A flattened application should read as one document.
func TestFlattenedTextSizeStaysConsistentAcrossFieldHeights(t *testing.T) {
	shortBox := fittedSize(Rect{W: 100, H: 12})
	tallBox := fittedSize(Rect{W: 100, H: 21.6})
	hugeBox := fittedSize(Rect{W: 100, H: 60})

	if shortBox < 7 || hugeBox > 10 {
		t.Fatalf("sizes should stay within 7-10pt, got %.2f and %.2f", shortBox, hugeBox)
	}
	if tallBox-shortBox > 3 {
		t.Fatalf("a taller box should not print a much larger answer: %.2f vs %.2f", tallBox, shortBox)
	}
}
