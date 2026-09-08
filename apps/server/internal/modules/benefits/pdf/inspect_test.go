package pdf

import (
	"bytes"
	"testing"
)

func TestInspectFindsEveryFieldTypeAcrossPages(t *testing.T) {
	inventory, err := Inspect(bytes.NewReader(buildFixture(t)))
	if err != nil {
		t.Fatalf("inspect: %v", err)
	}

	if inventory.PageCount != 2 {
		t.Fatalf("expected 2 pages, got %d", inventory.PageCount)
	}
	if !inventory.HasAcroForm {
		t.Fatal("expected the fixture to have a fillable form")
	}

	want := map[string]FieldType{
		"applicantLastName":  FieldText,
		"applicantFirstName": FieldText,
		"dateOfBirth":        FieldText,
		"monthlyIncome":      FieldText,
		"paysHeating":        FieldCheckbox,
		"paysElectricity":    FieldCheckbox,
		"isCitizen":          FieldRadio,
		"residenceState":     FieldDropdown,
		"housingStatus":      FieldListbox,
		"member1Name":        FieldText,
		"member2Name":        FieldText,
		"signatureDate":      FieldText,
	}

	for name, wantType := range want {
		field, ok := inventory.FieldByName(name)
		if !ok {
			t.Errorf("field %q was not found; the inventory has %v", name, fieldNames(inventory))
			continue
		}
		if field.Type != wantType {
			t.Errorf("field %q: expected type %s, got %s", name, wantType, field.Type)
		}
		if len(field.Widgets) == 0 {
			t.Errorf("field %q has no widget, so flattening would have nowhere to draw it", name)
		}
	}
}

func TestInspectReportsThePageEachFieldIsOn(t *testing.T) {
	inventory, err := Inspect(bytes.NewReader(buildFixture(t)))
	if err != nil {
		t.Fatalf("inspect: %v", err)
	}

	first, _ := inventory.FieldByName("applicantLastName")
	if pages := first.Pages(); len(pages) != 1 || pages[0] != 1 {
		t.Errorf("expected the last name on page 1, got %v", pages)
	}
	second, _ := inventory.FieldByName("member1Name")
	if pages := second.Pages(); len(pages) != 1 || pages[0] != 2 {
		t.Errorf("expected member 1 on page 2, got %v", pages)
	}
}

func TestInspectReadsTheOptionsAFieldWillAccept(t *testing.T) {
	inventory, err := Inspect(bytes.NewReader(buildFixture(t)))
	if err != nil {
		t.Fatalf("inspect: %v", err)
	}

	state, _ := inventory.FieldByName("residenceState")
	if len(state.Options) != 4 || !containsString(state.Options, "CA") {
		t.Errorf("expected the state dropdown's four options, got %v", state.Options)
	}
	citizen, _ := inventory.FieldByName("isCitizen")
	if !containsString(citizen.Options, "Yes") || !containsString(citizen.Options, "No") {
		t.Errorf("expected the citizenship radio group to offer Yes and No, got %v", citizen.Options)
	}
}

func TestInspectRecordsWidgetGeometry(t *testing.T) {
	inventory, err := Inspect(bytes.NewReader(buildFixture(t)))
	if err != nil {
		t.Fatalf("inspect: %v", err)
	}
	field, _ := inventory.FieldByName("applicantLastName")
	rect := field.Widgets[0].Rect
	if rect.W <= 0 || rect.H <= 0 {
		t.Fatalf("a widget with no area cannot be flattened onto: %+v", rect)
	}
	// Origin is bottom-left, so a field near the top of a Letter page has a
	// large Y. Getting this backwards is the classic coordinate-mapping bug.
	if rect.Y < 400 {
		t.Fatalf("expected a bottom-left origin putting this field high on the page, got Y=%.1f", rect.Y)
	}
}

func fieldNames(inventory Inventory) []string {
	names := make([]string, 0, len(inventory.Fields))
	for _, field := range inventory.Fields {
		names = append(names, field.Name)
	}
	return names
}
