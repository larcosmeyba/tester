package benefits

import (
	"errors"
	"testing"

	domain "github.com/helpthehive/server/internal/domain/benefits"
)

// The typed signature is the applicant's own act. The server never pre-fills
// it, and approval is refused while the name is blank or the attestation is
// not accepted — before anything is rendered or stored.

func TestValidateSignature(t *testing.T) {
	name, err := validateSignature("Jane Doe", true)
	if err != nil {
		t.Fatalf("validateSignature() error = %v", err)
	}
	if name != "Jane Doe" {
		t.Fatalf("name = %q, want the typed name", name)
	}
}

func TestValidateSignatureTrims(t *testing.T) {
	name, err := validateSignature("  Jane Doe\n", true)
	if err != nil {
		t.Fatalf("validateSignature() error = %v", err)
	}
	if name != "Jane Doe" {
		t.Fatalf("name = %q, want trimmed", name)
	}
}

func TestValidateSignatureBlankName(t *testing.T) {
	for _, name := range []string{"", "   ", "\t\n"} {
		if _, err := validateSignature(name, true); !errors.Is(err, domain.ErrSignatureRequired) {
			t.Fatalf("validateSignature(%q) = %v, want ErrSignatureRequired", name, err)
		}
	}
}

func TestValidateSignatureMissingAttestation(t *testing.T) {
	// The attestation is checked even when the name is fine: silence is not
	// consent, and a present name must not mask a missing attestation.
	if _, err := validateSignature("Jane Doe", false); !errors.Is(err, domain.ErrAttestationRequired) {
		t.Fatalf("validateSignature(unattested) = %v, want ErrAttestationRequired", err)
	}
	// A blank name fails on the name first — the more specific refusal.
	if _, err := validateSignature("", false); !errors.Is(err, domain.ErrSignatureRequired) {
		t.Fatalf("validateSignature(blank, unattested) = %v, want ErrSignatureRequired", err)
	}
}
