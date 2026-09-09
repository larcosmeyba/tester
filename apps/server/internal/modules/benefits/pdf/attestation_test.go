package pdf

import (
	"bytes"
	"testing"
)

// Which boxes are the applicant's own act, and which are ordinary answers.
//
// A false positive here costs a mapping author one line of JSON. A false
// negative means Help The Hive signed, initialled or certified something in
// somebody else's name, so the patterns lean towards catching too much — except
// where catching too much would itself be wrong.

func TestAttestationsAreRecognisedFromTheFieldName(t *testing.T) {
	cases := []struct {
		name string
		want AttestationKind
	}{
		{"ApplicantSignature", AttestationSignature},
		{"form1[0].P8[0].SignHere[0]", AttestationSignature},
		{"Date_Signed", AttestationDateSigned},
		{"dateOfSignature", AttestationDateSigned},
		{"Initials", AttestationInitials},
		{"I_certify_the_above_is_true", AttestationCertification},
		{"consentToRelease", AttestationCertification},
	}
	for _, test := range cases {
		if got := classifyAttestation(FieldText, test.name, ""); got != test.want {
			t.Errorf("%s: expected %q, got %q", test.name, test.want, got)
		}
	}
}

// On most government forms the field name says nothing, and the printed label
// is the only evidence.
func TestAttestationsAreRecognisedFromThePrintedLabel(t *testing.T) {
	cases := []struct {
		label string
		want  AttestationKind
	}{
		{"Your signature", AttestationSignature},
		{"Date signed", AttestationDateSigned},
		{"Initials", AttestationInitials},
		{"I declare under penalty of perjury that the above is true", AttestationCertification},
		{"I understand that giving false information may be a crime", AttestationCertification},
	}
	for _, test := range cases {
		if got := classifyAttestation(FieldText, "Text47", test.label); got != test.want {
			t.Errorf("%q: expected %q, got %q", test.label, test.want, got)
		}
	}
}

// A signature field type is an attestation whatever it is called.
func TestASignatureFieldTypeIsAlwaysAnAttestation(t *testing.T) {
	if got := classifyAttestation(FieldSignature, "Text12", ""); got != AttestationSignature {
		t.Fatalf("expected a signature field to be recognised, got %q", got)
	}
}

// "Date signed" contains "signed", and the more specific reading is the useful
// one: it tells a reviewer what kind of box it is.
func TestDateSignedIsNotReportedAsASignature(t *testing.T) {
	if got := classifyAttestation(FieldText, "DateSigned", "Date signed"); got != AttestationDateSigned {
		t.Fatalf("expected date_signed, got %q", got)
	}
}

// A middle initial is part of somebody's name. Refusing to fill it would be its
// own kind of wrong, and this was a real false positive against Missouri's form.
func TestNameComponentsAreNotMistakenForAttestations(t *testing.T) {
	for _, test := range []struct{ name, label string }{
		{"middleInitial", "MI"},
		{"Middle Initial", "Middle initial"},
		{"applicantFirstName", "First name"},
		{"dateOfBirth", "Date of birth"},
		{"Home Address - City", "City"},
		{"monthlyRent", "Monthly rent"},
	} {
		if got := classifyAttestation(FieldText, test.name, test.label); got != AttestationNone {
			t.Errorf("%s/%s: expected an ordinary field, got %q", test.name, test.label, got)
		}
	}
}

func TestTheFixtureSignatureFieldsAreFlagged(t *testing.T) {
	inventory, err := Inspect(bytes.NewReader(buildFixture(t)))
	if err != nil {
		t.Fatalf("inspect: %v", err)
	}
	field, ok := inventory.FieldByName("signatureDate")
	if !ok {
		t.Fatal("the fixture should have a signature date field")
	}
	if !field.IsAttestation() {
		t.Fatalf("expected signatureDate flagged, got %q", field.Attestation)
	}
}
