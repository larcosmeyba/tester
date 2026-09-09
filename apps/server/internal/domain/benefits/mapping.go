package benefits

import (
	"encoding/json"
	"fmt"
	"strings"
	"time"
)

// MappingSchemaVersion is the version of the mapping file format itself, as
// distinct from the version of the government form it describes.
const MappingSchemaVersion = 1

// TemplateKind says how a form is filled. An acroform has named fields; a flat
// form is a scan or a print-only PDF and is filled by drawing at coordinates.
type TemplateKind string

const (
	TemplateAcroForm TemplateKind = "acroform"
	TemplateFlat     TemplateKind = "flat"
)

type TargetType string

const (
	TargetText      TargetType = "text"
	TargetCheckbox  TargetType = "checkbox"
	TargetRadio     TargetType = "radio"
	TargetDropdown  TargetType = "dropdown"
	TargetListbox   TargetType = "listbox"
	TargetCheckmark TargetType = "checkmark" // flat forms only: draws a glyph
)

// IsCheckbox reports whether a target is ticked rather than written into.
func (t TargetType) IsCheckbox() bool {
	return t == TargetCheckbox || t == TargetCheckmark
}

type Strength string

const (
	Required  Strength = "required"
	Preferred Strength = "preferred"
)

type FillPolicy string

const (
	// FillAuto is the default: fill from the profile when an answer exists.
	FillAuto FillPolicy = "auto"
	// FillNever marks a field Help The Hive must not fill on the applicant's
	// behalf — signatures, the date beside a signature, office-use boxes. It is
	// reported as intentionally skipped rather than as missing.
	FillNever FillPolicy = "never"
)

// Rect is a rectangle in PDF user space, in points, with the page's
// bottom-left corner as the origin and Y increasing upwards. This is stated
// here because assuming a top-left origin is the single most common way a
// coordinate mapping goes wrong.
type Rect struct {
	X float64 `json:"x"`
	Y float64 `json:"y"`
	W float64 `json:"w"`
	H float64 `json:"h"`
}

type FontRef struct {
	Name string  `json:"name"`
	Size float64 `json:"size"`
}

type Target struct {
	Type TargetType `json:"type"`

	// AcroForm targets.
	Name string `json:"name,omitempty"`

	// Flat targets.
	Page        int      `json:"page,omitempty"`
	Rect        *Rect    `json:"rect,omitempty"`
	Font        *FontRef `json:"font,omitempty"`
	Align       string   `json:"align,omitempty"` // left, center, right
	ShrinkToFit bool     `json:"shrinkToFit,omitempty"`
	Glyph       string   `json:"glyph,omitempty"` // checkmark targets
}

// SourceRef is where a field's value comes from. Exactly one of FieldPath and
// Constant is set. A constant is written by a human into a reviewed,
// version-controlled mapping file — it is recorded in the audit trail as
// SourceMappingConstant so it is never mistaken for something the applicant said.
type SourceRef struct {
	FieldPath FieldPath `json:"fieldPath,omitempty"`
	Constant  *string   `json:"constant,omitempty"`
}

// Repeat binds a field to one row of a repeating group. Index is zero-based,
// so the fourth household-member row on a paper form is index 3.
type Repeat struct {
	Over  FieldPath `json:"over"`
	Index int       `json:"index"`
}

type FieldMapping struct {
	ID         string            `json:"id"`
	Target     Target            `json:"target"`
	Source     SourceRef         `json:"source"`
	Transforms []Transform       `json:"transforms,omitempty"`
	ValueMap   map[string]string `json:"valueMap,omitempty"`
	Repeat     *Repeat           `json:"repeat,omitempty"`
	Strength   Strength          `json:"strength,omitempty"`
	FillPolicy FillPolicy        `json:"fillPolicy,omitempty"`
	Note       string            `json:"note,omitempty"`
}

// Condition gates a requirement. "Street address is required unless the
// applicant said they have no permanent address" is a condition, and it is what
// keeps a form from demanding an answer that does not apply.
type Condition struct {
	FieldPath  FieldPath `json:"fieldPath"`
	Equals     any       `json:"equals,omitempty"`
	IsAnswered *bool     `json:"isAnswered,omitempty"`
}

type Requirement struct {
	FieldPath FieldPath  `json:"fieldPath"`
	Strength  Strength   `json:"strength"`
	Unless    *Condition `json:"unless,omitempty"`
}

