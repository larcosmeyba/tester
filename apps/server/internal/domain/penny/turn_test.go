package penny

import "testing"

func TestJurisdictionResolvesStates(t *testing.T) {
	cases := map[string]string{
		"43215": "US-OH", // Columbus
		"78701": "US-TX", // Austin
		"10001": "US-NY", // Manhattan
		"99501": "US-AK", // Anchorage
		"02101": "US-MA", // Boston
	}
	for zip, want := range cases {
		if got := Jurisdiction(zip); got != want {
			t.Errorf("Jurisdiction(%q) = %q, want %q", zip, got, want)
		}
	}
}

// An unknown ZIP resolves to nothing rather than to a guess. Retrieval then
// falls back to federal guidance, which is the safe direction to fail in.
func TestJurisdictionRefusesToGuess(t *testing.T) {
	for _, zip := range []string{"", "123", "abcde", "00000"} {
		if got := Jurisdiction(zip); got != "" {
			t.Errorf("Jurisdiction(%q) = %q, want an empty result", zip, got)
		}
	}
}
