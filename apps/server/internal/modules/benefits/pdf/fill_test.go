package pdf

import (
	"bytes"
	"reflect"
	"strconv"
	"strings"
	"testing"

	"github.com/pdfcpu/pdfcpu/pkg/api"
	"github.com/pdfcpu/pdfcpu/pkg/pdfcpu/form"
)

func exportedForm(t *testing.T, data []byte) form.Form {
	t.Helper()
	group, err := api.ExportForm(bytes.NewReader(data), "test.pdf", configuration())
	if err != nil {
		t.Fatalf("export form: %v", err)
	}
	if len(group.Forms) != 1 {
		t.Fatalf("expected one form, got %d", len(group.Forms))
	}
	return group.Forms[0]
}

func textFieldValue(t *testing.T, filled form.Form, name string) string {
	t.Helper()
	for _, field := range filled.TextFields {
		if field.Name == name {
			return field.Value
		}
	}
	t.Fatalf("no text field named %q in the filled form", name)
	return ""
}

func TestFillWritesEveryFieldType(t *testing.T) {
	fixture := buildFixture(t)

	out, err := Fill(bytes.NewReader(fixture), []Assignment{
		{Ref: "last", Name: "applicantLastName", Type: FieldText, Text: "RIVERA"},
		{Ref: "first", Name: "applicantFirstName", Type: FieldText, Text: "Ana"},
		{Ref: "dob", Name: "dateOfBirth", Type: FieldText, Text: "03/07/1988"},
		{Ref: "income", Name: "monthlyIncome", Type: FieldText, Text: "1,240.00"},
		{Ref: "heat", Name: "paysHeating", Type: FieldCheckbox, Checked: true},
		{Ref: "power", Name: "paysElectricity", Type: FieldCheckbox, Checked: false},
		{Ref: "citizen", Name: "isCitizen", Type: FieldRadio, Text: "Yes"},
		{Ref: "state", Name: "residenceState", Type: FieldDropdown, Text: "CA"},
		{Ref: "housing", Name: "housingStatus", Type: FieldListbox, Text: "rent"},
		{Ref: "member1", Name: "member1Name", Type: FieldText, Text: "Rivera, Mateo"},
	})
	if err != nil {
		t.Fatalf("fill: %v", err)
	}

	filled := exportedForm(t, out)

	if got := textFieldValue(t, filled, "applicantLastName"); got != "RIVERA" {
		t.Errorf("last name: expected RIVERA, got %q", got)
	}
	if got := textFieldValue(t, filled, "monthlyIncome"); got != "1,240.00" {
		t.Errorf("income: expected 1,240.00, got %q", got)
	}
	// A value on the second page proves multi-page filling, not just page one.
	if got := textFieldValue(t, filled, "member1Name"); got != "Rivera, Mateo" {
		t.Errorf("member 1: expected Rivera, Mateo, got %q", got)
	}

	for _, box := range filled.CheckBoxes {
		switch box.Name {
		case "paysHeating":
			if !box.Value {
				t.Error("the heating box should be ticked")
			}
		case "paysElectricity":
			if box.Value {
				t.Error("the electricity box should be left unticked")
			}
		}
	}
	for _, group := range filled.RadioButtonGroups {
		if group.Name == "isCitizen" && group.Value != "Yes" {
			t.Errorf("citizenship: expected Yes, got %q", group.Value)
		}
	}
	for _, box := range filled.ComboBoxes {
		if box.Name == "residenceState" && box.Value != "CA" {
			t.Errorf("state: expected CA, got %q", box.Value)
		}
	}
}

