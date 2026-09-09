package filingkit

import (
	"encoding/json"
	"strings"
	"testing"
	"time"

	domain "github.com/helpthehive/server/internal/domain/benefits"
)

// All values below are synthetic fixtures. Nothing here is a real person's
// data, and the SSN-shaped fields are deliberately left unanswered so no
// test ever carries anything PII-shaped.

func syntheticProfile(t *testing.T) *domain.Profile {
	t.Helper()
	p := domain.NewProfile("test-user")
	set := func(path string, v domain.Value) {
		t.Helper()
		if err := p.Set(domain.FieldPath(path), v); err != nil {
			t.Fatalf("set %s: %v", path, err)
		}
	}
	user := domain.SourceUser

	set("applicant.first_name", domain.Text("Alex", user))
	set("applicant.last_name", domain.Text("Example", user))
	set("applicant.date_of_birth", domain.Date(time.Date(1990, 3, 14, 0, 0, 0, 0, time.UTC), user))
	set("applicant.sex", domain.Choice("female", user))
	set("applicant.marital_status", domain.Choice("single", user))
	set("applicant.is_veteran", domain.Refused(domain.KindBoolean))
	set("contact.phone_primary", domain.Text("555-0100", user))
	set("address.residential.street1", domain.Text("123 Test St", user))
	set("address.residential.city", domain.Text("Testville", user))
	set("address.residential.state", domain.Choice("NY", user))
	set("address.residential.postal_code", domain.Text("10001", user))
	set("household.size", domain.Number(2, user))

	member := domain.NewGroupRow("row-1")
	member.Values["household.members[].first_name"] = domain.Text("Sam", user)
	member.Values["household.members[].relationship"] = domain.Choice("child", user)
	if err := p.SetGroup("household.members", []domain.GroupRow{member}); err != nil {
		t.Fatalf("set household.members: %v", err)
	}

	set("employment.status", domain.Choice("employed_part_time", user))
	job := domain.NewGroupRow("job-1")
	job.Values["employment.jobs[].employer_name"] = domain.Text("Test Mart", user)
	job.Values["employment.jobs[].pay_rate"] = domain.Money(1500, user)
	if err := p.SetGroup("employment.jobs", []domain.GroupRow{job}); err != nil {
		t.Fatalf("set employment.jobs: %v", err)
	}

	set("income.has_no_income", domain.Bool(false, user))
	source := domain.NewGroupRow("inc-1")
	source.Values["income.sources[].kind"] = domain.Choice("wages", user)
	source.Values["income.sources[].gross_amount"] = domain.Money(200000, user)
	source.Values["income.sources[].frequency"] = domain.Choice("monthly", user)
	if err := p.SetGroup("income.sources", []domain.GroupRow{source}); err != nil {
		t.Fatalf("set income.sources: %v", err)
	}

	set("housing.status", domain.Choice("rent", user))
	set("housing.rent_monthly", domain.Money(120000, user))
	set("resources.has_bank_accounts", domain.None(domain.KindBoolean, user))

	return p
}

func testForm() FormInfo {
	return FormInfo{
		Title:      "Application for Test Benefits",
		FormCode:   "TEST-001",
		Version:    "Rev. 01/26",
		State:      "NY",
		Program:    "SNAP",
		AgencyName: "Test Agency",
		AgencyURL:  "https://example.gov/apply",
	}
}

func findSection(kit Kit, code string) KitSection {
	for _, sec := range kit.Sections {
		if sec.Code == code {
			return sec
		}
	}
	return KitSection{}
}

func findRow(sec KitSection, path string) Row {
	for _, row := range sec.Rows {
		if string(row.Path) == path {
			return row
		}
	}
	return Row{}
}

func TestGenerateSectionOrder(t *testing.T) {
	kit, err := Generate(syntheticProfile(t), testForm(), time.Date(2026, 9, 8, 0, 0, 0, 0, time.UTC))
	if err != nil {
		t.Fatalf("Generate: %v", err)
	}
	var codes []string
	for _, sec := range kit.Sections {
		codes = append(codes, sec.Code)
	}
	want := []string{"A", "B", "C", "D", "E", "F", "G", "H", "I", "J"}
	if strings.Join(codes, "") != strings.Join(want, "") {
		t.Fatalf("section order = %v, want %v", codes, want)
	}
}

