package benefits

import (
	"fmt"
	"strings"

	domain "github.com/helpthehive/server/internal/domain/benefits"
)

// Official state benefits portal routing.
//
// Help The Hive never submits an application anywhere: the actual application
// always happens on the official portal, in the user's own session. This
// registry exists so the app can point the user at the right official door —
// and it is deliberately pessimistic about what it knows.
//
// Rules:
//   - A per-state application URL appears here only after a human has
//     verified it against an official .gov source. Until then the lookup
//     returns url=nil, verified=false and fallback guidance, and the app
//     shows the guidance instead of a link.
//   - Portal URLs are never invented, never scraped, and never guessed from a
//     state's homepage or a search result. A .gov domain is necessary but not
//     sufficient: the page must be the program's actual application entry
//     point.
//   - The only URLs seeded as reference material are the two well-known
//     official directories, and they appear in fallback guidance text only —
//     never as the url field:
//       https://www.fns.usda.gov/snap/apply      (USDA SNAP state directory)
//       https://www.usa.gov/benefit-finder        (USA.gov benefit finder)
//
// How a verified URL gets added:
//  1. Open the program's application entry page on an official .gov site in a
//     browser and confirm it is the real application start, not a marketing
//     page, a PDF download, or a third-party helper.
//  2. Add the entry to verifiedPortals below with the URL, the program and
//     state codes, the .gov page it was verified against, and the date.
//  3. Extend portal_test.go with a case asserting the lookup returns it with
//     verified=true.
//
// The registry is in-memory and read-only after init: portal URLs change
// rarely, and a wrong cached URL is worse than a redeploy.

// Portal is where to apply for a program in a state.
type Portal struct {
	Program string
	State   string
	// URL is the official application URL, or nil when no verified URL is on
	// file. Never invented.
	URL *string
	// Verified is true when the URL was verified against an official .gov
	// source.
	Verified bool
	// FallbackGuidance is what the app shows when there is no verified URL.
	FallbackGuidance string
}

// verifiedPortal is one human-verified per-state application URL.
type verifiedPortal struct {
	url        string
	verifiedAt string // YYYY-MM-DD
	source     string // the .gov page it was verified against
}

// verifiedPortals maps program -> state -> verified URL. Empty until a URL is
// verified against an official .gov source; see the package comment for how
// one gets added.
var verifiedPortals = map[string]map[string]verifiedPortal{}

// knownPrograms is the set of programs the portal registry routes. Codes are
// the canonical uppercase forms used everywhere else in the benefits system.
var knownPrograms = map[string]bool{
	"SNAP": true, "WIC": true, "MEDICAID": true, "LIHEAP": true,
	"TANF": true, "VA": true, "SSI": true,
}

// programDisplay names a program for guidance copy.
var programDisplay = map[string]string{
	"SNAP": "SNAP", "WIC": "WIC", "MEDICAID": "Medicaid", "LIHEAP": "LIHEAP",
	"TANF": "TANF", "VA": "VA benefits", "SSI": "SSI",
}

const (
	snapDirectoryURL = "https://www.fns.usda.gov/snap/apply"
	benefitFinderURL = "https://www.usa.gov/benefit-finder"
)

// programAliases maps the program names the app's screens use (the Figma
// lists VA Disability, VA Pension and VA Health Care as separate cards) to
// the canonical program code. The checklist and portal copy stay
// program-level; the canonical code is what the GraphQL schema carries.
var programAliases = map[string]string{
	"VA DISABILITY":  "VA",
	"VA PENSION":     "VA",
	"VA HEALTH CARE": "VA",
	"VA HEALTHCARE":  "VA",
}

// normalizeProgram canonicalises a program code. Unknown programs are not
// found: routing somebody to a portal for a program this system does not know
// would be a guess.
func normalizeProgram(program string) (string, error) {
	code := strings.ToUpper(strings.TrimSpace(program))
	if alias, ok := programAliases[code]; ok {
		return alias, nil
	}
	if knownPrograms[code] {
		return code, nil
	}
	return "", fmt.Errorf("%w: unknown benefits program %q", domain.ErrNotFound, program)
}

// normalizeState canonicalises a state code against the same state table the
// ZIP lookup uses, so the two agree on what a state is.
func normalizeState(state string) (string, error) {
	code := strings.ToUpper(strings.TrimSpace(state))
	if _, ok := stateNames[code]; ok {
		return code, nil
	}
	return "", fmt.Errorf("%w: unknown state %q", domain.ErrNotFound, state)
}

// PortalFor returns the official application portal for a program in a state.
// It is pure reference data: no identity, no user data, no database.
func (s *Service) PortalFor(program, state string) (Portal, error) {
	code, err := normalizeProgram(program)
	if err != nil {
		return Portal{}, err
	}
	st, err := normalizeState(state)
	if err != nil {
		return Portal{}, err
	}
	portal := Portal{Program: code, State: st, FallbackGuidance: fallbackGuidance(code, st)}
	if states, ok := verifiedPortals[code]; ok {
		if verified, ok := states[st]; ok {
			url := verified.url
			portal.URL = &url
			portal.Verified = true
			portal.FallbackGuidance = ""
		}
	}
	return portal, nil
}

// fallbackGuidance tells the applicant how to find the official application
// when no verified URL is on file. It names only the two official directories
// seeded as reference material — nothing invented.
func fallbackGuidance(program, state string) string {
	name := stateNames[state]
	display := programDisplay[program]
	if program == "SNAP" {
		return fmt.Sprintf("No verified application link is on file for SNAP in %s yet. Apply on the state's official site — find it through the USDA's SNAP state directory at %s — or start at %s. Only ever apply on a .gov site.",
			name, snapDirectoryURL, benefitFinderURL)
	}
	return fmt.Sprintf("No verified application link is on file for %s in %s yet. Find the state's official application through %s, and only ever apply on a .gov site.",
		display, name, benefitFinderURL)
}
