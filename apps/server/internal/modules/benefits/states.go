package benefits

import "strings"

// usStateCodes maps US state/territory names (and DC) to their two-letter
// postal codes. The form registry keys jurisdictions by code ("CA"), but
// clients naturally send the display name ("California"); normalising here
// keeps the API forgiving instead of silently returning zero forms.
var usStateCodes = map[string]string{
	"alabama": "AL", "alaska": "AK", "arizona": "AZ", "arkansas": "AR",
	"california": "CA", "colorado": "CO", "connecticut": "CT", "delaware": "DE",
	"district of columbia": "DC", "florida": "FL", "georgia": "GA",
	"hawaii": "HI", "idaho": "ID", "illinois": "IL", "indiana": "IN",
	"iowa": "IA", "kansas": "KS", "kentucky": "KY", "louisiana": "LA",
	"maine": "ME", "maryland": "MD", "massachusetts": "MA", "michigan": "MI",
	"minnesota": "MN", "mississippi": "MS", "missouri": "MO", "montana": "MT",
	"nebraska": "NE", "nevada": "NV", "new hampshire": "NH",
	"new jersey": "NJ", "new mexico": "NM", "new york": "NY",
	"north carolina": "NC", "north dakota": "ND", "ohio": "OH",
	"oklahoma": "OK", "oregon": "OR", "pennsylvania": "PA",
	"rhode island": "RI", "south carolina": "SC", "south dakota": "SD",
	"tennessee": "TN", "texas": "TX", "utah": "UT", "vermont": "VT",
	"virginia": "VA", "washington": "WA", "west virginia": "WV",
	"wisconsin": "WI", "wyoming": "WY",
	"puerto rico": "PR", "guam": "GU", "u.s. virgin islands": "VI",
	"virgin islands": "VI", "american samoa": "AS",
	"northern mariana islands": "MP",
}

// normalizeState accepts a two-letter code ("CA") or a full name
// ("California", any case) and returns the upper-case code. Anything
// unrecognised is returned upper-cased unchanged so existing callers that
// already pass codes see no behaviour change.
func normalizeState(state string) string {
	trimmed := strings.TrimSpace(state)
	if len(trimmed) == 2 {
		return strings.ToUpper(trimmed)
	}
	if code, ok := usStateCodes[strings.ToLower(trimmed)]; ok {
		return code
	}
	return strings.ToUpper(trimmed)
}