type Jurisdiction struct {
	Country string `json:"country"`
	State   string `json:"state,omitempty"`
}

// TemplateRef pins the exact document a mapping was written against, and
// records where it came from.
//
// The hash is the load-bearing part. An agency reissuing a form under the same
// filename moves every field on it, and a mapping applied to the new document
// would fill an application that is wrong in ways nobody would notice until it
// was rejected. A template that does not match its hash stops the server from
// starting, and the fix is for a person to look at the new form.
type TemplateRef struct {
	Kind      TemplateKind `json:"kind"`
	File      string       `json:"file"`
	SHA256    string       `json:"sha256"`
	PageCount int          `json:"pageCount"`
	// SourceURL is where this exact PDF was downloaded from, so the next person
	// can check the agency against what is checked in.
	SourceURL string `json:"sourceUrl,omitempty"`
	// RetrievedAt is the day it was downloaded, YYYY-MM-DD. Together with
	// SourceURL it is what makes "is this still the current form?" answerable.
	RetrievedAt string `json:"retrievedAt,omitempty"`
}

// FormMapping is one version of one government form. Mappings are append-only:
// a new revision of a state's form gets a new directory and a new record, never
// an edit in place, so a completed PDF can always be reproduced from the exact
// mapping that produced it.
type FormMapping struct {
	SchemaVersion     int          `json:"schemaVersion"`
	ID                string       `json:"id"`
	Jurisdiction      Jurisdiction `json:"jurisdiction"`
	Program           string       `json:"program"`
	FormCode          string       `json:"formCode"`
	FormTitle         string       `json:"formTitle"`
	FormVersion       string       `json:"formVersion"`
	Revision          int          `json:"revision"`
	// Status is active, deprecated or draft. Only an active mapping is used to
	// start a new application; an existing run keeps the exact revision it was
	// started on, whatever has happened since.
	Status            string `json:"status"`
	VocabularyVersion int    `json:"vocabularyVersion"`
	// EffectiveDate is the agency's own date for this version of the form,
	// YYYY-MM-DD, when it states one.
	EffectiveDate string `json:"effectiveDate,omitempty"`
	// SupersededBy names the mapping that replaced this one, as
	// id@version#revision. Set when Status is deprecated.
	SupersededBy string `json:"supersededBy,omitempty"`
	// AgencyURL is the program's page, as opposed to the PDF itself.
	AgencyURL string `json:"agencyUrl,omitempty"`
	// ProvenanceNote explains anything a reviewer needs to know about where
	// this document came from — in practice, why a mapping is still draft.
	ProvenanceNote string `json:"provenanceNote,omitempty"`

	Template     TemplateRef    `json:"template"`
	Requirements []Requirement  `json:"requirements,omitempty"`
	Fields       []FieldMapping `json:"fields"`

	// Dir is where the mapping was loaded from. Set by the registry, not by the
	// file itself.
	Dir string `json:"-"`
}

// Key identifies a mapping uniquely across revisions.
func (m *FormMapping) Key() string {
	return fmt.Sprintf("%s@%s#%d", m.ID, m.FormVersion, m.Revision)
}

func (f FieldMapping) policy() FillPolicy {
	if f.FillPolicy == "" {
		return FillAuto
	}
	return f.FillPolicy
}

func (f FieldMapping) strength() Strength {
	if f.Strength == "" {
		return Preferred
	}
	return f.Strength
}

// ResolvedPath is the concrete profile path this field reads, with the repeat
// index substituted in.
func (f FieldMapping) ResolvedPath() (FieldPath, error) {
	if f.Source.FieldPath == "" {
		return "", nil
	}
	if !f.Source.FieldPath.Repeating() {
		return f.Source.FieldPath, nil
	}
	if f.Repeat == nil {
		return "", fmt.Errorf("field %q reads a repeating path but declares no repeat", f.ID)
	}
	return f.Source.FieldPath.Indexed(f.Repeat.Index)
}

