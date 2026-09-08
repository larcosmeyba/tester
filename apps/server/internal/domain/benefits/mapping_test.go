package benefits

import (
	"errors"
	"strings"
	"testing"
)

func baseMapping() *FormMapping {
	return &FormMapping{
		SchemaVersion:     MappingSchemaVersion,
		ID:                "us-xx-snap",
		Program:           "SNAP",
		FormVersion:       "2026.01",
		Revision:          1,
		VocabularyVersion: VocabularyVersion,
		Template:          TemplateRef{Kind: TemplateAcroForm, File: "t.pdf", SHA256: strings.Repeat("a", 64), PageCount: 2},
		Fields: []FieldMapping{{
			ID: "last", Target: Target{Type: TargetText, Name: "Last"},
			Source: SourceRef{FieldPath: "applicant.last_name"},
		}},
	}
}

func expectInvalid(t *testing.T, mapping *FormMapping, want string) {
	t.Helper()
	err := mapping.Validate()
	if err == nil {
		t.Fatalf("expected the mapping to be rejected for %s", want)
	}
	if !errors.Is(err, ErrInvalidMapping) {
		t.Fatalf("expected ErrInvalidMapping, got %v", err)
	}
	if !strings.Contains(err.Error(), want) {
		t.Fatalf("expected the error to mention %q, got %v", want, err)
	}
}

func TestValidMappingPasses(t *testing.T) {
	if err := baseMapping().Validate(); err != nil {
		t.Fatalf("expected a valid mapping to pass, got %v", err)
	}
}

func TestMappingRejectsUnknownFieldPath(t *testing.T) {
	mapping := baseMapping()
	mapping.Fields[0].Source.FieldPath = "applicant.favourite_colour"
	expectInvalid(t, mapping, "not in vocabulary")
}

func TestMappingRejectsVocabularyVersionDrift(t *testing.T) {
	mapping := baseMapping()
	mapping.VocabularyVersion = VocabularyVersion + 1
	expectInvalid(t, mapping, "vocabularyVersion")
}

func TestMappingRejectsTwoFieldsWritingTheSameBox(t *testing.T) {
	mapping := baseMapping()
	mapping.Fields = append(mapping.Fields, FieldMapping{
		ID: "last_again", Target: Target{Type: TargetText, Name: "Last"},
		Source: SourceRef{FieldPath: "applicant.first_name"},
	})
	expectInvalid(t, mapping, "already written")
}

func TestMappingRejectsRepeatingPathWithoutARepeat(t *testing.T) {
	mapping := baseMapping()
	mapping.Fields[0].Source.FieldPath = "household.members[].last_name"
	expectInvalid(t, mapping, "declares no repeat")
}

func TestMappingRejectsAValueMapWithAHole(t *testing.T) {
	mapping := baseMapping()
	mapping.Fields[0] = FieldMapping{
		ID: "citizen", Target: Target{Type: TargetRadio, Name: "Citizen"},
		Source:   SourceRef{FieldPath: "applicant.is_us_citizen"},
		ValueMap: map[string]string{"true": "Yes"},
	}
	expectInvalid(t, mapping, "valueMap does not cover")
}

func TestMappingRejectsANeverFillFieldThatStillHasASource(t *testing.T) {
	mapping := baseMapping()
	mapping.Fields[0].FillPolicy = FillNever
	expectInvalid(t, mapping, "fillPolicy never")
}

func TestFlatMappingNeedsGeometryAndAcroFormNeedsNames(t *testing.T) {
	flat := baseMapping()
	flat.Template.Kind = TemplateFlat
	expectInvalid(t, flat, "needs target.rect")

	acro := baseMapping()
	acro.Fields[0].Target.Name = ""
	expectInvalid(t, acro, "needs target.name")
}

func TestFlatMappingRejectsAPagePastTheTemplate(t *testing.T) {
	mapping := baseMapping()
	mapping.Template.Kind = TemplateFlat
	mapping.Fields[0].Target = Target{
		Type: TargetText, Page: 9,
		Rect: &Rect{X: 10, Y: 10, W: 100, H: 12},
		Font: &FontRef{Name: "Helvetica", Size: 10},
	}
	expectInvalid(t, mapping, "past the template's 2 pages")
}

func TestParseMappingRejectsUnknownKeys(t *testing.T) {
	// A typo in a mapping file is a box that silently never gets filled, so the
	// parser refuses to skip past anything it does not recognise.
	_, err := ParseMapping([]byte(`{"schemaVersion":1,"id":"x","feildCode":"typo"}`))
	if err == nil || !errors.Is(err, ErrInvalidMapping) {
		t.Fatalf("expected a typo to be rejected, got %v", err)
	}
}

func TestDerivedPathsCannotBeSetDirectly(t *testing.T) {
	profile := NewProfile("u1")
	err := profile.Set("income.monthly_gross_total", Money(100000, SourceUser))
	if !errors.Is(err, ErrDerivedFieldPath) {
		t.Fatalf("expected a derived path to reject a direct write, got %v", err)
	}
}

func TestProfileRejectsAWrongKindAndAnInvalidChoice(t *testing.T) {
	profile := NewProfile("u1")
	if err := profile.Set("applicant.date_of_birth", Text("yesterday", SourceUser)); err == nil {
		t.Fatal("expected a date field to reject text")
	}
	if err := profile.Set("housing.status", Choice("houseboat", SourceUser)); !errors.Is(err, ErrInvalidValue) {
		t.Fatal("expected an off-vocabulary choice to be rejected")
	}
}

// A Value must not be able to leak its contents into a log line through
// fmt's default struct formatting.
func TestValueDoesNotExposeItsContents(t *testing.T) {
	ssn := Text("123456789", SourceUser)
	if got := ssn.Redacted(); strings.Contains(got, "123456789") {
		t.Fatalf("Redacted leaked the value: %q", got)
	}
	var stringer any = ssn
	if _, ok := stringer.(interface{ String() string }); ok {
		t.Fatal("Value must not implement String: it would put answers into log lines")
	}
}
