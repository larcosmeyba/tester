package benefits

import (
	"strings"
	"testing"
)

// The portal registry routes the applicant to the official application door.
// Until a URL is verified against an official .gov source, the lookup must
// return url=null, verified=false and fallback guidance — never an invented
// link.

func TestPortalUnverifiedReturnsNullURL(t *testing.T) {
	service := NewService(nil, nil, nil, nil, nil, nil)
	portal, err := service.PortalFor("SNAP", "AL")
	if err != nil {
		t.Fatalf("PortalFor() error = %v", err)
	}
	if portal.URL != nil {
		t.Fatalf("portal URL = %q, want null (no verified URL is on file)", *portal.URL)
	}
	if portal.Verified {
		t.Fatal("verified = true, want false")
	}
	if portal.Program != "SNAP" || portal.State != "AL" {
		t.Fatalf("portal = %+v, want program SNAP state AL", portal)
	}
	if !strings.Contains(portal.FallbackGuidance, "https://www.fns.usda.gov/snap/apply") {
		t.Fatalf("SNAP guidance %q should point at the USDA SNAP state directory", portal.FallbackGuidance)
	}
	if !strings.Contains(portal.FallbackGuidance, "https://www.usa.gov/benefit-finder") {
		t.Fatalf("guidance %q should point at the USA.gov benefit finder", portal.FallbackGuidance)
	}
}

func TestPortalNonSnapGuidance(t *testing.T) {
	service := NewService(nil, nil, nil, nil, nil, nil)
	for _, program := range []string{"WIC", "MEDICAID", "LIHEAP", "TANF", "VA", "SSI"} {
		portal, err := service.PortalFor(program, "CA")
		if err != nil {
			t.Fatalf("PortalFor(%q) error = %v", program, err)
		}
		if portal.URL != nil || portal.Verified {
			t.Fatalf("PortalFor(%q): URL must be null until verified", program)
		}
		if !strings.Contains(portal.FallbackGuidance, "https://www.usa.gov/benefit-finder") {
			t.Fatalf("PortalFor(%q): guidance %q should point at the USA.gov benefit finder", program, portal.FallbackGuidance)
		}
		// The guidance must name the state so the applicant knows it is about
		// their state, and must never contain a fabricated state URL.
		if !strings.Contains(portal.FallbackGuidance, "California") {
			t.Fatalf("PortalFor(%q): guidance %q should name the state", program, portal.FallbackGuidance)
		}
		for _, invented := range []string{"ca.gov/apply", "benefitscal", "getcalfresh"} {
			if strings.Contains(strings.ToLower(portal.FallbackGuidance), invented) {
				t.Fatalf("PortalFor(%q): guidance must not invent a portal URL: %q", program, portal.FallbackGuidance)
			}
		}
	}
}

func TestPortalNormalizesInput(t *testing.T) {
	service := NewService(nil, nil, nil, nil, nil, nil)
	portal, err := service.PortalFor("  snap ", "mo")
	if err != nil {
		t.Fatalf("PortalFor() error = %v", err)
	}
	if portal.Program != "SNAP" || portal.State != "MO" {
		t.Fatalf("portal = %+v, want normalized SNAP/MO", portal)
	}
}

// The app's screens list VA Disability, VA Pension and VA Health Care as
// separate cards; the server canonicalizes all of them to VA.
func TestPortalCanonicalizesVAProgramVariants(t *testing.T) {
	service := NewService(nil, nil, nil, nil, nil, nil)
	for _, variant := range []string{"VA Disability", "VA Pension", "VA Health Care", "VA Healthcare"} {
		portal, err := service.PortalFor(variant, "MO")
		if err != nil {
			t.Fatalf("PortalFor(%q) error = %v", variant, err)
		}
		if portal.Program != "VA" {
			t.Fatalf("PortalFor(%q): program = %q, want VA", variant, portal.Program)
		}
		sections, err := service.Checklist(variant, "MO")
		if err != nil {
			t.Fatalf("Checklist(%q) error = %v", variant, err)
		}
		if len(sections) != 3 {
			t.Fatalf("Checklist(%q): %d sections, want 3", variant, len(sections))
		}
	}
}

func TestPortalRejectsUnknownProgramAndState(t *testing.T) {
	service := NewService(nil, nil, nil, nil, nil, nil)
	if _, err := service.PortalFor("NOPE", "MO"); err == nil {
		t.Fatal("PortalFor(unknown program) should fail, not route")
	}
	if _, err := service.PortalFor("SNAP", "XX"); err == nil {
		t.Fatal("PortalFor(unknown state) should fail, not route")
	}
}