// Validate checks a mapping against the vocabulary and its own rules. It does
// not open the PDF; the registry does that separately, because a mapping can be
// wrong in ways only the real template reveals.
func (m *FormMapping) Validate() error {
	var problems []string
	add := func(format string, args ...any) {
		problems = append(problems, fmt.Sprintf(format, args...))
	}

	if m.SchemaVersion != MappingSchemaVersion {
		add("schemaVersion %d is not supported (this server reads v%d)", m.SchemaVersion, MappingSchemaVersion)
	}
	if m.VocabularyVersion != VocabularyVersion {
		add("vocabularyVersion %d does not match this server's v%d", m.VocabularyVersion, VocabularyVersion)
	}
	if strings.TrimSpace(m.ID) == "" {
		add("id is required")
	}
	if strings.TrimSpace(m.FormVersion) == "" {
		add("formVersion is required")
	}
	if m.Template.Kind != TemplateAcroForm && m.Template.Kind != TemplateFlat {
		add("template.kind must be %q or %q", TemplateAcroForm, TemplateFlat)
	}
	if strings.TrimSpace(m.Template.File) == "" {
		add("template.file is required")
	}
	if len(m.Template.SHA256) != 64 {
		add("template.sha256 must be a 64-character hex digest")
	}
	switch m.Status {
	case "active", "deprecated", "draft":
	default:
		add("status must be active, deprecated or draft, got %q", m.Status)
	}
	if m.Status == "active" {
		// Provenance is required of anything that will fill a real application.
		// Without it there is no way to check whether the agency has since
		// published a different form.
		if strings.TrimSpace(m.Template.SourceURL) == "" {
			add("an active mapping must record template.sourceUrl, the address this PDF was downloaded from")
		}
		if err := validateDate(m.Template.RetrievedAt); err != nil {
			add("template.retrievedAt: %v", err)
		}
	}
	if m.EffectiveDate != "" {
		if err := validateDate(m.EffectiveDate); err != nil {
			add("effectiveDate: %v", err)
		}
	}
	if m.Status == "deprecated" && strings.TrimSpace(m.SupersededBy) == "" {
		add("a deprecated mapping should name what replaced it in supersededBy")
	}
	if len(m.Fields) == 0 {
		add("a mapping with no fields fills nothing")
	}

	for _, requirement := range m.Requirements {
		if err := ValidatePath(requirement.FieldPath); err != nil {
			add("requirement: %v", err)
		}
		if requirement.Strength != Required && requirement.Strength != Preferred {
			add("requirement %q: strength must be %q or %q", requirement.FieldPath, Required, Preferred)
		}
		if requirement.Unless != nil {
			if err := ValidatePath(requirement.Unless.FieldPath); err != nil {
				add("requirement %q unless: %v", requirement.FieldPath, err)
			}
		}
	}

	seenIDs := map[string]bool{}
	seenTargets := map[string]bool{}
	for _, field := range m.Fields {
		if field.ID == "" {
			add("every field needs an id")
			continue
		}
		if seenIDs[field.ID] {
			add("duplicate field id %q", field.ID)
		}
		seenIDs[field.ID] = true

		if key := targetKey(field.Target); key != "" {
			if seenTargets[key] {
				add("field %q writes a target already written by another field: %s", field.ID, key)
			}
			seenTargets[key] = true
		}

		m.validateFieldSource(field, add)
		m.validateFieldTarget(field, add)
		m.validateValueMap(field, add)

		for _, transform := range field.Transforms {
			if err := transform.Validate(); err != nil {
				add("field %q: %v", field.ID, err)
				continue
			}
			if transform.Op == OpJoin && transform.With.Repeating() && field.Repeat == nil {
				add("field %q joins the repeating path %q but declares no repeat, so there is no row to read", field.ID, transform.With)
			}
		}
	}

	if len(problems) > 0 {
		return fmt.Errorf("%w %s: %s", ErrInvalidMapping, m.Key(), strings.Join(problems, "; "))
	}
	return nil
}

func (m *FormMapping) validateFieldSource(field FieldMapping, add func(string, ...any)) {
	hasPath := field.Source.FieldPath != ""
	hasConstant := field.Source.Constant != nil

	if field.policy() == FillNever {
		if hasPath || hasConstant {
			add("field %q has fillPolicy never but still declares a source", field.ID)
		}
		return
	}
	if hasPath == hasConstant {
		add("field %q needs exactly one of source.fieldPath or source.constant", field.ID)
		return
	}
	if !hasPath {
		return
	}
	if err := ValidatePath(field.Source.FieldPath); err != nil {
		add("field %q: %v", field.ID, err)
		return
	}
	if field.Source.FieldPath.Repeating() {
		group, _ := field.Source.FieldPath.GroupPath()
		if field.Repeat == nil {
			add("field %q reads repeating path %q but declares no repeat", field.ID, field.Source.FieldPath)
		} else if field.Repeat.Over != group {
			add("field %q repeats over %q but reads from %q", field.ID, field.Repeat.Over, group)
		} else if field.Repeat.Index < 0 {
			add("field %q has a negative repeat index", field.ID)
		}
	} else if field.Repeat != nil {
		add("field %q declares a repeat but reads a scalar path", field.ID)
	}
}

