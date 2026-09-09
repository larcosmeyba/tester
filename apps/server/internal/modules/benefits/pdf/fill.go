package pdf

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"

	"github.com/pdfcpu/pdfcpu/pkg/api"
	"github.com/pdfcpu/pdfcpu/pkg/pdfcpu/form"
)

// Assignment is one value destined for one named AcroForm field.
type Assignment struct {
	// Ref is the mapping field id, used only in error messages.
	Ref     string
	Name    string
	Type    FieldType
	Text    string
	Checked bool
}

// Fill writes values into a fillable form and returns the result, still
// fillable. This is the draft the applicant reviews: they can correct it in any
// PDF reader before approving, and approving is what flattens it.
//
// Every assignment is checked against the template's own field inventory first.
// A name the form does not have, a type that does not match, or a choice the
// field does not offer is an error here rather than a value that quietly fails
// to appear on a submitted application.
func Fill(rs io.ReadSeeker, assignments []Assignment) ([]byte, error) {
	inventory, err := Inspect(rs)
	if err != nil {
		return nil, err
	}
	if !inventory.HasAcroForm {
		return nil, fmt.Errorf("this template has no fillable form; it needs a flat mapping with coordinates")
	}
	if err := VerifyAssignments(inventory, assignments); err != nil {
		return nil, err
	}
	if _, err := rs.Seek(0, io.SeekStart); err != nil {
		return nil, err
	}

	formData, err := formDataFor(inventory, assignments)
	if err != nil {
		return nil, err
	}
	payload, err := json.Marshal(form.FormGroup{Forms: []form.Form{formData}})
	if err != nil {
		return nil, err
	}

	var out bytes.Buffer
	if err := api.FillForm(rs, bytes.NewReader(payload), &out, configuration()); err != nil {
		return nil, fmt.Errorf("fill form: %w", err)
	}
	return out.Bytes(), nil
}

// VerifyAssignments checks a set of assignments against a template's real
// fields. It is exported because the mapping registry runs it at start-up: a
// mapping that addresses a field the form does not have should fail when the
// server boots, not when an applicant is waiting.
func VerifyAssignments(inventory Inventory, assignments []Assignment) error {
	for _, assignment := range assignments {
		field, ok := inventory.FieldByName(assignment.Name)
		if !ok {
			return fmt.Errorf("field %q: this form has no field named %q", assignment.Ref, assignment.Name)
		}
		if field.Type != assignment.Type {
			return fmt.Errorf("field %q: the mapping calls %q a %s but the form has it as a %s",
				assignment.Ref, assignment.Name, assignment.Type, field.Type)
		}
		switch field.Type {
		case FieldRadio, FieldDropdown, FieldListbox:
			if assignment.Text == "" || len(field.Options) == 0 {
				continue
			}
			if !containsString(field.Options, assignment.Text) {
				return fmt.Errorf("field %q: %q is not one of the values %q accepts (%v)",
					assignment.Ref, assignment.Text, assignment.Name, field.Options)
			}
		case FieldText:
			if field.MaxLen > 0 && len([]rune(assignment.Text)) > field.MaxLen {
				return fmt.Errorf("field %q: the value is %d characters and %q holds %d; add a truncate transform if that is genuinely what the form wants",
					assignment.Ref, len([]rune(assignment.Text)), assignment.Name, field.MaxLen)
			}
		}
	}
	return nil
}

func formDataFor(inventory Inventory, assignments []Assignment) (form.Form, error) {
	var formData form.Form
	for _, assignment := range assignments {
		field, _ := inventory.FieldByName(assignment.Name)
		switch assignment.Type {
		case FieldText:
			formData.TextFields = append(formData.TextFields, &form.TextField{
				Name: assignment.Name, Value: assignment.Text,
			})
		case FieldCheckbox:
			formData.CheckBoxes = append(formData.CheckBoxes, &form.CheckBox{
				Name: assignment.Name, Value: assignment.Checked,
			})
		case FieldRadio:
			formData.RadioButtonGroups = append(formData.RadioButtonGroups, &form.RadioButtonGroup{
				Name: assignment.Name, Value: assignment.Text, Options: field.Options,
			})
		case FieldDropdown:
			formData.ComboBoxes = append(formData.ComboBoxes, &form.ComboBox{
				Name: assignment.Name, Value: assignment.Text, Options: field.Options,
			})
		case FieldListbox:
			values := []string{}
			if assignment.Text != "" {
				values = []string{assignment.Text}
			}
			formData.ListBoxes = append(formData.ListBoxes, &form.ListBox{
				Name: assignment.Name, Values: values, Options: field.Options,
			})
		default:
			return form.Form{}, fmt.Errorf("field %q: %s fields cannot be filled", assignment.Ref, assignment.Type)
		}
	}
	return formData, nil
}

func containsString(haystack []string, needle string) bool {
	for _, candidate := range haystack {
		if candidate == needle {
			return true
		}
	}
	return false
}