// The registry pins the invariant that nothing unverified can leak a URL,
// across the whole program/state matrix for states with no verified entry.
// States that have gained verified entries (DC, MO, NY, ...) are covered by
// TestPortalVerifiedEntriesReturnURL instead.
func TestPortalNoInventedURLsAcrossMatrix(t *testing.T) {
	service := NewService(nil, nil, nil, nil, nil, nil)
	states := []string{"AL", "AK", "CA", "TX", "WY"}
	for _, program := range []string{"SNAP", "WIC", "MEDICAID", "LIHEAP", "TANF", "VA", "SSI"} {
		for _, state := range states {
			portal, err := service.PortalFor(program, state)
			if err != nil {
				t.Fatalf("PortalFor(%q, %q) error = %v", program, state, err)
			}
			if portal.URL != nil {
				t.Fatalf("PortalFor(%q, %q): URL %q is not verified — must be null", program, state, *portal.URL)
			}
			if portal.Verified {
				t.Fatalf("PortalFor(%q, %q): verified must be false", program, state)
			}
			if portal.FallbackGuidance == "" {
				t.Fatalf("PortalFor(%q, %q): guidance must not be empty", program, state)
			}
		}
	}
}

// Every row in the verified registry must resolve through PortalFor with
// verified=true, the exact registered URL, and no fallback guidance. This
// walks the whole table so a wiring bug (wrong program/state key, dropped
// row) fails loudly.
func TestPortalVerifiedEntriesReturnURL(t *testing.T) {
	service := NewService(nil, nil, nil, nil, nil, nil)
	if len(verifiedEntries) == 0 {
		t.Fatal("verifiedEntries is empty")
	}
	seen := map[string]bool{}
	for _, e := range verifiedEntries {
		key := e.program + "/" + e.state
		if seen[key] {
			t.Fatalf("duplicate registry row for %s", key)
		}
		seen[key] = true
		portal, err := service.PortalFor(e.program, e.state)
		if err != nil {
			t.Fatalf("PortalFor(%q, %q) error = %v", e.program, e.state, err)
		}
		if !portal.Verified {
			t.Fatalf("PortalFor(%q, %q): verified = false, want true", e.program, e.state)
		}
		if portal.URL == nil {
			t.Fatalf("PortalFor(%q, %q): URL is null, want %q", e.program, e.state, e.url)
		}
		if *portal.URL != e.url {
			t.Fatalf("PortalFor(%q, %q): URL = %q, want %q", e.program, e.state, *portal.URL, e.url)
		}
		if portal.FallbackGuidance != "" {
			t.Fatalf("PortalFor(%q, %q): guidance should be empty when verified, got %q", e.program, e.state, portal.FallbackGuidance)
		}
		if portal.Program != e.program || portal.State != e.state {
			t.Fatalf("PortalFor(%q, %q): portal = %+v", e.program, e.state, portal)
		}
	}
}

// Spot checks with hardcoded expected URLs, so a data-entry mistake in the
// registry table itself (not just the wiring) fails loudly.
func TestPortalVerifiedSpotChecks(t *testing.T) {
	service := NewService(nil, nil, nil, nil, nil, nil)
	cases := []struct{ program, state, wantURL string }{
		{"SNAP", "MO", "https://mydss.mo.gov/apply"},
		{"SNAP", "NJ", "https://www.mynjhelps.gov"},
		{"SNAP", "PA", "http://www.compass.state.pa.us"},
		{"MEDICAID", "CO", "https://colorado.gov/PEAK"},
		{"TANF", "NY", "https://mybenefits.ny.gov"},
		{"LIHEAP", "NM", "https://yes.nm.gov"},
		{"WIC", "WV", "https://dhhr.wv.gov/WIC"},
		{"WIC", "GA", "https://gateway.ga.gov/"},
		{"SNAP", "WI", "https://access.wi.gov"},
		{"SNAP", "NC", "https://epass.nc.gov"},
	}
	for _, c := range cases {
		portal, err := service.PortalFor(c.program, c.state)
		if err != nil {
			t.Fatalf("PortalFor(%q, %q) error = %v", c.program, c.state, err)
		}
		if !portal.Verified || portal.URL == nil || *portal.URL != c.wantURL {
			got := "<nil>"
			if portal.URL != nil {
				got = *portal.URL
			}
			t.Fatalf("PortalFor(%q, %q): verified=%v URL=%q, want verified=true URL=%q",
				c.program, c.state, portal.Verified, got, c.wantURL)
		}
	}
}