func (m *FormMapping) validateFieldTarget(field FieldMapping, add func(string, ...any)) {
	switch field.Target.Type {
	case TargetText, TargetCheckbox, TargetRadio, TargetDropdown, TargetListbox, TargetCheckmark:
	default:
		add("field %q: unknown target type %q", field.ID, field.Target.Type)
		return
	}

	switch m.Template.Kind {
	case TemplateAcroForm:
		if field.Target.Name == "" {
			add("field %q: an AcroForm target needs target.name", field.ID)
		}
		if field.Target.Type == TargetCheckmark {
			add("field %q: checkmark targets are for flat templates only", field.ID)
		}
	case TemplateFlat:
		if field.Target.Rect == nil {
			add("field %q: a flat target needs target.rect", field.ID)
		}
		if field.Target.Page < 1 {
			add("field %q: a flat target needs a 1-based target.page", field.ID)
		}
		if m.Template.PageCount > 0 && field.Target.Page > m.Template.PageCount {
			add("field %q: page %d is past the template's %d pages", field.ID, field.Target.Page, m.Template.PageCount)
		}
		switch field.Target.Type {
		case TargetText:
			if field.Target.Font == nil || field.Target.Font.Size <= 0 {
				add("field %q: a flat text target needs a font name and size", field.ID)
			}
		case TargetCheckmark:
		default:
			add("field %q: flat templates support only text and checkmark targets, got %q", field.ID, field.Target.Type)
		}
		if field.Target.Rect != nil && (field.Target.Rect.W <= 0 || field.Target.Rect.H <= 0) {
			add("field %q: target.rect needs a positive width and height", field.ID)
		}
	}
}

// validateValueMap makes sure a value map has no holes. At fill time a value
// the map does not cover becomes a problem rather than a guess — but a hole is
// far better caught here, when the mapping is written, than in front of an
// applicant whose form will not fill.
func (m *FormMapping) validateValueMap(field FieldMapping, add func(string, ...any)) {
	if len(field.ValueMap) == 0 || field.Source.FieldPath == "" {
		return
	}
	spec, ok := Lookup(field.Source.FieldPath)
	if !ok {
		return
	}

	// A transform can reshape the value before the map is consulted, so
	// coverage can only be checked when the map reads the answer directly.
	if len(field.Transforms) > 0 {
		return
	}

	var expected []string
	switch spec.Kind {
	case KindBoolean:
		expected = []string{"true", "false"}
	case KindChoice:
		expected = spec.Choices
	default:
		return
	}
	for _, want := range expected {
		if _, covered := field.ValueMap[want]; !covered {
			add("field %q: valueMap does not cover %q, which %s can be", field.ID, want, field.Source.FieldPath)
		}
	}
}

func validateDate(value string) error {
	if strings.TrimSpace(value) == "" {
		return fmt.Errorf("required, as YYYY-MM-DD")
	}
	if _, err := time.Parse(time.DateOnly, strings.TrimSpace(value)); err != nil {
		return fmt.Errorf("%q is not a YYYY-MM-DD date", value)
	}
	return nil
}

func targetKey(t Target) string {
	if t.Name != "" {
		return "name:" + t.Name
	}
	if t.Rect != nil {
		return fmt.Sprintf("page:%d@%.2f,%.2f", t.Page, t.Rect.X, t.Rect.Y)
	}
	return ""
}

// ParseMapping reads a mapping file. It rejects unknown keys: a typo in a
// mapping is a field that silently never gets filled, which is exactly the
// failure this system must not have.
func ParseMapping(data []byte) (*FormMapping, error) {
	decoder := json.NewDecoder(strings.NewReader(string(data)))
	decoder.DisallowUnknownFields()

	var mapping FormMapping
	if err := decoder.Decode(&mapping); err != nil {
		return nil, fmt.Errorf("%w: %v", ErrInvalidMapping, err)
	}
	return &mapping, nil
}
