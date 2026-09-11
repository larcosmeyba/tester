package benefits

import (
	"strings"
	"testing"
)

// The ZIP lookup is conservative by construction: a wrong state is worse than
// no state, so every ambiguous, unknown or malformed input must resolve to
// null with an explanation — never a guess.

func TestStateFromZipKnown(t *testing.T) {
	cases := map[string]string{
		"90210": "CA", // Beverly Hills
		"10001": "NY", // Manhattan
		"20001": "DC",
		"33101": "FL", // Miami
		"60601": "IL", // Chicago
		"99501": "AK", // Anchorage
		"96801": "HI", // Honolulu (968 only; 967 is shared with American Samoa)
		"64106": "MO", // Kansas City
		"83702": "ID", // Boise
		"88595": "TX", // El Paso (FinCEN lists 885 under TX)
		"39813": "GA", // FinCEN lists 398-399 under GA
	}
	delete(cases, "06390")

	service := NewService(nil, nil, nil, nil, nil, nil)
	for zip, want := range cases {
		lookup := service.StateFromZip(zip)
		if lookup.State == nil {
			t.Fatalf("StateFromZip(%q) = null, want %q (%s)", zip, want, lookup.Detail)
		}
		if *lookup.State != want {
			t.Fatalf("StateFromZip(%q) = %q, want %q", zip, *lookup.State, want)
		}
		if lookup.Detail == "" {
			t.Fatalf("StateFromZip(%q): detail must explain the result", zip)
		}
	}
	// 755 is Texarkana, which straddles the Arkansas/Texas line — and FinCEN's
	// table claims it for both (AR's 755 entry, TX's 750-799 range). The
	// lookup correctly refuses to pick.
	if lookup := service.StateFromZip("75501"); lookup.State != nil {
		t.Fatalf("StateFromZip(75501) = %q, want null (claimed by AR and TX)", *lookup.State)
	}
}

func TestStateFromZipAmbiguousIsNull(t *testing.T) {
	// Each of these prefixes is claimed by more than one table entry, so the
	// lookup must refuse to pick.
	ambiguous := map[string]string{
		"00802": "Puerto Rico and the U.S. Virgin Islands",
		"06390": "Connecticut and New York (FinCEN lists 063 under both)",
		"09301": "New York and military AE",
		"96201": "California and military AP",
		"96701": "Hawaii and American Samoa",
		"96910": "Guam and the other Pacific territories",
		"34013": "Florida and military AA",
		"75501": "Arkansas and Texas (Texarkana straddles the line)",
	}
	service := NewService(nil, nil, nil, nil, nil, nil)
	for zip, why := range ambiguous {
		lookup := service.StateFromZip(zip)
		if lookup.State != nil {
			t.Fatalf("StateFromZip(%q) = %q, want null (%s)", zip, *lookup.State, why)
		}
		if lookup.Detail == "" {
			t.Fatalf("StateFromZip(%q): an ambiguous lookup must explain itself", zip)
		}
	}
}

func TestStateFromZipTerritoryAndMilitaryIsNull(t *testing.T) {
	service := NewService(nil, nil, nil, nil, nil, nil)
	// 006/007/009 are Puerto Rico only in the FinCEN table — a territory, not
	// a state. (008 is shared with the Virgin Islands and 340/090-098/962-966
	// are shared with a state, so those resolve as ambiguous instead.)
	for _, zip := range []string{"00601", "00901"} {
		lookup := service.StateFromZip(zip)
		if lookup.State != nil {
			t.Fatalf("StateFromZip(%q) = %q, want null (not a U.S. state)", zip, *lookup.State)
		}
		if !strings.Contains(lookup.Detail, "not a U.S. state") {
			t.Fatalf("StateFromZip(%q): detail %q should say it is not a state", zip, lookup.Detail)
		}
	}
}

func TestStateFromZipUnknownIsNull(t *testing.T) {
	service := NewService(nil, nil, nil, nil, nil, nil)
	// 000, 002 and 869 are in no FinCEN range.
	for _, zip := range []string{"00000", "00210", "86999"} {
		lookup := service.StateFromZip(zip)
		if lookup.State != nil {
			t.Fatalf("StateFromZip(%q) = %q, want null", zip, *lookup.State)
		}
		if lookup.Detail == "" {
			t.Fatalf("StateFromZip(%q): an unknown lookup must explain itself", zip)
		}
	}
}

func TestStateFromZipMalformed(t *testing.T) {
	service := NewService(nil, nil, nil, nil, nil, nil)
	for _, zip := range []string{"", "1234", "123456", "abcde", "9021a", "90 210"} {
		lookup := service.StateFromZip(zip)
		if lookup.State != nil {
			t.Fatalf("StateFromZip(%q) = %q, want null (malformed)", zip, *lookup.State)
		}
		if !strings.Contains(lookup.Detail, "5 digits") {
			t.Fatalf("StateFromZip(%q): detail %q should demand 5 digits", zip, lookup.Detail)
		}
	}
	// Surrounding whitespace is tolerated; the digits are what matter.
	if lookup := service.StateFromZip("  90210\n"); lookup.State == nil || *lookup.State != "CA" {
		t.Fatalf("StateFromZip with whitespace = %+v, want CA", lookup)
	}
}
