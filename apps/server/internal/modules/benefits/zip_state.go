package benefits

import (
	"fmt"
	"strings"
)

// Conservative ZIP code to U.S. state lookup.
//
// The table below encodes the first-three-digit ranges from the U.S. Treasury
// FinCEN "Zip Code Validation Table" (fincen.gov), an official public source
// that lists the valid 3-digit ZIP prefix ranges by state and territory. The
// snapshot was encoded 2026-09-10; if USPS reallocates a prefix, the table
// needs a human update — the lookup never guesses, so a stale table degrades
// to "unknown", never to a wrong state.
//
// Conservatism rules, in order:
//  1. The input must be exactly 5 digits, otherwise it is rejected.
//  2. A prefix claimed by exactly one U.S. state (50 states + DC) resolves to
//     that state.
//  3. A prefix claimed by a territory or a military post office only resolves
//     to state=null with an explanation: territories are not states, and the
//     downstream use (state portal routing) has no territory portal.
//  4. A prefix claimed by more than one entry — e.g. 008 (Puerto Rico and the
//     U.S. Virgin Islands), 063 (Connecticut and, per FinCEN, New York's
//     Fishers Island entry), 090-098 (New York and military AE), 962-966
//     (California and military AP), 967 (Hawaii and American Samoa) —
//     resolves to state=null. When two sources disagree, the lookup refuses
//     to pick.
//  5. A prefix in no range resolves to state=null.
//
// The result carries a human-readable detail in every case, so the app can
// explain why it did or did not detect a state.

// zipRange is one FinCEN first-three-digit range. code is the two-letter state
// or territory code; state is false for territories and military post offices.
type zipRange struct {
	lo, hi int
	code   string
	state  bool
}

// zipRanges is the FinCEN Zip Code Validation Table, first three digits.
// Single prefixes are written as lo == hi.
var zipRanges = []zipRange{
	{350, 369, "AL", true},
	{995, 999, "AK", true},
	{850, 865, "AZ", true},
	{716, 729, "AR", true}, {755, 755, "AR", true},
	{900, 966, "CA", true},
	{800, 816, "CO", true},
	{60, 69, "CT", true},
	{197, 199, "DE", true},
	{200, 205, "DC", true},
	{320, 349, "FL", true},
	{300, 319, "GA", true}, {398, 399, "GA", true},
	{967, 968, "HI", true},
	{832, 838, "ID", true},
	{600, 629, "IL", true},
	{460, 479, "IN", true},
	{500, 528, "IA", true},
	{660, 679, "KS", true},
	{400, 427, "KY", true},
	{700, 714, "LA", true},
	{39, 49, "ME", true},
	{206, 219, "MD", true},
	{10, 27, "MA", true},
	{480, 499, "MI", true},
	{550, 567, "MN", true},
	{386, 397, "MS", true},
	{630, 658, "MO", true},
	{590, 599, "MT", true},
	{680, 693, "NE", true},
	{889, 898, "NV", true},
	{30, 39, "NH", true},
	{70, 89, "NJ", true},
	{870, 884, "NM", true},
	{5, 5, "NY", true}, {63, 63, "NY", true}, {90, 149, "NY", true},
	{269, 289, "NC", true},
	{580, 588, "ND", true},
	{430, 459, "OH", true},
	{730, 749, "OK", true},
	{970, 979, "OR", true},
	{150, 196, "PA", true},
	{28, 29, "RI", true},
	{290, 299, "SC", true},
	{570, 577, "SD", true},
	{370, 385, "TN", true},
	{750, 799, "TX", true}, {885, 885, "TX", true},
	{840, 847, "UT", true},
	{50, 59, "VT", true},
	{201, 201, "VA", true}, {220, 246, "VA", true},
	{980, 994, "WA", true},
	{530, 549, "WI", true},
	{247, 268, "WV", true},
	{820, 831, "WY", true},
	// Territories and military post offices: not states, so they resolve to
	// null with an explanation rather than a code the portal registry cannot
	// route.
	{6, 9, "PR", false},
	{8, 8, "VI", false},
	{967, 967, "AS", false},
	{969, 969, "GU", false}, {969, 969, "MH", false},
	{969, 969, "MP", false}, {969, 969, "PW", false},
	{340, 340, "AA", false},
	{90, 98, "AE", false},
	{962, 966, "AP", false},
}

