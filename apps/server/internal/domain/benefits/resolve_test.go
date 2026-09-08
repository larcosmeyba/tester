package benefits

import (
	"strings"
	"testing"
	"time"
)

func mustSet(t *testing.T, p *Profile, path FieldPath, v Value) {
	t.Helper()
	if err := p.Set(path, v); err != nil {
		t.Fatalf("set %s: %v", path, err)
	}
}

func textMapping(fields ...FieldMapping) *FormMapping {
	return &FormMapping{
		SchemaVersion:     MappingSchemaVersion,
		ID:                "test-form",
		Program:           "SNAP",
		FormVersion:       "2026.01",
		Revision:          1,
		VocabularyVersion: VocabularyVersion,
		Template:          TemplateRef{Kind: TemplateAcroForm, File: "t.pdf", SHA256: strings.Repeat("a", 64), PageCount: 2},
		Fields:            fields,
	}
}

func TestUnansweredFieldIsMissingNeverGuessed(t *testing.T) {
	profile := NewProfile("u1")
	mapping := textMapping(FieldMapping{
		ID:       "last",
		Target:   Target{Type: TargetText, Name: "LastName"},
		Source:   SourceRef{FieldPath: "applicant.last_name"},
		Strength: Required,
	})

	got := Resolve(profile, mapping)

	if len(got.Filled) != 0 {
		t.Fatalf("an unanswered field must never be filled, got %+v", got.Filled)
	}
	if len(got.Missing) != 1 || got.Missing[0].FieldPath != "applicant.last_name" {
		t.Fatalf("expected one missing field for the last name, got %+v", got.Missing)
	}
	if got.Missing[0].Strength != Required {
		t.Fatalf("expected the missing field to be required, got %q", got.Missing[0].Strength)
	}
	if !got.NeedsInput() || got.Ready() {
		t.Fatal("a form with a required unknown must need input and must not be ready")
	}
	if got.Missing[0].Question == "" {
		t.Fatal("a missing field must carry the question the app should ask")
	}
}

// The distinction this whole package exists for: zero income and unknown
// income must not produce the same form.
func TestZeroIncomeAndUnknownIncomeDiffer(t *testing.T) {
	mapping := textMapping(FieldMapping{
		ID:         "income",
		Target:     Target{Type: TargetText, Name: "MonthlyIncome"},
		Source:     SourceRef{FieldPath: "income.monthly_gross_total"},
		Transforms: []Transform{{Op: OpMoney, Style: "plain"}},
		Strength:   Required,
	})

	unknown := Resolve(NewProfile("u1"), mapping)
	if len(unknown.Filled) != 0 {
		t.Fatalf("unknown income must leave the box empty, got %+v", unknown.Filled)
	}

	declared := NewProfile("u2")
	mustSet(t, declared, "income.has_no_income", Bool(true, SourceUser))
	zero := Resolve(declared, mapping)

	if len(zero.Filled) != 1 || zero.Filled[0].Text != "0.00" {
		t.Fatalf("a declared absence of income must write 0.00, got %+v", zero.Filled)
	}
	if zero.Filled[0].Source != SourceDerived {
		t.Fatalf("a computed total must be recorded as derived, got %q", zero.Filled[0].Source)
	}
}

func TestDerivedIncomeStaysUnknownWhenASourceIsIncomplete(t *testing.T) {
	profile := NewProfile("u1")
	complete := NewGroupRow("s1")
	complete.Values["income.sources[].gross_amount"] = Money(50000, SourceUser)
	complete.Values["income.sources[].frequency"] = Choice("weekly", SourceUser)

	partial := NewGroupRow("s2")
	partial.Values["income.sources[].gross_amount"] = Money(20000, SourceUser)
	// No frequency: we cannot know what this is worth per month.

	if err := profile.SetGroup("income.sources", []GroupRow{complete, partial}); err != nil {
		t.Fatalf("set group: %v", err)
	}

	if _, ok := profile.Flatten()["income.monthly_gross_total"]; ok {
		t.Fatal("a total must not be computed from an incomplete set of sources")
	}
}

func TestDerivedIncomeNormalisesFrequencies(t *testing.T) {
	profile := NewProfile("u1")
	weekly := NewGroupRow("s1")
	weekly.Values["income.sources[].gross_amount"] = Money(10000, SourceUser) // $100.00/week
	weekly.Values["income.sources[].frequency"] = Choice("weekly", SourceUser)
	monthly := NewGroupRow("s2")
	monthly.Values["income.sources[].gross_amount"] = Money(25000, SourceUser) // $250.00/month
	monthly.Values["income.sources[].frequency"] = Choice("monthly", SourceUser)

	if err := profile.SetGroup("income.sources", []GroupRow{weekly, monthly}); err != nil {
		t.Fatalf("set group: %v", err)
	}

	total, ok := profile.Flatten()["income.monthly_gross_total"].MoneyValue()
	if !ok {
		t.Fatal("expected a computed monthly total")
	}
	// 10000 * 52 / 12 = 43333.33 -> 43333, plus 25000.
	if total != 68333 {
		t.Fatalf("expected 68333 cents, got %d", total)
	}
}

