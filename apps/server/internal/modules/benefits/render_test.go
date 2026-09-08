package benefits

import (
	"bytes"
	"strings"
	"testing"
	"time"

	domain "github.com/helpthehive/server/internal/domain/benefits"
	"github.com/helpthehive/server/internal/modules/benefits/pdf"
)

func sampleForm(t *testing.T) *Form {
	t.Helper()
	registry, err := LoadRegistry(formsRoot(t))
	if err != nil {
		t.Fatalf("load forms: %v", err)
	}
	form, ok := registry.Current("us-xx-snap-hth-sample-1")
	if !ok {
		t.Fatal("the sample form is missing")
	}
	return form
}

func set(t *testing.T, profile *domain.Profile, path domain.FieldPath, value domain.Value) {
	t.Helper()
	if err := profile.Set(path, value); err != nil {
		t.Fatalf("set %s: %v", path, err)
	}
}

// completeProfile is a household that has answered everything the sample form
// requires.
func completeProfile(t *testing.T) *domain.Profile {
	t.Helper()
	profile := domain.NewProfile("user-1")

	set(t, profile, "applicant.first_name", domain.Text("Ana", domain.SourceUser))
	set(t, profile, "applicant.last_name", domain.Text("Rivera", domain.SourceUser))
	set(t, profile, "applicant.middle_name", domain.Text("Sofia", domain.SourceUser))
	set(t, profile, "applicant.date_of_birth", domain.Date(time.Date(1988, 3, 7, 0, 0, 0, 0, time.UTC), domain.SourceUser))
	set(t, profile, "applicant.ssn", domain.Text("123456789", domain.SourceUser))
	set(t, profile, "applicant.is_us_citizen", domain.Bool(true, domain.SourceUser))
	set(t, profile, "contact.phone_primary", domain.Text("5551234567", domain.SourceUser))
	set(t, profile, "contact.email", domain.Text("Ana.Rivera@Example.com", domain.SourceUser))

	set(t, profile, "address.residential.street1", domain.Text("140 Mission Street", domain.SourceUser))
	set(t, profile, "address.residential.street2", domain.Text("Apt 3B", domain.SourceUser))
	set(t, profile, "address.residential.city", domain.Text("Fresno", domain.SourceUser))
	set(t, profile, "address.residential.state", domain.Choice("CA", domain.SourceUser))
	set(t, profile, "address.residential.postal_code", domain.Text("93701", domain.SourceUser))
	set(t, profile, "address.residential.is_homeless", domain.Bool(false, domain.SourceUser))

	set(t, profile, "household.size", domain.Number(3, domain.SourceUser))
	member1 := domain.NewGroupRow("m1")
	member1.Values["household.members[].first_name"] = domain.Text("Mateo", domain.SourceUser)
	member1.Values["household.members[].last_name"] = domain.Text("Rivera", domain.SourceUser)
	member1.Values["household.members[].date_of_birth"] = domain.Date(time.Date(2015, 9, 1, 0, 0, 0, 0, time.UTC), domain.SourceUser)
	member2 := domain.NewGroupRow("m2")
	member2.Values["household.members[].first_name"] = domain.Text("Lucia", domain.SourceUser)
	member2.Values["household.members[].last_name"] = domain.Text("Rivera", domain.SourceUser)
	member2.Values["household.members[].date_of_birth"] = domain.Date(time.Date(2019, 4, 22, 0, 0, 0, 0, time.UTC), domain.SourceUser)
	if err := profile.SetGroup("household.members", []domain.GroupRow{member1, member2}); err != nil {
		t.Fatalf("set members: %v", err)
	}

	set(t, profile, "housing.status", domain.Choice("rent", domain.SourceUser))
	set(t, profile, "housing.rent_monthly", domain.Money(145000, domain.SourceUser))
	set(t, profile, "utilities.monthly_total", domain.Money(21050, domain.SourceUser))
	set(t, profile, "utilities.pays_heating_cooling", domain.Bool(true, domain.SourceUser))
	set(t, profile, "utilities.pays_electricity", domain.Bool(true, domain.SourceUser))

	set(t, profile, "income.has_no_income", domain.Bool(false, domain.SourceUser))
	source := domain.NewGroupRow("i1")
	source.Values["income.sources[].kind"] = domain.Choice("wages", domain.SourceUser)
	source.Values["income.sources[].gross_amount"] = domain.Money(48000, domain.SourceUser)
	source.Values["income.sources[].frequency"] = domain.Choice("weekly", domain.SourceUser)
	if err := profile.SetGroup("income.sources", []domain.GroupRow{source}); err != nil {
		t.Fatalf("set income: %v", err)
	}

	job := domain.NewGroupRow("j1")
	job.Values["employment.jobs[].employer_name"] = domain.Text("Valley Grocery", domain.SourceUser)
	if err := profile.SetGroup("employment.jobs", []domain.GroupRow{job}); err != nil {
		t.Fatalf("set jobs: %v", err)
	}

	return profile
}