// stateNames renders the two-letter codes in the detail strings.
var stateNames = map[string]string{
	"AL": "Alabama", "AK": "Alaska", "AZ": "Arizona", "AR": "Arkansas",
	"CA": "California", "CO": "Colorado", "CT": "Connecticut", "DE": "Delaware",
	"DC": "District of Columbia", "FL": "Florida", "GA": "Georgia", "HI": "Hawaii",
	"ID": "Idaho", "IL": "Illinois", "IN": "Indiana", "IA": "Iowa",
	"KS": "Kansas", "KY": "Kentucky", "LA": "Louisiana", "ME": "Maine",
	"MD": "Maryland", "MA": "Massachusetts", "MI": "Michigan", "MN": "Minnesota",
	"MS": "Mississippi", "MO": "Missouri", "MT": "Montana", "NE": "Nebraska",
	"NV": "Nevada", "NH": "New Hampshire", "NJ": "New Jersey", "NM": "New Mexico",
	"NY": "New York", "NC": "North Carolina", "ND": "North Dakota", "OH": "Ohio",
	"OK": "Oklahoma", "OR": "Oregon", "PA": "Pennsylvania", "RI": "Rhode Island",
	"SC": "South Carolina", "SD": "South Dakota", "TN": "Tennessee", "TX": "Texas",
	"UT": "Utah", "VT": "Vermont", "VA": "Virginia", "WA": "Washington",
	"WI": "Wisconsin", "WV": "West Virginia", "WY": "Wyoming",
}

// StateLookup is the result of detecting a U.S. state from a ZIP code.
type StateLookup struct {
	Zip    string
	State  *string
	Detail string
}

// StateFromZip detects the U.S. state for a 5-digit ZIP code. It is pure
// reference data: no identity, no user data, no database.
func (s *Service) StateFromZip(zip string) StateLookup {
	zip = strings.TrimSpace(zip)
	if len(zip) != 5 {
		return StateLookup{Zip: zip, Detail: "A ZIP code must be exactly 5 digits."}
	}
	prefix := 0
	for _, r := range zip {
		if r < '0' || r > '9' {
			return StateLookup{Zip: zip, Detail: "A ZIP code must be exactly 5 digits."}
		}
		prefix = prefix*10 + int(r-'0')
	}
	prefix /= 100

	var matches []zipRange
	for _, r := range zipRanges {
		if prefix >= r.lo && prefix <= r.hi {
			matches = append(matches, r)
		}
	}
	switch len(matches) {
	case 0:
		return StateLookup{
			Zip:    zip,
			Detail: fmt.Sprintf("ZIP %s is not in the state lookup table, so no state was assumed. Enter your state manually.", zip),
		}
	case 1:
		m := matches[0]
		if !m.state {
			return StateLookup{
				Zip:    zip,
				Detail: fmt.Sprintf("ZIP %s belongs to %s, which is not a U.S. state, so no state was returned.", zip, territoryName(m.code)),
			}
		}
		state := m.code
		return StateLookup{
			Zip:    zip,
			State:  &state,
			Detail: fmt.Sprintf("ZIP %s is in %s's range.", zip, stateNames[m.code]),
		}
	default:
		codes := make([]string, 0, len(matches))
		for _, m := range matches {
			codes = append(codes, m.code)
		}
		return StateLookup{
			Zip:    zip,
			Detail: fmt.Sprintf("ZIP %s's prefix is claimed by more than one entry (%s), so no state was assumed. Enter your state manually.", zip, strings.Join(codes, ", ")),
		}
	}
}

// territoryName names a non-state code for the detail string.
func territoryName(code string) string {
	switch code {
	case "PR":
		return "Puerto Rico"
	case "VI":
		return "the U.S. Virgin Islands"
	case "AS":
		return "American Samoa"
	case "GU":
		return "Guam"
	case "MH":
		return "the Marshall Islands"
	case "MP":
		return "the Northern Mariana Islands"
	case "PW":
		return "Palau"
	case "AA":
		return "a military post office (Armed Forces Americas)"
	case "AE":
		return "a military post office (Armed Forces Europe)"
	case "AP":
		return "a military post office (Armed Forces Pacific)"
	}
	return code
}
