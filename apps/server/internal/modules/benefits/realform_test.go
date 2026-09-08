package benefits

import (
	"bytes"
	"strings"
	"testing"
	"time"

	domain "github.com/helpthehive/server/internal/domain/benefits"
	"github.com/helpthehive/server/internal/modules/benefits/pdf"
)

// The engine against a real state form.
//
// The synthetic fixture proves the mechanics; this proves the thing that
// actually matters, which is that a real government PDF published by a real
// agency fills correctly. Missouri's SNAP application is 12 pages and 413
// fields, and its roster numbers the applicant as row 0 — the kind of detail no
// invented fixture would have.

func missouriForm(t *testing.T) *Form {
	t.Helper()
	registry, err := LoadRegistry(formsRoot(t))
	if err != nil {
		t.Fatalf("load forms: %v", err)
	}
	form, ok := registry.Current("us-mo-snap-im1ss")
	if !ok {
		t.Skip("the Missouri form is not installed in this tree")
	}
	return form
}

func TestTheMissouriFormFillsFromACompleteProfile(t *testing.T) {
	form := missouriForm(t)
	resolution := domain.Resolve(completeProfile(t), form.Mapping)

	if resolution.NeedsInput() {
		t.Fatalf("a complete profile should satisfy this form: %+v", requiredMissing(resolution))
	}
	if len(resolution.Problems) != 0 {
		t.Fatalf("problems: %+v", resolution.Problems)
	}

	final, err := RenderFinal(form, resolution)
	if err != nil {
		t.Fatalf("render: %v", err)
	}
	if len(final.Problems) != 0 {
		t.Fatalf("render problems: %+v", final.Problems)
	}

	flattened, err := pdf.Inspect(bytes.NewReader(final.Bytes))
	if err != nil {
		t.Fatalf("inspect: %v", err)
	}
	if flattened.HasAcroForm {
		t.Error("the approved Missouri application must be flat")
	}
	if flattened.PageCount != 12 {
		t.Errorf("expected all 12 pages, got %d", flattened.PageCount)
	}
}

// Missouri numbers the applicant as row 0 of its household table and everyone
// else from row 1. Getting that wrong would put a child's date of birth on the
// applicant's line.
func TestTheMissouriRosterPutsTheApplicantInRowZero(t *testing.T) {
	form := missouriForm(t)
	resolution := domain.Resolve(completeProfile(t), form.Mapping)

	byID := map[string]domain.FilledField{}
	for _, filled := range resolution.Filled {
		byID[filled.FieldID] = filled
	}

	if got := byID["hhm0_first"].Text; got != "Ana" {
		t.Errorf("row 0 should carry the applicant, got %q", got)
	}
	if got := byID["hhm1_first"].Text; got != "Mateo" {
		t.Errorf("row 1 should carry the first other household member, got %q", got)
	}
	if got := byID["hhm2_first"].Text; got != "Lucia" {
		t.Errorf("row 2 should carry the second, got %q", got)
	}
	// The household has two other members and the form has nine rows.
	if _, filled := byID["hhm3_first"]; filled {
		t.Error("row 3 should be left blank, not filled with something")
	}
}

func TestTheMissouriFormNeverFillsASignature(t *testing.T) {
	form := missouriForm(t)
	resolution := domain.Resolve(completeProfile(t), form.Mapping)

	skipped := map[string]bool{}
	for _, entry := range resolution.Skipped {
		if entry.Reason == domain.SkipPolicy {
			skipped[entry.FieldID] = true
		}
	}
	for _, id := range []string{"sig_apply", "sig_apply_date", "sig_applicant",
		"sig_applicant_date", "sig_witness", "sig_witness_date"} {
		if !skipped[id] {
			t.Errorf("%s must be left for the applicant", id)
		}
	}
	for _, filled := range resolution.Filled {
		if strings.HasPrefix(filled.FieldID, "sig_") {
			t.Errorf("a signature field was filled: %s", filled.FieldID)
		}
	}
}

