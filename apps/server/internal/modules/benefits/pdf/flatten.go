package pdf

import (
	"fmt"
	"io"

	"github.com/pdfcpu/pdfcpu/pkg/pdfcpu/form"
	"github.com/pdfcpu/pdfcpu/pkg/pdfcpu/model"
)

// CheckGlyph is what a ticked box becomes on a flattened form.
const CheckGlyph = "X"

// FlattenOptions tunes how filled values are drawn once the form is gone.
type FlattenOptions struct {
	// Font for flattened text. Defaults to Helvetica.
	Font string
	// Size for flattened text. Zero means "fit the field's own box", which is
	// what a form's own layout expects.
	Size float64
}

// Flatten produces the final, non-editable PDF from a blank template and the
// approved assignments.
//
// It works in two steps: remove the AcroForm outright, then redraw every value
// at the rectangle its widget occupied, using the same renderer that fills flat
// forms. So there is one text-drawing path in this package rather than two that
// could disagree, and the result is genuinely flat — not a form marked
// read-only, which a determined tool can still edit.
//
// The tradeoff, stated plainly: borders and background colours drawn by the
// widgets themselves disappear with them. On government forms the boxes and
// rules are almost always part of the page artwork, so this is invisible — but
// it is real, and every form should get a fixture test that renders it and
// confirms nothing was lost.
func Flatten(rs io.ReadSeeker, assignments []Assignment, options FlattenOptions) ([]byte, error) {
	inventory, err := Inspect(rs)
	if err != nil {
		return nil, err
	}
	if !inventory.HasAcroForm {
		return nil, fmt.Errorf("this template has no fillable form to flatten")
	}
	if err := VerifyAssignments(inventory, assignments); err != nil {
		return nil, err
	}

	placements, err := placementsFor(inventory, assignments, options)
	if err != nil {
		return nil, err
	}

	if _, err := rs.Seek(0, io.SeekStart); err != nil {
		return nil, err
	}
	ctx, err := readContext(rs)
	if err != nil {
		return nil, err
	}
	if err := removeForm(ctx); err != nil {
		return nil, err
	}
	if err := overlayContext(ctx, placements); err != nil {
		return nil, err
	}
	return writeContext(ctx)
}

// FlattenFlat finalises a form that never had fields to begin with. A flat
// template is already non-editable, so the approved values are simply drawn on.
func FlattenFlat(rs io.ReadSeeker, placements []Placement) ([]byte, error) {
	return Overlay(rs, placements)
}

func placementsFor(inventory Inventory, assignments []Assignment, options FlattenOptions) ([]Placement, error) {
	fontName := options.Font
	if fontName == "" {
		fontName = DefaultFont
	}

	var placements []Placement
	for _, assignment := range assignments {
		field, ok := inventory.FieldByName(assignment.Name)
		if !ok {
			return nil, fmt.Errorf("field %q: this form has no field named %q", assignment.Ref, assignment.Name)
		}
		ticked := false
		for _, widget := range field.Widgets {
			placement := Placement{
				Ref:         assignment.Ref,
				Page:        widget.Page,
				Rect:        widget.Rect,
				Font:        fontName,
				Size:        options.Size,
				ShrinkToFit: true,
			}
			if placement.Size <= 0 {
				placement.Size = fittedSize(widget.Rect)
			}
			switch assignment.Type {
			case FieldCheckbox:
				if !assignment.Checked {
					continue
				}
				placement.Glyph = CheckGlyph
			case FieldRadio:
				if assignment.Text == "" {
					continue
				}
				if widget.OnState != assignment.Text {
					continue
				}
				ticked = true
				placement.Glyph = CheckGlyph
			default:
				if assignment.Text == "" {
					continue
				}
				placement.Text = assignment.Text
			}
			placements = append(placements, placement)
		}
		// A selected radio option that matched no widget would vanish from the
		// flattened form without a trace. Refuse rather than lose it.
		if assignment.Type == FieldRadio && assignment.Text != "" && !ticked {
			return nil, fmt.Errorf("field %q: %q selects %q, but none of that group's buttons carry it as their on state (%v)",
				assignment.Ref, assignment.Name, assignment.Text, onStates(field))
		}
	}
	return placements, nil
}

func onStates(field Field) []string {
	states := make([]string, 0, len(field.Widgets))
	for _, widget := range field.Widgets {
		if widget.OnState != "" {
			states = append(states, widget.OnState)
		}
	}
	return states
}

// fittedSize picks a font size from the height of the box the form drew, so
// flattened text sits in its rule the way the form's designer intended.
//
// The range is narrow on purpose. Form fields vary in height for reasons that
// have nothing to do with type size — a dropdown is taller than a text rule on
// the same line — and letting the size follow the box exactly makes one answer
// tower over its neighbours on the flattened page. A caseworker reading a
// printed application should see one typeface at one size.
func fittedSize(rect Rect) float64 {
	size := rect.H * 0.62
	if size < 7 {
		size = 7
	}
	if size > 10 {
		size = 10
	}
	return size
}

// removeForm strips the AcroForm and every widget annotation, leaving the
// page's own artwork. What the applicant approved is then drawn back on as
// page content, which nothing can edit.
func removeForm(ctx *model.Context) error {
	if ctx.XRefTable.Form == nil {
		return nil
	}
	if _, err := form.RemoveFormFields(ctx, nil); err != nil {
		return fmt.Errorf("remove form fields: %w", err)
	}
	delete(ctx.RootDict, "AcroForm")
	ctx.XRefTable.Form = nil
	return nil
}