func TestEmptyGroupIsOnlyZeroWhenTheUserSaidSo(t *testing.T) {
	notAsked := NewProfile("u1")
	if _, ok := notAsked.Flatten()["expenses.childcare_monthly_total"]; ok {
		t.Fatal("an uncollected group must not produce a total")
	}

	declaredNone := NewProfile("u2")
	if err := declaredNone.SetGroup("expenses.childcare", nil); err != nil {
		t.Fatalf("set group: %v", err)
	}
	total, ok := declaredNone.Flatten()["expenses.childcare_monthly_total"].MoneyValue()
	if !ok || total != 0 {
		t.Fatalf("a declared absence of childcare must total zero, got %d ok=%v", total, ok)
	}
}

func TestUnfilledRowSlotIsSkippedNotMissing(t *testing.T) {
	profile := NewProfile("u1")
	member := NewGroupRow("m1")
	member.Values["household.members[].last_name"] = Text("Rivera", SourceUser)
	if err := profile.SetGroup("household.members", []GroupRow{member}); err != nil {
		t.Fatalf("set group: %v", err)
	}

	mapping := textMapping(
		FieldMapping{
			ID: "hh1", Target: Target{Type: TargetText, Name: "HH1"},
			Source: SourceRef{FieldPath: "household.members[].last_name"},
			Repeat: &Repeat{Over: "household.members", Index: 0}, Strength: Required,
		},
		FieldMapping{
			ID: "hh2", Target: Target{Type: TargetText, Name: "HH2"},
			Source: SourceRef{FieldPath: "household.members[].last_name"},
			Repeat: &Repeat{Over: "household.members", Index: 1}, Strength: Required,
		},
	)

	got := Resolve(profile, mapping)

	if len(got.Filled) != 1 || got.Filled[0].FieldID != "hh1" {
		t.Fatalf("expected only the first member row filled, got %+v", got.Filled)
	}
	if len(got.Missing) != 0 {
		t.Fatalf("a spare row on the form is not a missing answer, got %+v", got.Missing)
	}
	if len(got.Skipped) != 1 || got.Skipped[0].Reason != SkipNotApplicable {
		t.Fatalf("expected the spare row to be skipped as not applicable, got %+v", got.Skipped)
	}
}

func TestUncollectedGroupAsksAboutTheGroup(t *testing.T) {
	mapping := textMapping(FieldMapping{
		ID: "hh1", Target: Target{Type: TargetText, Name: "HH1"},
		Source: SourceRef{FieldPath: "household.members[].last_name"},
		Repeat: &Repeat{Over: "household.members", Index: 0}, Strength: Required,
	})

	got := Resolve(NewProfile("u1"), mapping)

	if len(got.Missing) != 1 || got.Missing[0].FieldPath != "household.members" {
		t.Fatalf("expected the question to be about the roster itself, got %+v", got.Missing)
	}
}

func TestFillPolicyNeverLeavesSignaturesAlone(t *testing.T) {
	profile := NewProfile("u1")
	mustSet(t, profile, "applicant.last_name", Text("Rivera", SourceUser))

	mapping := textMapping(FieldMapping{
		ID:         "signature_date",
		Target:     Target{Type: TargetText, Name: "SigDate"},
		FillPolicy: FillNever,
		Note:       "Signed and dated by the applicant.",
	})

	got := Resolve(profile, mapping)

	if len(got.Filled) != 0 {
		t.Fatalf("a never-fill field must stay empty, got %+v", got.Filled)
	}
	if len(got.Missing) != 0 {
		t.Fatalf("a never-fill field is not a question for the user, got %+v", got.Missing)
	}
	if len(got.Skipped) != 1 || got.Skipped[0].Reason != SkipPolicy {
		t.Fatalf("expected the signature date to be skipped by policy, got %+v", got.Skipped)
	}
	if !got.Ready() {
		t.Fatal("a form whose only blank is a signature should still be approvable")
	}
}

