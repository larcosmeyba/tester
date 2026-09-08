package assist

import (
	"context"
	"encoding/json"
	"fmt"
	"sort"
	"strings"

	domain "github.com/helpthehive/server/internal/domain/benefits"
	"github.com/helpthehive/server/internal/modules/benefits/pdf"
	"github.com/helpthehive/server/internal/modules/mealgen/provider"
)

// MaxSuggestionTokens caps the reply. A mapping draft for a long form is still
// a few thousand tokens; anything beyond this is a model that has lost the
// plot, and it is cheaper to fail than to parse.
const MaxSuggestionTokens = 4000

// Suggestion is one proposed mapping, for a person to accept or correct.
type Suggestion struct {
	// FormField is the PDF's own field name.
	FormField string `json:"formField"`
	// FieldPath is the Help The Hive path the model proposes. It is guaranteed
	// to exist in the vocabulary: anything else is dropped before you see it.
	FieldPath domain.FieldPath `json:"fieldPath"`
	// Confidence is the model's own claim, kept only so a reviewer can sort by
	// it. It is not used by anything.
	Confidence string `json:"confidence"`
	Reason     string `json:"reason,omitempty"`
}

// Result is what a suggestion run produced, including what was thrown away.
type Result struct {
	Suggestions []Suggestion
	// Rejected lists suggestions dropped because they named a path that does
	// not exist. It is reported rather than hidden: a model inventing field
	// paths is worth knowing about.
	Rejected []string
	// Unmapped lists form fields the model had no proposal for. These are the
	// ones a person has to work out, which is the honest answer.
	Unmapped []string
}

// Suggester proposes mappings. It holds a provider and nothing else — no store,
// no profile, no way to reach applicant data.
type Suggester struct {
	provider provider.Provider
}

func NewSuggester(p provider.Provider) *Suggester {
	return &Suggester{provider: p}
}

// Suggest proposes a field path for each of a blank form's fields.
//
// The inventory passed in comes from pdf.Inspect of the blank official PDF. It
// contains the form's structure and nothing else; there is deliberately no
// parameter here through which applicant data could arrive.
func (s *Suggester) Suggest(ctx context.Context, inventory pdf.Inventory) (Result, error) {
	if s == nil || s.provider == nil {
		return Result{}, provider.ErrNoProvider
	}
	if len(inventory.Fields) == 0 {
		return Result{}, fmt.Errorf("this form has no fields to map")
	}

	prompt, err := buildPrompt(inventory)
	if err != nil {
		return Result{}, err
	}

	response, err := s.provider.Complete(ctx, provider.Request{
		System:    systemPrompt,
		User:      prompt,
		MaxTokens: MaxSuggestionTokens,
	})
	if err != nil {
		return Result{}, err
	}
	return parseSuggestions(response.Text, inventory)
}

// parseSuggestions reads the model's reply and keeps only what is real: a
// suggestion naming a form field the PDF does not have, or a field path the
// vocabulary does not define, is discarded rather than corrected.
func parseSuggestions(text string, inventory pdf.Inventory) (Result, error) {
	body := strings.TrimSpace(text)
	// Models like to wrap JSON in a fence whatever the instructions say.
	body = strings.TrimPrefix(body, "```json")
	body = strings.TrimPrefix(body, "```")
	body = strings.TrimSuffix(body, "```")
	body = strings.TrimSpace(body)

	var payload struct {
		Suggestions []Suggestion `json:"suggestions"`
	}
	if err := json.Unmarshal([]byte(body), &payload); err != nil {
		return Result{}, fmt.Errorf("the suggestion reply was not the expected JSON: %w", err)
	}

	result := Result{}
	mapped := map[string]bool{}
	for _, suggestion := range payload.Suggestions {
		if _, ok := inventory.FieldByName(suggestion.FormField); !ok {
			result.Rejected = append(result.Rejected,
				fmt.Sprintf("%s: this form has no such field", suggestion.FormField))
			continue
		}
		if err := domain.ValidatePath(suggestion.FieldPath); err != nil {
			result.Rejected = append(result.Rejected,
				fmt.Sprintf("%s -> %s: %v", suggestion.FormField, suggestion.FieldPath, err))
			continue
		}
		if spec, ok := domain.Lookup(suggestion.FieldPath); ok && spec.Derived {
			// A derived total is computed, never collected, so it is not
			// something a form field maps to for input purposes.
			result.Rejected = append(result.Rejected,
				fmt.Sprintf("%s -> %s: that path is computed, not answered", suggestion.FormField, suggestion.FieldPath))
			continue
		}
		if mapped[suggestion.FormField] {
			continue
		}
		mapped[suggestion.FormField] = true
		result.Suggestions = append(result.Suggestions, suggestion)
	}

	for _, field := range inventory.Fields {
		if !mapped[field.Name] {
			result.Unmapped = append(result.Unmapped, field.Name)
		}
	}

	sort.Slice(result.Suggestions, func(i, j int) bool {
		return result.Suggestions[i].FormField < result.Suggestions[j].FormField
	})
	sort.Strings(result.Unmapped)
	sort.Strings(result.Rejected)
	return result, nil
}