func TestGenerateAnsweredRows(t *testing.T) {
	kit, err := Generate(syntheticProfile(t), testForm(), time.Now())
	if err != nil {
		t.Fatalf("Generate: %v", err)
	}
	row := findRow(findSection(kit, "A"), "applicant.first_name")
	if row.State != RowAnswered || row.Display != "Alex" {
		t.Fatalf("first_name row = %+v, want answered Alex", row)
	}
	row = findRow(findSection(kit, "A"), "applicant.date_of_birth")
	if row.Display != "Mar 14, 1990" {
		t.Fatalf("date_of_birth display = %q, want Mar 14, 1990", row.Display)
	}
	row = findRow(findSection(kit, "F"), "income.monthly_gross_total")
	if row.State != RowAnswered || row.Display != "$2,000.00" {
		t.Fatalf("derived income row = %+v, want answered $2,000.00", row)
	}
	if row.Note != "calculated from your answers" {
		t.Fatalf("derived note = %q", row.Note)
	}
}

func TestGenerateBlankRows(t *testing.T) {
	kit, err := Generate(syntheticProfile(t), testForm(), time.Now())
	if err != nil {
		t.Fatalf("Generate: %v", err)
	}
	if kit.Blank == 0 {
		t.Fatal("expected blank ruled lines for unanswered questions")
	}
	row := findRow(findSection(kit, "A"), "applicant.middle_name")
	if row.State != RowBlank || row.Note != "fill in by hand" {
		t.Fatalf("middle_name row = %+v, want blank fill-in-by-hand", row)
	}
	// The SSN fields are sensitive and unanswered: blank lines, marked
	// sensitive so a future redaction pass can find them.
	row = findRow(findSection(kit, "D"), "applicant.ssn")
	if row.State != RowBlank || !row.Sensitive {
		t.Fatalf("ssn row = %+v, want blank sensitive", row)
	}
}

func TestGenerateGroupRows(t *testing.T) {
	kit, err := Generate(syntheticProfile(t), testForm(), time.Now())
	if err != nil {
		t.Fatalf("Generate: %v", err)
	}
	sec := findSection(kit, "C")
	var subheads []string
	for _, row := range sec.Rows {
		if row.Subhead != "" {
			subheads = append(subheads, row.Subhead)
		}
	}
	if len(subheads) != 1 || subheads[0] != "Household member 1 of 1" {
		t.Fatalf("subheads = %v, want one member block", subheads)
	}
	row := findRow(sec, "household.members[0].first_name")
	if row.State != RowAnswered || row.Display != "Sam" {
		t.Fatalf("member first_name = %+v, want answered Sam", row)
	}
	row = findRow(sec, "household.members[0].last_name")
	if row.State != RowBlank {
		t.Fatalf("member last_name = %+v, want blank", row)
	}
	// The member's citizenship answers surface in section D, not C.
	row = findRow(findSection(kit, "D"), "household.members[0].is_us_citizen")
	if row.State != RowBlank {
		t.Fatalf("member citizenship = %+v, want blank in section D", row)
	}
	// Collected jobs expand the same way in section E.
	secE := findSection(kit, "E")
	row = findRow(secE, "employment.jobs[0].employer_name")
	if row.State != RowAnswered || row.Display != "Test Mart" {
		t.Fatalf("job employer = %+v", row)
	}
}

func TestGenerateUncollectedGroupBlankBlock(t *testing.T) {
	// Employed but no job rows collected: the form likely needs a blank
	// block to write the job in.
	p := domain.NewProfile("u1")
	if err := p.Set("employment.status", domain.Choice("employed_full_time", domain.SourceUser)); err != nil {
		t.Fatal(err)
	}
	kit, err := Generate(p, testForm(), time.Now())
	if err != nil {
		t.Fatalf("Generate: %v", err)
	}
	sec := findSection(kit, "E")
	found := false
	for _, row := range sec.Rows {
		if row.Subhead == "Job" {
			found = true
		}
	}
	if !found {
		t.Fatal("expected a blank Job block for an employed applicant with no job rows")
	}
	if row := findRow(sec, "employment.jobs[].employer_name"); row.State != RowBlank {
		t.Fatalf("blank job employer = %+v", row)
	}

	// Unemployed: no blank job grid — clutter, not help.
	p2 := domain.NewProfile("u2")
	if err := p2.Set("employment.status", domain.Choice("unemployed", domain.SourceUser)); err != nil {
		t.Fatal(err)
	}
	kit2, err := Generate(p2, testForm(), time.Now())
	if err != nil {
		t.Fatalf("Generate: %v", err)
	}
	for _, row := range findSection(kit2, "E").Rows {
		if row.Subhead == "Job" {
			t.Fatal("unemployed applicant must not get a blank Job block")
		}
	}

	// Household roster with size 1 and no member rows: applicant-only, no
	// blank member block.
	p3 := domain.NewProfile("u3")
	if err := p3.Set("household.size", domain.Number(1, domain.SourceUser)); err != nil {
		t.Fatal(err)
	}
	kit3, err := Generate(p3, testForm(), time.Now())
	if err != nil {
		t.Fatalf("Generate: %v", err)
	}
	for _, row := range findSection(kit3, "C").Rows {
		if strings.HasPrefix(row.Subhead, "Household member") {
			t.Fatal("single-person household must not get a blank member block")
		}
	}
}