func TestRequirementIsWaivedByItsCondition(t *testing.T) {
	mapping := textMapping(FieldMapping{
		ID: "street", Target: Target{Type: TargetText, Name: "Street"},
		Source: SourceRef{FieldPath: "address.residential.street1"},
	})
	mapping.Requirements = []Requirement{{
		FieldPath: "address.residential.street1",
		Strength:  Required,
		Unless:    &Condition{FieldPath: "address.residential.is_homeless", Equals: true},
	}}

	withAddress := Resolve(NewProfile("u1"), mapping)
	if !withAddress.NeedsInput() {
		t.Fatal("a required street address must be asked for when nothing waives it")
	}

	homeless := NewProfile("u2")
	mustSet(t, homeless, "address.residential.is_homeless", Bool(true, SourceUser))
	waived := Resolve(homeless, mapping)
	if waived.NeedsInput() {
		t.Fatalf("an applicant with no permanent address must not be blocked on a street, got %+v", waived.Missing)
	}
}

func TestValueMapGapBecomesAProblemNotAGuess(t *testing.T) {
	profile := NewProfile("u1")
	mustSet(t, profile, "housing.status", Choice("shelter", SourceUser))

	mapping := textMapping(FieldMapping{
		ID:       "rents",
		Target:   Target{Type: TargetCheckbox, Name: "Rents"},
		Source:   SourceRef{FieldPath: "housing.status"},
		ValueMap: map[string]string{"rent": "true", "own": "false"},
	})

	got := Resolve(profile, mapping)

	if len(got.Filled) != 0 {
		t.Fatalf("an uncovered answer must not tick a box, got %+v", got.Filled)
	}
	if len(got.Problems) != 1 {
		t.Fatalf("expected one problem, got %+v", got.Problems)
	}
	if got.Ready() {
		t.Fatal("a form with a problem must not be approvable")
	}
}

func TestCheckboxReadsBooleanAndDeclaredNone(t *testing.T) {
	mapping := textMapping(FieldMapping{
		ID:     "heat",
		Target: Target{Type: TargetCheckbox, Name: "PaysHeat"},
		Source: SourceRef{FieldPath: "utilities.pays_heating_cooling"},
	})

	yes := NewProfile("u1")
	mustSet(t, yes, "utilities.pays_heating_cooling", Bool(true, SourceUser))
	if got := Resolve(yes, mapping); len(got.Filled) != 1 || !got.Filled[0].Checked {
		t.Fatalf("expected the box ticked, got %+v", got.Filled)
	}

	none := NewProfile("u2")
	mustSet(t, none, "utilities.pays_heating_cooling", None(KindBoolean, SourceUser))
	got := Resolve(none, mapping)
	if len(got.Filled) != 1 || got.Filled[0].Checked {
		t.Fatalf("a declared none must leave the box unticked but answered, got %+v", got.Filled)
	}
	if len(got.Missing) != 0 {
		t.Fatalf("a declared none is an answer, not a question, got %+v", got.Missing)
	}
}

func TestRefusedAnswerIsNeverWritten(t *testing.T) {
	profile := NewProfile("u1")
	mustSet(t, profile, "applicant.ssn", Refused(KindText))

	mapping := textMapping(FieldMapping{
		ID: "ssn", Target: Target{Type: TargetText, Name: "SSN"},
		Source: SourceRef{FieldPath: "applicant.ssn"}, Strength: Required,
	})

	got := Resolve(profile, mapping)
	if len(got.Filled) != 0 {
		t.Fatalf("a refused answer must never reach the form, got %+v", got.Filled)
	}
	if len(got.Missing) != 1 {
		t.Fatalf("a refused answer still leaves the box outstanding, got %+v", got.Missing)
	}
}

func TestOneQuestionIsAskedOncePerPathNotPerBox(t *testing.T) {
	mapping := textMapping(
		FieldMapping{ID: "p1", Target: Target{Type: TargetText, Name: "LastP1"},
			Source: SourceRef{FieldPath: "applicant.last_name"}, Strength: Required},
		FieldMapping{ID: "p2", Target: Target{Type: TargetText, Name: "LastP2"},
			Source: SourceRef{FieldPath: "applicant.last_name"}, Strength: Preferred},
	)

	got := Resolve(NewProfile("u1"), mapping)

	if len(got.Missing) != 1 {
		t.Fatalf("expected the last name asked once, got %+v", got.Missing)
	}
	if got.Missing[0].Strength != Required {
		t.Fatal("the strongest requirement across boxes must win")
	}
	if len(got.Missing[0].FormFieldIDs) != 2 {
		t.Fatalf("expected both boxes recorded against the question, got %+v", got.Missing[0].FormFieldIDs)
	}
}

