package benefits

import (
	"fmt"
	"io"

	domain "github.com/helpthehive/server/internal/domain/benefits"
	"github.com/helpthehive/server/internal/modules/benefits/pdf"
)

// Rendering turns a resolution into a PDF. It adds no values of its own: what
// is drawn is exactly what internal/domain/benefits decided, and anything that
// cannot be drawn comes back as a field problem rather than as a silently
// missing box.

// Rendered is a produced document and any field that could not be placed on it.
type Rendered struct {
	Bytes    []byte
	Problems []domain.FieldProblem
}

// RenderDraft produces the version the applicant reviews. For a fillable form
// that is a still-fillable PDF, so they can correct it in any reader before
// approving; for a flat form the values are drawn on, because there is nothing
// to fill.
func RenderDraft(form *Form, resolution domain.Resolution) (Rendered, error) {
	return render(form, resolution, false)
}

// RenderFinal produces the flattened document, after the applicant has approved
// it. Nothing can edit what it says.
func RenderFinal(form *Form, resolution domain.Resolution) (Rendered, error) {
	return render(form, resolution, true)
}

func render(form *Form, resolution domain.Resolution, final bool) (Rendered, error) {
	template, err := form.OpenTemplate()
	if err != nil {
		return Rendered{}, err
	}
	defer template.Close()

	switch form.Mapping.Template.Kind {
	case domain.TemplateAcroForm:
		return renderAcroForm(form, template, resolution, final)
	case domain.TemplateFlat:
		return renderFlat(form, template, resolution)
	}
	return Rendered{}, fmt.Errorf("form %s: unsupported template kind %q", form.Key(), form.Mapping.Template.Kind)
}

func renderAcroForm(form *Form, template io.ReadSeeker, resolution domain.Resolution, final bool) (Rendered, error) {
	assignments := make([]pdf.Assignment, 0, len(resolution.Filled))
	var problems []domain.FieldProblem

	for _, filled := range resolution.Filled {
		assignment := pdf.Assignment{
			Ref:     filled.FieldID,
			Name:    filled.Target.Name,
			Type:    templateFieldType(filled.Target.Type),
			Text:    filled.Text,
			Checked: filled.Checked,
		}
		// Checked individually so one bad value costs one box rather than the
		// whole application.
		if err := pdf.VerifyAssignments(form.Inventory, []pdf.Assignment{assignment}); err != nil {
			problems = append(problems, domain.FieldProblem{
				FieldID: filled.FieldID, FieldPath: filled.FieldPath, Reason: err.Error(),
			})
			continue
		}
		assignments = append(assignments, assignment)
	}

	var bytes []byte
	var err error
	if final {
		bytes, err = pdf.Flatten(template, assignments, pdf.FlattenOptions{})
	} else {
		bytes, err = pdf.Fill(template, assignments)
	}
	if err != nil {
		return Rendered{}, err
	}
	return Rendered{Bytes: bytes, Problems: problems}, nil
}

func renderFlat(form *Form, template io.ReadSeeker, resolution domain.Resolution) (Rendered, error) {
	placements := make([]pdf.Placement, 0, len(resolution.Filled))
	var problems []domain.FieldProblem

	for _, filled := range resolution.Filled {
		placement, err := placementFor(filled)
		if err != nil {
			problems = append(problems, domain.FieldProblem{
				FieldID: filled.FieldID, FieldPath: filled.FieldPath, Reason: err.Error(),
			})
			continue
		}
		if placement == nil {
			continue
		}
		if err := pdf.CheckPlacement(*placement); err != nil {
			problems = append(problems, domain.FieldProblem{
				FieldID: filled.FieldID, FieldPath: filled.FieldPath, Reason: err.Error(),
			})
			continue
		}
		placements = append(placements, *placement)
	}

	// A flat form has no fields to edit, so its draft and its final document are
	// the same picture. Approval is what stops it changing, not the rendering.
	bytes, err := pdf.Overlay(template, placements)
	if err != nil {
		return Rendered{}, err
	}
	return Rendered{Bytes: bytes, Problems: problems}, nil
}

func placementFor(filled domain.FilledField) (*pdf.Placement, error) {
	target := filled.Target
	if target.Rect == nil {
		return nil, fmt.Errorf("field %q has no rectangle to draw in", filled.FieldID)
	}

	placement := pdf.Placement{
		Ref:         filled.FieldID,
		Page:        target.Page,
		Rect:        pdf.Rect{X: target.Rect.X, Y: target.Rect.Y, W: target.Rect.W, H: target.Rect.H},
		Align:       target.Align,
		ShrinkToFit: target.ShrinkToFit,
	}
	if target.Font != nil {
		placement.Font = target.Font.Name
		placement.Size = target.Font.Size
	}

	switch target.Type {
	case domain.TargetCheckmark, domain.TargetCheckbox:
		if !filled.Checked {
			return nil, nil
		}
		glyph := target.Glyph
		if glyph == "" {
			glyph = pdf.CheckGlyph
		}
		placement.Glyph = glyph
	default:
		if filled.Text == "" {
			return nil, nil
		}
		placement.Text = filled.Text
	}
	return &placement, nil
}