func TestGenerateRefusedAndNone(t *testing.T) {
	kit, err := Generate(syntheticProfile(t), testForm(), time.Now())
	if err != nil {
		t.Fatalf("Generate: %v", err)
	}
	row := findRow(findSection(kit, "I"), "applicant.is_veteran")
	if row.State != RowDeclined || row.Note != "declined to answer — not transcribed" {
		t.Fatalf("refused row = %+v", row)
	}
	// StatusNone on a boolean is a real answer: "No".
	row = findRow(findSection(kit, "H"), "resources.has_bank_accounts")
	if row.State != RowAnswered || row.Display != "No" {
		t.Fatalf("none row = %+v, want answered No", row)
	}
}

func TestGenerateExpectedNarrowing(t *testing.T) {
	form := testForm()
	form.Expected = []domain.FieldPath{"applicant.first_name"}
	kit, err := Generate(syntheticProfile(t), form, time.Now())
	if err != nil {
		t.Fatalf("Generate: %v", err)
	}
	if kit.Blank != 0 {
		t.Fatalf("Blank = %d, want 0 with a narrowed expected set", kit.Blank)
	}
	// Answered paths outside the expected set are still shown (they may
	// help); unanswered ones are not printed as blank lines. B survives on
	// its answered address rows; D keeps only the collected roster's
	// summary row, with no blank citizenship lines.
	var codes []string
	for _, sec := range kit.Sections {
		codes = append(codes, sec.Code)
	}
	if strings.Join(codes, "") != "ABCDEFGHIJ" {
		t.Fatalf("sections = %v, want all ten", codes)
	}
	secD := findSection(kit, "D")
	if len(secD.Rows) != 1 || secD.Rows[0].Display != "1 listed" {
		t.Fatalf("section D should hold only the roster summary, got %+v", secD.Rows)
	}
	if row := findRow(findSection(kit, "A"), "applicant.middle_name"); row.Label != "" {
		t.Fatalf("unanswered non-expected path leaked onto the sheet: %+v", row)
	}
}

func TestGenerateCertificationRows(t *testing.T) {
	kit, err := Generate(syntheticProfile(t), testForm(), time.Now())
	if err != nil {
		t.Fatalf("Generate: %v", err)
	}
	sec := findSection(kit, "J")
	var labels []string
	for _, row := range sec.Rows {
		if row.State == RowInfo {
			labels = append(labels, row.Label)
		}
	}
	if len(labels) != 2 || labels[0] != "Signature" || labels[1] != "Date signed" {
		t.Fatalf("certification rows = %v", labels)
	}
	if sec.Rows[len(sec.Rows)-2].Note == "" {
		t.Fatal("signature row must carry its never-pre-filled note")
	}
}

func TestGenerateRequiresProfile(t *testing.T) {
	if _, err := Generate(nil, testForm(), time.Now()); err == nil {
		t.Fatal("expected an error for a nil profile")
	}
}

// TestAuditCarriesNoValues enforces the privacy contract: the audit trail may
// record which questions were emitted, never what the answers were.
func TestAuditCarriesNoValues(t *testing.T) {
	kit, err := Generate(syntheticProfile(t), testForm(), time.Now())
	if err != nil {
		t.Fatalf("Generate: %v", err)
	}
	audit := kit.Audit()
	raw, err := json.Marshal(audit)
	if err != nil {
		t.Fatalf("marshal audit: %v", err)
	}
	for _, secret := range []string{
		"Alex", "Example", "555-0100", "123 Test St", "Testville",
		"Sam", "Test Mart", "$2,000.00", "$1,200.00",
	} {
		if strings.Contains(string(raw), secret) {
			t.Fatalf("audit trail contains a value %q", secret)
		}
	}
	if audit.Answered != kit.Answered || audit.Blank != kit.Blank || audit.Declined != kit.Declined {
		t.Fatal("audit counts do not match the kit")
	}
	if len(audit.Paths) == 0 {
		t.Fatal("audit should list the emitted paths")
	}
	for _, p := range audit.Paths {
		if strings.Contains(p, "[0]") {
			t.Fatalf("audit path %q is not a template path", p)
		}
	}
	if audit.FormCode != "TEST-001" || audit.State != "NY" || audit.Program != "SNAP" {
		t.Fatalf("audit form identity = %+v", audit)
	}
}
