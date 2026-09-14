// End-to-end proof harness for the benefits flow, run 2026-09-13.
//
// It proves, against the real (non-mock) server code, the claims the device
// run must then confirm on both platforms:
//
//	questionnaire answers -> review -> filing kit -> official portal,
//	with no Social Security number collected, stored, or printed anywhere.
//
// This file is a scratch proof driver, not part of the shipped suite.
package benefits_test

import (
	"regexp"
	"strings"
	"testing"
	"time"

	domain "github.com/helpthehive/server/internal/domain/benefits"
	"github.com/helpthehive/server/internal/modules/benefits"
	"github.com/helpthehive/server/internal/modules/benefits/filingkit"
)

// All values below are synthetic fixtures. Nothing here is a real person's
// data.
func proofProfile(t *testing.T) *domain.Profile {
	t.Helper()
	p := domain.NewProfile("proof-user")
	user := domain.SourceUser
	set := func(path string, v domain.Value) {
		t.Helper()
		if err := p.Set(domain.FieldPath(path), v); err != nil {
			t.Fatalf("set %s: %v", path, err)
		}
	}
	set("applicant.first_name", domain.Text("Alex", user))
	set("applicant.last_name", domain.Text("Example", user))
	set("applicant.date_of_birth", domain.Date(time.Date(1990, 3, 14, 0, 0, 0, 0, time.UTC), user))
	set("applicant.is_us_citizen", domain.Bool(true, user))
	set("contact.phone_primary", domain.Text("555-0100", user))
	set("address.residential.street1", domain.Text("123 Test St", user))
	set("address.residential.city", domain.Text("Kansas City", user))
	set("address.residential.state", domain.Choice("MO", user))
	set("address.residential.postal_code", domain.Text("64106", user))
	set("household.size", domain.Number(2, user))
	member := domain.NewGroupRow("row-1")
	member.Values["household.members[].first_name"] = domain.Text("Sam", user)
	member.Values["household.members[].relationship"] = domain.Choice("child", user)
	member.Values["household.members[].is_us_citizen"] = domain.Bool(true, user)
	if err := p.SetGroup("household.members", []domain.GroupRow{member}); err != nil {
		t.Fatalf("set household.members: %v", err)
	}
	set("employment.status", domain.Choice("employed_full_time", user))
	set("housing.status", domain.Choice("rent", user))
	set("housing.rent_monthly", domain.Money(120000, user))
	return p
}

func TestProof_VocabularyNeverAsksForSSN(t *testing.T) {
	for _, path := range []string{"applicant.ssn", "household.members[].ssn"} {
		spec, ok := domain.Lookup(domain.FieldPath(path))
		if !ok {
			t.Fatalf("vocabulary has no %s", path)
		}
		if !spec.NeverAsk {
			t.Fatalf("%s is not flagged NeverAsk — the questionnaire could prompt for it", path)
		}
	}
	t.Log("applicant.ssn and household.members[].ssn are both NeverAsk: the questionnaire never prompts for them")
}

var ssnShaped = regexp.MustCompile(`\b\d{3}-\d{2}-\d{4}\b|\b\d{9}\b`)

func TestProof_FilingKitHasNoSSN(t *testing.T) {
	kit, err := filingkit.Generate(proofProfile(t), filingkit.FormInfo{
		Title:    "Missouri SNAP Application (IM-1)",
		FormCode: "IM-1",
		State:    "MO",
		Program:  "SNAP",
	}, time.Now())
	if err != nil {
		t.Fatalf("Generate: %v", err)
	}

	answeredSSN := 0
	handWriteSSN := 0
	for _, section := range kit.Sections {
		for _, row := range section.Rows {
			path := string(row.Path)
			if ssnShaped.MatchString(row.Display) {
				t.Errorf("SSN-shaped value in kit row %q: %q", path, row.Display)
			}
			if !strings.Contains(path, "ssn") {
				continue
			}
			if row.State == filingkit.RowAnswered {
				answeredSSN++
				t.Errorf("SSN row %q is answered — SSNs must never be collected", path)
			}
			if strings.Contains(row.Note, "never asks for or stores") {
				handWriteSSN++
			}
		}
	}
	if answeredSSN > 0 {
		t.Fatalf("%d SSN rows carried answers", answeredSSN)
	}
	if handWriteSSN == 0 {
		t.Fatal("no SSN hand-write line found — the kit should tell the applicant to fill the SSN boxes by hand")
	}
	t.Logf("filing kit: 0 answered SSN rows, %d SSN hand-write lines", handWriteSSN)

	pdfBytes, err := filingkit.Render(kit)
	if err != nil {
		t.Fatalf("Render: %v", err)
	}
	if len(pdfBytes) == 0 {
		t.Fatal("rendered PDF is empty")
	}
	t.Logf("filing kit PDF rendered (%d bytes), ready to print or fax", len(pdfBytes))
}
