package filingkit

import (
	"testing"
	"time"

	domain "github.com/helpthehive/server/internal/domain/benefits"
)

func specFor(t *testing.T, path string) domain.FieldSpec {
	t.Helper()
	spec, ok := domain.Lookup(domain.FieldPath(path))
	if !ok {
		t.Fatalf("no spec for %s", path)
	}
	return spec
}

func TestDisplayMoney(t *testing.T) {
	spec := specFor(t, "housing.rent_monthly")
	cases := map[int64]string{
		0:        "$0.00",
		1500:     "$15.00",
		200000:   "$2,000.00",
		12345678: "$123,456.78",
		-500:     "-$5.00",
	}
	for cents, want := range cases {
		if got := displayValue(spec, domain.Money(cents, domain.SourceUser)); got != want {
			t.Fatalf("money %d = %q, want %q", cents, got, want)
		}
	}
}

func TestDisplayDate(t *testing.T) {
	spec := specFor(t, "applicant.date_of_birth")
	v := domain.Date(time.Date(1985, 12, 25, 0, 0, 0, 0, time.UTC), domain.SourceUser)
	if got := displayValue(spec, v); got != "Dec 25, 1985" {
		t.Fatalf("date = %q", got)
	}
}

func TestDisplayBoolean(t *testing.T) {
	spec := specFor(t, "contact.ok_to_text")
	if got := displayValue(spec, domain.Bool(true, domain.SourceUser)); got != "Yes" {
		t.Fatalf("true = %q", got)
	}
	if got := displayValue(spec, domain.Bool(false, domain.SourceUser)); got != "No" {
		t.Fatalf("false = %q", got)
	}
}

func TestDisplayChoiceHumanizesWithoutChangingCase(t *testing.T) {
	spec := specFor(t, "employment.status")
	v := domain.Choice("employed_full_time", domain.SourceUser)
	if got := displayValue(spec, v); got != "employed full time" {
		t.Fatalf("choice = %q", got)
	}
	state := specFor(t, "address.residential.state")
	v = domain.Choice("MO", domain.SourceUser)
	if got := displayValue(state, v); got != "MO" {
		t.Fatalf("state code = %q, must not be re-cased", got)
	}
}

func TestDisplayList(t *testing.T) {
	spec := specFor(t, "benefits.currently_receiving")
	v := domain.List([]string{"snap", "school_meals"}, domain.SourceUser)
	if got := displayValue(spec, v); got != "snap, school meals" {
		t.Fatalf("list = %q", got)
	}
}

func TestDisplayNumber(t *testing.T) {
	spec := specFor(t, "household.size")
	if got := displayValue(spec, domain.Number(4, domain.SourceUser)); got != "4" {
		t.Fatalf("number = %q", got)
	}
}

func TestDisplayNone(t *testing.T) {
	boolean := specFor(t, "income.has_no_income")
	if got := displayValue(boolean, domain.None(domain.KindBoolean, domain.SourceUser)); got != "No" {
		t.Fatalf("boolean none = %q, want No", got)
	}
	text := specFor(t, "expenses.childcare[].reason")
	if got := displayValue(text, domain.None(domain.KindText, domain.SourceUser)); got != "None" {
		t.Fatalf("text none = %q, want None", got)
	}
}