func TestTheMissouriValuesLandOnThePage(t *testing.T) {
	form := missouriForm(t)
	resolution := domain.Resolve(completeProfile(t), form.Mapping)
	final, err := RenderFinal(form, resolution)
	if err != nil {
		t.Fatalf("render: %v", err)
	}

	page3 := pageText(t, final.Bytes, 3)
	for _, want := range []string{"(Ana)", "(Rivera)", "(140 Mission Street)", "(Fresno)", "(93701)", "(555-123-4567)"} {
		if !strings.Contains(page3, want) {
			t.Errorf("page 3 is missing %s", want)
		}
	}

	page4 := pageText(t, final.Bytes, 4)
	for _, want := range []string{"(Mateo)", "(Lucia)", "(09/01/2015)", "(123-45-6789)"} {
		if !strings.Contains(page4, want) {
			t.Errorf("page 4 is missing %s", want)
		}
	}
}

// An answer the profile does not have must leave the box empty and be reported,
// on a real form as much as on the fixture.
func TestTheMissouriFormReportsWhatItStillNeeds(t *testing.T) {
	form := missouriForm(t)
	profile := domain.NewProfile("user-mo")
	set(t, profile, "applicant.first_name", domain.Text("Ana", domain.SourceUser))

	resolution := domain.Resolve(profile, form.Mapping)
	if len(resolution.Filled) == 0 {
		t.Fatal("the one answer given should still be filled")
	}
	for _, filled := range resolution.Filled {
		if filled.Text == "" && !filled.Target.Type.IsCheckbox() {
			t.Errorf("%s was filled with nothing", filled.FieldID)
		}
	}
	if !resolution.NeedsInput() {
		t.Fatal("an almost-empty profile must be reported as needing input")
	}
	required := requiredMissing(resolution)
	for _, want := range []domain.FieldPath{"applicant.last_name", "applicant.date_of_birth", "housing.status"} {
		if !containsPath(required, want) {
			t.Errorf("%s should be asked for", want)
		}
	}
}

func TestTheMissouriDateOfBirthUsesTheFormsLayout(t *testing.T) {
	form := missouriForm(t)
	profile := completeProfile(t)
	set(t, profile, "applicant.date_of_birth",
		domain.Date(time.Date(1988, 3, 7, 0, 0, 0, 0, time.UTC), domain.SourceUser))

	for _, filled := range domain.Resolve(profile, form.Mapping).Filled {
		if filled.FieldID == "hhm0_dob" && filled.Text != "03/07/1988" {
			t.Fatalf("expected 03/07/1988, got %q", filled.Text)
		}
	}
}

// Coverage is reported honestly. Missouri's application has hundreds of boxes,
// most of them sections no profile holds — criminal history, school enrolment,
// race and ethnicity — and a mapping that fills identity, address, household,
// income and expenses is doing its job. The applicant is told the proportion
// rather than left to work it out.
func TestTheMissouriFormReportsHowMuchItCovers(t *testing.T) {
	form := missouriForm(t)
	mapped, fillable := form.Coverage()

	if fillable < 300 {
		t.Fatalf("expected a large form, got %d fillable boxes", fillable)
	}
	if mapped == 0 {
		t.Fatal("the mapping covers nothing")
	}
	if mapped > fillable {
		t.Fatalf("coverage cannot exceed the form: %d of %d", mapped, fillable)
	}
	t.Logf("Missouri SNAP: %d of %d fillable boxes mapped (%d%%)", mapped, fillable, 100*mapped/fillable)
}

func TestCoverageIgnoresSignatureFields(t *testing.T) {
	form := missouriForm(t)
	_, fillable := form.Coverage()
	for _, field := range form.Inventory.Fields {
		if field.Type == pdf.FieldSignature {
			// Signature fields are nobody's to fill, so counting them would
			// make every form look permanently incomplete.
			if fillable >= len(form.Inventory.Fields) {
				t.Fatal("signature fields should be excluded from the fillable count")
			}
			return
		}
	}
}