func TestACompleteProfileFillsTheSampleFormEndToEnd(t *testing.T) {
	form := sampleForm(t)
	resolution := domain.Resolve(completeProfile(t), form.Mapping)

	if resolution.NeedsInput() {
		t.Fatalf("a complete profile should not still be missing anything required: %+v", requiredMissing(resolution))
	}
	if len(resolution.Problems) != 0 {
		t.Fatalf("unexpected problems: %+v", resolution.Problems)
	}
	if !resolution.Ready() {
		t.Fatal("expected the application to be ready for review")
	}

	draft, err := RenderDraft(form, resolution)
	if err != nil {
		t.Fatalf("render draft: %v", err)
	}
	if len(draft.Problems) != 0 {
		t.Fatalf("draft problems: %+v", draft.Problems)
	}

	// The draft is still fillable, so the applicant can correct it before
	// approving.
	inventory, err := pdf.Inspect(bytes.NewReader(draft.Bytes))
	if err != nil {
		t.Fatalf("inspect draft: %v", err)
	}
	if !inventory.HasAcroForm {
		t.Error("the draft should still be editable by the applicant")
	}

	final, err := RenderFinal(form, resolution)
	if err != nil {
		t.Fatalf("render final: %v", err)
	}
	flattened, err := pdf.Inspect(bytes.NewReader(final.Bytes))
	if err != nil {
		t.Fatalf("inspect final: %v", err)
	}
	if flattened.HasAcroForm {
		t.Error("the approved document must be flat")
	}
	if flattened.PageCount != 2 {
		t.Errorf("expected both pages in the final document, got %d", flattened.PageCount)
	}
}

func TestTheSampleFormCarriesTheRightValuesOnThePage(t *testing.T) {
	form := sampleForm(t)
	resolution := domain.Resolve(completeProfile(t), form.Mapping)
	final, err := RenderFinal(form, resolution)
	if err != nil {
		t.Fatalf("render final: %v", err)
	}

	page1 := pageText(t, final.Bytes, 1)
	for _, want := range []string{
		"(RIVERA)",           // last name, upper-cased by the mapping
		"(ANA)",              // first name
		"(S)",                // middle initial, truncated to one character
		"(03/07/1988)",       // date of birth in the form's own layout
		"(123-45-6789)",      // SSN formatted for this form
		"(555-123-4567)",     // phone
		"(ana.rivera@example.com)",
		"(140 Mission Street)",
		"(Fresno)",
		"(CA)",
		"(93701)",
		"(1,450.00)", // rent, grouped
		"(210.50)",   // utilities
	} {
		if !strings.Contains(page1, want) {
			t.Errorf("page 1 is missing %s", want)
		}
	}

	page2 := pageText(t, final.Bytes, 2)
	for _, want := range []string{
		"(3)",                  // household size
		"(Rivera, Mateo)",      // member 1, joined from the same group row
		"(09/01/2015)",
		"(Rivera, Lucia)",      // member 2
		"(04/22/2019)",
		"(2,080.00)",           // $480.00 weekly normalised to a month
		"(Valley Grocery)",
	} {
		if !strings.Contains(page2, want) {
			t.Errorf("page 2 is missing %s", want)
		}
	}
}

func TestTheSignatureIsNeverFilledIn(t *testing.T) {
	form := sampleForm(t)
	resolution := domain.Resolve(completeProfile(t), form.Mapping)

	skipped := map[string]domain.SkipReason{}
	for _, entry := range resolution.Skipped {
		skipped[entry.FieldID] = entry.Reason
	}
	for _, id := range []string{"applicant_signature", "signature_date"} {
		if skipped[id] != domain.SkipPolicy {
			t.Errorf("%s should be left for the applicant to sign, got %q", id, skipped[id])
		}
	}
	for _, filled := range resolution.Filled {
		if filled.FieldID == "applicant_signature" || filled.FieldID == "signature_date" {
			t.Errorf("Help The Hive must never sign or date an application: %s was filled", filled.FieldID)
		}
	}
}

func TestOnlyTheHouseholdRowsThatExistAreFilled(t *testing.T) {
	form := sampleForm(t)
	resolution := domain.Resolve(completeProfile(t), form.Mapping)

	// The form has three household lines and the household has two members.
	for _, id := range []string{"member_3_name", "member_3_dob"} {
		found := false
		for _, entry := range resolution.Skipped {
			if entry.FieldID == id && entry.Reason == domain.SkipNotApplicable {
				found = true
			}
		}
		if !found {
			t.Errorf("%s should be skipped as not applicable, not treated as a missing answer", id)
		}
	}
	for _, missing := range resolution.Missing {
		if missing.Strength == domain.Required {
			t.Errorf("nothing should still be required: %s", missing.FieldPath)
		}
	}
}

