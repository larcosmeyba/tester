package assist

import (
	"strings"
	"testing"

	"github.com/helpthehive/server/internal/modules/benefits/pdf"
)

func inventory() pdf.Inventory {
	return pdf.Inventory{
		PageCount:   1,
		HasAcroForm: true,
		Fields: []pdf.Field{
			{Name: "TxtFld1", Type: pdf.FieldText},
			{Name: "TxtFld2", Type: pdf.FieldText},
			{Name: "TxtFld3", Type: pdf.FieldText},
		},
	}
}

func TestASuggestionNamingAPathThatDoesNotExistIsDropped(t *testing.T) {
	// A model inventing a plausible-looking field path must not be able to get
	// it into a draft mapping, where a reviewer might skim past it.
	result, err := parseSuggestions(`{"suggestions":[
		{"formField":"TxtFld1","fieldPath":"applicant.last_name","confidence":"high"},
		{"formField":"TxtFld2","fieldPath":"applicant.mothers_maiden_name","confidence":"high"}
	]}`, inventory())
	if err != nil {
		t.Fatalf("parse: %v", err)
	}

	if len(result.Suggestions) != 1 || result.Suggestions[0].FieldPath != "applicant.last_name" {
		t.Fatalf("expected only the real path kept, got %+v", result.Suggestions)
	}
	if len(result.Rejected) != 1 || !strings.Contains(result.Rejected[0], "mothers_maiden_name") {
		t.Fatalf("expected the invented path reported as rejected, got %+v", result.Rejected)
	}
}

func TestASuggestionForAFieldTheFormDoesNotHaveIsDropped(t *testing.T) {
	result, err := parseSuggestions(`{"suggestions":[
		{"formField":"NoSuchField","fieldPath":"applicant.last_name","confidence":"high"}
	]}`, inventory())
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if len(result.Suggestions) != 0 {
		t.Fatalf("expected nothing kept, got %+v", result.Suggestions)
	}
	if len(result.Rejected) != 1 {
		t.Fatalf("expected the unknown form field reported, got %+v", result.Rejected)
	}
}

func TestADerivedPathIsNotOfferedAsAMapping(t *testing.T) {
	// A computed total is never something an applicant is asked for, so it is
	// not a valid target for a form field.
	result, err := parseSuggestions(`{"suggestions":[
		{"formField":"TxtFld1","fieldPath":"income.monthly_gross_total","confidence":"high"}
	]}`, inventory())
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if len(result.Suggestions) != 0 {
		t.Fatalf("a derived path must not be suggested as an input mapping, got %+v", result.Suggestions)
	}
}

func TestFieldsWithNoSuggestionAreReportedAsUnmapped(t *testing.T) {
	// The honest answer for a field the model could not place is "I do not
	// know", which is what a reviewer needs to see.
	result, err := parseSuggestions(`{"suggestions":[
		{"formField":"TxtFld1","fieldPath":"applicant.last_name","confidence":"high"}
	]}`, inventory())
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if len(result.Unmapped) != 2 {
		t.Fatalf("expected the two unplaced fields listed, got %+v", result.Unmapped)
	}
}

func TestAFencedReplyIsStillRead(t *testing.T) {
	result, err := parseSuggestions("```json\n{\"suggestions\":[{\"formField\":\"TxtFld1\",\"fieldPath\":\"applicant.last_name\",\"confidence\":\"low\"}]}\n```", inventory())
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if len(result.Suggestions) != 1 {
		t.Fatalf("expected the fenced reply parsed, got %+v", result.Suggestions)
	}
}

func TestAReplyThatIsNotJSONIsAnErrorNotAGuess(t *testing.T) {
	if _, err := parseSuggestions("I think field one is the last name.", inventory()); err == nil {
		t.Fatal("expected prose to be rejected rather than interpreted")
	}
}

// The prompt is the only thing that reaches a model, so what it contains is
// worth asserting rather than trusting.
func TestThePromptDescribesOnlyTheBlankForm(t *testing.T) {
	prompt, err := buildPrompt(inventory())
	if err != nil {
		t.Fatalf("build prompt: %v", err)
	}
	for _, mustNotAppear := range []string{"Rivera", "123-45-6789", "user-", "ssn_encrypted"} {
		if strings.Contains(prompt, mustNotAppear) {
			t.Errorf("the prompt contains %q; only a blank form's structure may be sent", mustNotAppear)
		}
	}
	if !strings.Contains(prompt, "TxtFld1") {
		t.Error("the prompt should describe the form's fields")
	}
	if !strings.Contains(prompt, "applicant.last_name") {
		t.Error("the prompt should list the vocabulary the model must choose from")
	}
	if strings.Contains(prompt, "income.monthly_gross_total") {
		t.Error("computed paths should not be offered to the model as mapping targets")
	}
}
