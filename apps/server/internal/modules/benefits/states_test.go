package benefits

import "testing"

func TestNormalizeState(t *testing.T) {
	cases := []struct {
		in, want string
	}{
		{"CA", "CA"},
		{"ca", "CA"},
		{"California", "CA"},
		{"california", "CA"},
		{"  California  ", "CA"},
		{"New York", "NY"},
		{"texas", "TX"},
		{"DC", "DC"},
		{"District of Columbia", "DC"},
		// Unknown input passes through upper-cased; callers that already
		// send codes see no behaviour change.
		{"XX", "XX"},
	}
	for _, tc := range cases {
		if got := normalizeState(tc.in); got != tc.want {
			t.Errorf("normalizeState(%q) = %q, want %q", tc.in, got, tc.want)
		}
	}
}