// The same profile and the same mapping must always produce the same form.
//
// Byte-for-byte equality is not the assertion, and deliberately so: pdfcpu
// stamps every write with a ModDate and a file ID, so two identical fills
// differ in a handful of metadata bytes. What must not differ is anything a
// caseworker would read — the field values and the page content — and that is
// what is checked here. The application record stores the hash of the document
// it actually produced, so reproducibility of the artifact does not depend on
// reproducibility of the bytes.
func TestFillIsDeterministicInEverythingThatAppearsOnTheForm(t *testing.T) {
	fixture := buildFixture(t)
	assignments := []Assignment{
		{Ref: "last", Name: "applicantLastName", Type: FieldText, Text: "RIVERA"},
		{Ref: "member1", Name: "member1Name", Type: FieldText, Text: "Rivera, Mateo"},
		{Ref: "heat", Name: "paysHeating", Type: FieldCheckbox, Checked: true},
		{Ref: "citizen", Name: "isCitizen", Type: FieldRadio, Text: "Yes"},
	}

	first, err := Fill(bytes.NewReader(fixture), assignments)
	if err != nil {
		t.Fatalf("fill: %v", err)
	}
	second, err := Fill(bytes.NewReader(fixture), assignments)
	if err != nil {
		t.Fatalf("fill again: %v", err)
	}

	if got, want := formValues(exportedForm(t, second)), formValues(exportedForm(t, first)); !reflect.DeepEqual(got, want) {
		t.Fatalf("the same input produced different field values:\n%v\nvs\n%v", got, want)
	}
	for page := 1; page <= 2; page++ {
		if !bytes.Equal(pageContent(t, first, page), pageContent(t, second, page)) {
			t.Fatalf("page %d rendered differently on a second identical fill", page)
		}
	}
}

// formValues flattens a filled form into a comparable map of what it says.
func formValues(filled form.Form) map[string]string {
	values := map[string]string{}
	for _, field := range filled.TextFields {
		values["text:"+field.Name] = field.Value
	}
	for _, field := range filled.CheckBoxes {
		values["checkbox:"+field.Name] = strconv.FormatBool(field.Value)
	}
	for _, field := range filled.RadioButtonGroups {
		values["radio:"+field.Name] = field.Value
	}
	for _, field := range filled.ComboBoxes {
		values["combo:"+field.Name] = field.Value
	}
	for _, field := range filled.ListBoxes {
		values["list:"+field.Name] = strings.Join(field.Values, ",")
	}
	return values
}

func TestFillRejectsAFieldTheFormDoesNotHave(t *testing.T) {
	_, err := Fill(bytes.NewReader(buildFixture(t)), []Assignment{
		{Ref: "typo", Name: "applicantSurname", Type: FieldText, Text: "RIVERA"},
	})
	if err == nil || !strings.Contains(err.Error(), "no field named") {
		t.Fatalf("expected a clear error naming the missing field, got %v", err)
	}
}

func TestFillRejectsAMismatchedFieldType(t *testing.T) {
	_, err := Fill(bytes.NewReader(buildFixture(t)), []Assignment{
		{Ref: "wrong", Name: "applicantLastName", Type: FieldCheckbox, Checked: true},
	})
	if err == nil || !strings.Contains(err.Error(), "the form has it as a text") {
		t.Fatalf("expected the type mismatch reported, got %v", err)
	}
}

func TestFillRejectsAChoiceTheFieldDoesNotOffer(t *testing.T) {
	_, err := Fill(bytes.NewReader(buildFixture(t)), []Assignment{
		{Ref: "state", Name: "residenceState", Type: FieldDropdown, Text: "ZZ"},
	})
	if err == nil || !strings.Contains(err.Error(), "is not one of the values") {
		t.Fatalf("expected an off-list dropdown value to be refused, got %v", err)
	}
}

func TestVerifyAssignmentsRunsWithoutFilling(t *testing.T) {
	// The registry calls this at start-up so a broken mapping fails when the
	// server boots rather than when an applicant is waiting on it.
	inventory, err := Inspect(bytes.NewReader(buildFixture(t)))
	if err != nil {
		t.Fatalf("inspect: %v", err)
	}
	if err := VerifyAssignments(inventory, []Assignment{
		{Ref: "ok", Name: "applicantLastName", Type: FieldText, Text: "Rivera"},
	}); err != nil {
		t.Fatalf("expected a valid assignment to verify, got %v", err)
	}
	if err := VerifyAssignments(inventory, []Assignment{
		{Ref: "bad", Name: "nope", Type: FieldText},
	}); err == nil {
		t.Fatal("expected an unknown field to fail verification")
	}
}
