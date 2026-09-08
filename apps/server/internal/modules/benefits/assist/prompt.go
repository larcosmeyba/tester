package assist

import (
	"encoding/json"
	"fmt"
	"sort"
	"strings"

	domain "github.com/helpthehive/server/internal/domain/benefits"
	"github.com/helpthehive/server/internal/modules/benefits/pdf"
)

const systemPrompt = `You help a benefits caseworker draft a mapping file.

You are given the field list of a BLANK government form and a fixed vocabulary
of field paths. For each form field, say which vocabulary path it most likely
corresponds to.

Each form field may come with a "label": the text printed next to that box on
the blank form. Where a label is present it is far better evidence than the
field's name, which on most government forms is meaningless.

Rules:
- Use only paths from the vocabulary given. Never invent one.
- If you are not confident about a field, leave it out. A missing suggestion is
  fine; a wrong one wastes a reviewer's time and risks a wrong answer on
  somebody's benefits application.
- Never suggest a mapping for a signature field or the date beside a signature.
- Reply with JSON only, in this shape, and nothing else:

{"suggestions":[{"formField":"...","fieldPath":"...","confidence":"high|medium|low","reason":"..."}]}`

// buildPrompt describes a blank form and the vocabulary.
//
// What it sends is worth being explicit about: field names, types, page
// numbers, dropdown options and character limits from a public, blank
// government PDF. No applicant, no household, no answer, no profile. There is
// no parameter here that could carry one.
func buildPrompt(inventory pdf.Inventory) (string, error) {
	type promptField struct {
		Name string `json:"name"`
		// Label is the text printed beside the box on the blank form. On most
		// government PDFs it is the only thing that identifies a field at all:
		// California's SNAP application calls 1,444 of its fields "Text1 PG 1"
		// and similar, and the printed label is what says which is the ZIP code.
		Label   string   `json:"label,omitempty"`
		Type    string   `json:"type"`
		Pages   []int    `json:"pages"`
		Options []string `json:"options,omitempty"`
		MaxLen  int      `json:"maxLen,omitempty"`
	}

	fields := make([]promptField, 0, len(inventory.Fields))
	for _, field := range inventory.Fields {
		if field.Type == pdf.FieldSignature {
			// Never offered for mapping: nothing may fill a signature.
			continue
		}
		fields = append(fields, promptField{
			Name:    field.Name,
			Label:   field.Label,
			Type:    string(field.Type),
			Pages:   field.Pages(),
			Options: field.Options,
			MaxLen:  field.MaxLen,
		})
	}

	encoded, err := json.MarshalIndent(fields, "", "  ")
	if err != nil {
		return "", err
	}

	var out strings.Builder
	fmt.Fprintf(&out, "Vocabulary (field path — what it holds):\n%s\n\n", vocabularyListing())
	fmt.Fprintf(&out, "Form fields (%d, across %d pages):\n%s\n", len(fields), inventory.PageCount, encoded)
	return out.String(), nil
}

func vocabularyListing() string {
	vocabulary := domain.Vocabulary()
	paths := make([]domain.FieldPath, 0, len(vocabulary))
	for path, spec := range vocabulary {
		if spec.Derived {
			// Computed totals are not something a form field is collected into.
			continue
		}
		paths = append(paths, path)
	}
	sort.Slice(paths, func(i, j int) bool { return paths[i] < paths[j] })

	var out strings.Builder
	for _, path := range paths {
		spec := vocabulary[path]
		fmt.Fprintf(&out, "%s (%s) — %s", path, spec.Kind, spec.Label)
		if len(spec.Choices) > 0 && len(spec.Choices) <= 12 {
			fmt.Fprintf(&out, " [%s]", strings.Join(spec.Choices, ", "))
		}
		out.WriteString("\n")
	}
	return out.String()
}