func TestTheCheckboxPairIsConsistent(t *testing.T) {
	form := sampleForm(t)
	resolution := domain.Resolve(completeProfile(t), form.Mapping)

	checked := map[string]bool{}
	for _, filled := range resolution.Filled {
		checked[filled.FieldID] = filled.Checked
	}
	if !checked["citizen_yes"] || checked["citizen_no"] {
		t.Errorf("a yes-or-no pair must tick exactly one box: yes=%v no=%v", checked["citizen_yes"], checked["citizen_no"])
	}
	if !checked["housing_rent"] || checked["housing_own"] || checked["housing_other"] {
		t.Errorf("a renter should tick only the rent box: %v", checked)
	}
}

func TestAnEmptyProfileAsksForEverythingAndFillsNothing(t *testing.T) {
	form := sampleForm(t)
	resolution := domain.Resolve(domain.NewProfile("user-2"), form.Mapping)

	if len(resolution.Filled) != 0 {
		t.Fatalf("an empty profile must produce a blank form, got %+v", resolution.Filled)
	}
	if !resolution.NeedsInput() {
		t.Fatal("an empty profile must be reported as needing input")
	}

	required := requiredMissing(resolution)
	for _, want := range []domain.FieldPath{
		"applicant.first_name", "applicant.last_name", "applicant.date_of_birth",
		"household.size", "household.members", "housing.status",
		"address.residential.state", "address.residential.street1", "income.sources",
	} {
		if !containsPath(required, want) {
			t.Errorf("the app should be asked to collect %s, but it was not reported missing", want)
		}
	}
	for _, missing := range resolution.Missing {
		if missing.Question == "" {
			t.Errorf("%s has no question for the app to ask", missing.FieldPath)
		}
	}
}

func TestAnApplicantWithNoPermanentAddressIsNotBlockedOnAStreet(t *testing.T) {
	form := sampleForm(t)
	profile := completeProfile(t)
	set(t, profile, "address.residential.is_homeless", domain.Bool(true, domain.SourceUser))
	if err := profile.Set("address.residential.street1", domain.Unknown()); err != nil {
		t.Fatalf("clear street: %v", err)
	}
	if err := profile.Set("address.residential.city", domain.Unknown()); err != nil {
		t.Fatalf("clear city: %v", err)
	}

	resolution := domain.Resolve(profile, form.Mapping)
	if resolution.NeedsInput() {
		t.Fatalf("an applicant with no permanent address should not be blocked on a street: %+v", requiredMissing(resolution))
	}
}

func TestAHouseholdWithNoIncomeIsNotBlockedOnIncomeSources(t *testing.T) {
	form := sampleForm(t)
	profile := completeProfile(t)
	set(t, profile, "income.has_no_income", domain.Bool(true, domain.SourceUser))

	resolution := domain.Resolve(profile, form.Mapping)
	if resolution.NeedsInput() {
		t.Fatalf("a household that declared no income should not be asked for sources: %+v", requiredMissing(resolution))
	}

	final, err := RenderFinal(form, resolution)
	if err != nil {
		t.Fatalf("render: %v", err)
	}
	if !strings.Contains(pageText(t, final.Bytes, 2), "(0.00)") {
		t.Error("a declared absence of income should appear as 0.00, not as a blank box")
	}
}

func requiredMissing(resolution domain.Resolution) []domain.FieldPath {
	var paths []domain.FieldPath
	for _, missing := range resolution.Missing {
		if missing.Strength == domain.Required {
			paths = append(paths, missing.FieldPath)
		}
	}
	return paths
}

func containsPath(paths []domain.FieldPath, want domain.FieldPath) bool {
	for _, path := range paths {
		if path == want {
			return true
		}
	}
	return false
}

// A derived value has no answer the user could give — it is computed from
// other answers — so the app must never put it to them as a question. It is
// still reported when a form needs it and cannot get it, because that box will
// be blank on the submitted form.
func TestADerivedValueIsReportedButNeverAskedAsAQuestion(t *testing.T) {
	form := sampleForm(t)
	resolution := domain.Resolve(domain.NewProfile("user-3"), form.Mapping)

	var total *domain.MissingField
	for i := range resolution.Missing {
		if resolution.Missing[i].FieldPath == "income.monthly_gross_total" {
			total = &resolution.Missing[i]
		}
	}
	if total == nil {
		t.Fatal("the income total should be reported as missing when it cannot be computed")
	}
	if !total.Derived {
		t.Error("the income total must be flagged as derived so the app does not ask for it")
	}

	// And the inputs that would fill it are asked for instead.
	if !containsPath(requiredMissing(resolution), "income.sources") {
		t.Error("the app should be asked to collect income sources, which is what fills the total")
	}

	// Answering the inputs clears it, so the flow is not deadlocked.
	answered := completeProfile(t)
	for _, missing := range domain.Resolve(answered, form.Mapping).Missing {
		if missing.FieldPath == "income.monthly_gross_total" {
			t.Error("once income is collected the total should be computed, not still outstanding")
		}
	}
}
