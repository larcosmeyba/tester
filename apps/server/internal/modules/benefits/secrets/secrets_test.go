package secrets

import (
	"bytes"
	"strings"
	"testing"
)

func testCipher(t *testing.T) *Cipher {
	t.Helper()
	c, err := NewCipher(bytes.Repeat([]byte{7}, 32))
	if err != nil {
		t.Fatalf("new cipher: %v", err)
	}
	return c
}

func TestSealAndOpenRoundTrip(t *testing.T) {
	c := testCipher(t)
	sealed, err := c.Seal("user-1", "applicant.ssn", "", "123456789")
	if err != nil {
		t.Fatalf("seal: %v", err)
	}
	if bytes.Contains(sealed, []byte("123456789")) {
		t.Fatal("the plaintext is still visible in the ciphertext")
	}
	got, err := c.Open("user-1", "applicant.ssn", "", sealed)
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	if got != "123456789" {
		t.Fatalf("expected the original value back, got %q", got)
	}
}

// A ciphertext lifted from one applicant's row must not open on another's.
// Without this, a bug that crossed rows would put one household's Social
// Security number onto a different household's application.
func TestCiphertextIsBoundToItsUserAndField(t *testing.T) {
	c := testCipher(t)
	sealed, err := c.Seal("user-1", "applicant.ssn", "", "123456789")
	if err != nil {
		t.Fatalf("seal: %v", err)
	}

	for _, moved := range []struct{ name, user, path, row string }{
		{"another user", "user-2", "applicant.ssn", ""},
		{"another field", "user-1", "benefits.snap_case_number", ""},
		{"another group row", "user-1", "applicant.ssn", "row-2"},
	} {
		if _, err := c.Open(moved.user, moved.path, moved.row, sealed); err == nil {
			t.Errorf("a ciphertext moved to %s should not decrypt", moved.name)
		}
	}
}

func TestSealIsNotDeterministic(t *testing.T) {
	c := testCipher(t)
	first, _ := c.Seal("user-1", "applicant.ssn", "", "123456789")
	second, _ := c.Seal("user-1", "applicant.ssn", "", "123456789")
	// Identical ciphertexts would let anyone with database access tell that two
	// applicants share a Social Security number without decrypting anything.
	if bytes.Equal(first, second) {
		t.Fatal("sealing the same value twice produced the same ciphertext")
	}
}

func TestMissingKeyIsAnErrorNotPlaintext(t *testing.T) {
	var absent *Cipher
	if absent.Available() {
		t.Fatal("a nil cipher must not report itself as available")
	}
	if _, err := absent.Seal("u", "applicant.ssn", "", "123456789"); err != ErrNoKey {
		t.Fatalf("expected ErrNoKey rather than a plaintext fallback, got %v", err)
	}
}

func TestHintNeverShowsTheWholeValue(t *testing.T) {
	if got := Hint("123456789"); got != "*** 6789" {
		t.Fatalf("expected only the last four digits, got %q", got)
	}
	if got := Hint("12"); strings.Contains(got, "1") {
		t.Fatalf("a short value must be masked entirely, got %q", got)
	}
}

func TestKeyMustBe32Bytes(t *testing.T) {
	if _, err := NewCipher([]byte("too short")); err == nil {
		t.Fatal("expected a short key to be rejected")
	}
}