func TestSensitiveAnswersAreFlaggedButStillFilled(t *testing.T) {
	profile := NewProfile("u1")
	mustSet(t, profile, "applicant.ssn", Text("123456789", SourceUser))

	mapping := textMapping(FieldMapping{
		ID: "ssn", Target: Target{Type: TargetText, Name: "SSN"},
		Source: SourceRef{FieldPath: "applicant.ssn"}, Strength: Required,
		Transforms: []Transform{{Op: OpSSN, Style: "full"}},
	})

	got := Resolve(profile, mapping)
	if len(got.Filled) != 1 || got.Filled[0].Text != "123-45-6789" {
		t.Fatalf("expected a formatted SSN on the form, got %+v", got.Filled)
	}
	if !got.Filled[0].Sensitive {
		t.Fatal("an SSN must be flagged sensitive so listings mask it")
	}
}

func TestConstantIsRecordedAsAMappingConstant(t *testing.T) {
	state := "CA"
	mapping := textMapping(FieldMapping{
		ID: "state", Target: Target{Type: TargetText, Name: "FormState"},
		Source: SourceRef{Constant: &state},
	})

	got := Resolve(NewProfile("u1"), mapping)
	if len(got.Filled) != 1 || got.Filled[0].Text != "CA" {
		t.Fatalf("expected the constant written, got %+v", got.Filled)
	}
	if got.Filled[0].Source != SourceMappingConstant {
		t.Fatalf("a constant must never look like something the applicant said, got %q", got.Filled[0].Source)
	}
}

func TestTransformFailureIsReportedNotSwallowed(t *testing.T) {
	profile := NewProfile("u1")
	mustSet(t, profile, "contact.phone_primary", Text("555-12", SourceUser))

	mapping := textMapping(FieldMapping{
		ID: "phone", Target: Target{Type: TargetText, Name: "Phone"},
		Source:     SourceRef{FieldPath: "contact.phone_primary"},
		Transforms: []Transform{{Op: OpPhone, Style: "dashed"}},
	})

	got := Resolve(profile, mapping)
	if len(got.Filled) != 0 || len(got.Problems) != 1 {
		t.Fatalf("a phone number that will not format must be reported, got filled=%+v problems=%+v", got.Filled, got.Problems)
	}
}

func TestDateTransformUsesTheFormsLayout(t *testing.T) {
	profile := NewProfile("u1")
	mustSet(t, profile, "applicant.date_of_birth", Date(time.Date(1988, 3, 7, 0, 0, 0, 0, time.UTC), SourceUser))

	mapping := textMapping(FieldMapping{
		ID: "dob", Target: Target{Type: TargetText, Name: "DOB"},
		Source:     SourceRef{FieldPath: "applicant.date_of_birth"},
		Transforms: []Transform{{Op: OpDate, Layout: "01/02/2006"}},
	})

	got := Resolve(profile, mapping)
	if len(got.Filled) != 1 || got.Filled[0].Text != "03/07/1988" {
		t.Fatalf("expected 03/07/1988, got %+v", got.Filled)
	}
}

func TestJoinTransformReadsTheSameGroupRow(t *testing.T) {
	profile := NewProfile("u1")
	first := NewGroupRow("m1")
	first.Values["household.members[].first_name"] = Text("Mateo", SourceUser)
	first.Values["household.members[].last_name"] = Text("Rivera", SourceUser)
	second := NewGroupRow("m2")
	second.Values["household.members[].first_name"] = Text("Lucia", SourceUser)
	second.Values["household.members[].last_name"] = Text("Rivera", SourceUser)
	if err := profile.SetGroup("household.members", []GroupRow{first, second}); err != nil {
		t.Fatalf("set group: %v", err)
	}

	mapping := textMapping(
		FieldMapping{ID: "m1", Target: Target{Type: TargetText, Name: "M1"},
			Source:     SourceRef{FieldPath: "household.members[].last_name"},
			Repeat:     &Repeat{Over: "household.members", Index: 0},
			Transforms: []Transform{{Op: OpJoin, With: "household.members[].first_name", Sep: ", "}}},
		FieldMapping{ID: "m2", Target: Target{Type: TargetText, Name: "M2"},
			Source:     SourceRef{FieldPath: "household.members[].last_name"},
			Repeat:     &Repeat{Over: "household.members", Index: 1},
			Transforms: []Transform{{Op: OpJoin, With: "household.members[].first_name", Sep: ", "}}},
	)

	got := Resolve(profile, mapping)
	if len(got.Filled) != 2 {
		t.Fatalf("expected both rows filled, got %+v", got.Filled)
	}
	// Row two must not borrow row one's first name.
	if got.Filled[0].Text != "Rivera, Mateo" || got.Filled[1].Text != "Rivera, Lucia" {
		t.Fatalf("a join crossed rows: %q and %q", got.Filled[0].Text, got.Filled[1].Text)
	}
}
