package pdf

import (
	"regexp"
	"strings"
)

// Recognising the boxes that are the applicant's to fill and nobody else's.
//
// A signature field is easy: it has a PDF field type of its own. The rest are
// not. "Initials", "Date signed", "I certify that the above is true" and
// "Print name of applicant" are ordinary text boxes and checkboxes, and nothing
// in the file marks them out. But putting a value in one is a different act
// from filling in an address: it is making an attestation in somebody's name.
//
// So they are found by what the form calls them, and a mapping that targets one
// is refused unless it declares fillPolicy "never". The detection is
// deliberately eager — a false positive costs a mapping author one line of
// JSON, and a false negative means Help The Hive signed something.

// AttestationKind says why a field is the applicant's to complete.
type AttestationKind string

const (
	AttestationNone AttestationKind = ""
	// AttestationSignature: a signature, however the form implements it.
	AttestationSignature AttestationKind = "signature"
	// AttestationInitials: initials beside a clause.
	AttestationInitials AttestationKind = "initials"
	// AttestationDateSigned: the date beside a signature. Filling it asserts
	// when the applicant signed, which only they know.
	AttestationDateSigned AttestationKind = "date_signed"
	// AttestationCertification: a declaration under penalty of perjury, a
	// consent, an acknowledgement.
	AttestationCertification AttestationKind = "certification"
)

var attestationPatterns = []struct {
	kind    AttestationKind
	pattern *regexp.Regexp
}{
	{AttestationSignature, regexp.MustCompile(`(?i)\bsignature\b|\bsign\s*here\b|\bsigned\s*by\b|\bsignature\s*date\b|\bsig\b`)},
	// "Initials" plural, or an instruction to initial. Deliberately not a bare
	// "initial": a middle initial is part of somebody's name, not an
	// attestation, and refusing to fill it would be its own kind of wrong.
	{AttestationInitials, regexp.MustCompile(`(?i)\binitials\b|\binitial\s+(here|below|each|this)\b|\bplease\s+initial\b`)},
	{AttestationDateSigned, regexp.MustCompile(`(?i)\bdate\s*signed\b|\bsigned\s*date\b|\bdate\s*of\s*signature\b`)},
	{AttestationCertification, regexp.MustCompile(`(?i)\bi\s+certify\b|\bcertif(y|ication|ies)\b|\bunder\s+penalty\s+of\s+perjury\b|\bi\s+declare\b|\bi\s+agree\b|\bi\s+understand\b|\battest\b|\backnowledge(ment|s)?\b|\bconsent\b|\bperjury\b`)},
}

// classifyAttestation decides whether a field is an attestation, from its PDF
// field type and from what the form prints beside it.
//
// Both are consulted because either can be the only evidence: a field named
// "Text47" with "Initials" printed next to it, and a field named
// "ApplicantSignature" with no printed label at all, are both real.
func classifyAttestation(fieldType FieldType, name, label string) AttestationKind {
	if fieldType == FieldSignature {
		return AttestationSignature
	}

	// The name is matched with separators normalised, so "Date_Signed" and
	// "dateSigned" read the same as "date signed".
	haystacks := []string{normaliseFieldName(name), strings.ToLower(label)}

	// A handful of name components read like attestations and are not.
	for _, haystack := range haystacks {
		for _, exempt := range []string{"middle initial", "mid initial", "initial of"} {
			if strings.Contains(haystack, exempt) {
				return AttestationNone
			}
		}
	}

	// Date-signed before signature: "Date signed" contains "signed", and the
	// more specific reading is the useful one.
	for _, kind := range []AttestationKind{
		AttestationDateSigned, AttestationInitials, AttestationSignature, AttestationCertification,
	} {
		for _, entry := range attestationPatterns {
			if entry.kind != kind {
				continue
			}
			for _, haystack := range haystacks {
				if haystack != "" && entry.pattern.MatchString(haystack) {
					return kind
				}
			}
		}
	}
	return AttestationNone
}

var nameSeparators = regexp.MustCompile(`[._\-\[\]()]+|(?:[a-z])(?:[A-Z])`)

// normaliseFieldName turns a PDF field name into something word patterns can be
// matched against: "form1[0].P8[0].DateSigned[0]" becomes "form1 0 p8 0 date signed 0".
func normaliseFieldName(name string) string {
	var out strings.Builder
	runes := []rune(name)
	for i, r := range runes {
		switch {
		case r == '.' || r == '_' || r == '-' || r == '[' || r == ']' || r == '(' || r == ')':
			out.WriteByte(' ')
		default:
			// Split camel case so "DateSigned" reads as two words.
			if i > 0 && r >= 'A' && r <= 'Z' && runes[i-1] >= 'a' && runes[i-1] <= 'z' {
				out.WriteByte(' ')
			}
			out.WriteRune(r)
		}
	}
	return strings.ToLower(out.String())
}
