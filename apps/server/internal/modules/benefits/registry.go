package benefits

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sort"
	"strings"

	domain "github.com/helpthehive/server/internal/domain/benefits"
	"github.com/helpthehive/server/internal/modules/benefits/pdf"
)

// MappingFileName is the file a form directory is recognised by.
const MappingFileName = "mapping.json"

// Form is one loaded, verified government form: its mapping, the template it
// fills, and the template's own field inventory.
type Form struct {
	Mapping   *domain.FormMapping
	Inventory pdf.Inventory
	// TemplatePath is absolute, resolved at load time.
	TemplatePath string
}

func (f *Form) Key() string { return f.Mapping.Key() }

// Coverage reports how much of a form the mapping actually fills: how many
// boxes it addresses out of how many could hold a value.
//
// It is surfaced rather than kept quiet because partial coverage is the normal
// state of a real form and the applicant should know. Missouri's SNAP
// application has 413 fields; a mapping that fills the identity, address,
// household and income sections and leaves the criminal-history questions to
// the applicant is doing the right thing, and telling them "46 of these boxes
// are filled in, the rest are yours" is more use than silence.
//
// Signature fields are excluded from both counts: they are nobody's to fill.
func (f *Form) Coverage() (mapped, fillable int) {
	targeted := map[string]bool{}
	for _, field := range f.Mapping.Fields {
		if field.FillPolicy == domain.FillNever || field.Target.Name == "" {
			continue
		}
		targeted[field.Target.Name] = true
	}
	for _, field := range f.Inventory.Fields {
		if !field.Type.Fillable() {
			continue
		}
		fillable++
		if targeted[field.Name] {
			mapped++
		}
	}
	return mapped, fillable
}

// OpenTemplate returns a reader over the blank official PDF.
func (f *Form) OpenTemplate() (*os.File, error) {
	return os.Open(f.TemplatePath)
}

// Registry holds every form mapping this server can fill.
//
// It is built once at start-up and never changes, and every mapping in it has
// already been checked against its actual PDF. A mapping that addresses a field
// the form does not have, or offers a value the form will not accept, stops the
// server from booting — the alternative is discovering it in front of an
// applicant whose application will not fill.
type Registry struct {
	byKey map[string]*Form
	// byID points at the highest revision of each form id whose status is
	// active, which is what a new application is started against.
	byID  map[string]*Form
	order []string
}

func NewRegistry() *Registry {
	return &Registry{byKey: map[string]*Form{}, byID: map[string]*Form{}}
}

// LoadRegistry walks a forms directory and loads every mapping it finds.
//
// A missing directory is not an error: a deployment with no forms installed
// runs, and every benefits query simply reports that no form is available. A
// directory with a broken mapping in it is an error.
func LoadRegistry(root string) (*Registry, error) {
	registry := NewRegistry()
	if root == "" {
		return registry, nil
	}
	info, err := os.Stat(root)
	if os.IsNotExist(err) {
		return registry, nil
	}
	if err != nil {
		return nil, err
	}
	if !info.IsDir() {
		return nil, fmt.Errorf("benefits forms path %q is not a directory", root)
	}

	var paths []string
	err = filepath.WalkDir(root, func(path string, entry os.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if !entry.IsDir() && entry.Name() == MappingFileName {
			paths = append(paths, path)
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	// Sorted so a registry built twice from the same tree is the same registry.
	sort.Strings(paths)

	for _, path := range paths {
		form, err := LoadForm(path)
		if err != nil {
			return nil, err
		}
		if err := registry.add(form); err != nil {
			return nil, err
		}
	}
	return registry, nil
}

func (r *Registry) add(form *Form) error {
	key := form.Key()
	if _, exists := r.byKey[key]; exists {
		return fmt.Errorf("two mappings claim to be %s", key)
	}
	r.byKey[key] = form
	r.order = append(r.order, key)

	if form.Mapping.Status != "active" {
		return nil
	}
	current, exists := r.byID[form.Mapping.ID]
	if !exists || newerThan(form.Mapping, current.Mapping) {
		r.byID[form.Mapping.ID] = form
	}
	return nil
}

// newerThan compares two revisions of the same form. Version strings are dated
// ("2026.01"), so a lexical comparison orders them; the revision breaks ties
// within one government version.
func newerThan(candidate, current *domain.FormMapping) bool {
	if candidate.FormVersion != current.FormVersion {
		return candidate.FormVersion > current.FormVersion
	}
	return candidate.Revision > current.Revision
}

// Current returns the active mapping for a form id — what a new application is
// started against.
//
// A draft mapping is deliberately absent. A form whose provenance has not been
// confirmed loads, validates and can be tested against, but no applicant is
// offered it.
func (r *Registry) Current(formID string) (*Form, bool) {
	form, ok := r.byID[formID]
	return form, ok
}

// Any returns a mapping by id whatever its status, preferring the active one.
// Used by the form-onboarding tools and by tests, never to start an application.
func (r *Registry) Any(formID string) (*Form, bool) {
	if form, ok := r.byID[formID]; ok {
		return form, true
	}
	var best *Form
	for _, form := range r.byKey {
		if form.Mapping.ID != formID {
			continue
		}
		if best == nil || newerThan(form.Mapping, best.Mapping) {
			best = form
		}
	}
	return best, best != nil
}

// ByKey returns one exact revision. An existing application is always refilled
// through this, never through Current: a government form revision must not
// silently change what an applicant already reviewed.
func (r *Registry) ByKey(key string) (*Form, bool) {
	form, ok := r.byKey[key]
	return form, ok
}

// List returns the active forms, optionally narrowed by state and program.
func (r *Registry) List(state, program string) []*Form {
	var out []*Form
	for _, form := range r.byID {
		if state != "" && !strings.EqualFold(form.Mapping.Jurisdiction.State, state) {
			continue
		}
		if program != "" && !strings.EqualFold(form.Mapping.Program, program) {
			continue
		}
		out = append(out, form)
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].Mapping.Jurisdiction.State != out[j].Mapping.Jurisdiction.State {
			return out[i].Mapping.Jurisdiction.State < out[j].Mapping.Jurisdiction.State
		}
		if out[i].Mapping.Program != out[j].Mapping.Program {
			return out[i].Mapping.Program < out[j].Mapping.Program
		}
		return out[i].Mapping.ID < out[j].Mapping.ID
	})
	return out
}

func (r *Registry) Len() int { return len(r.byKey) }

// LoadForm reads and fully verifies one mapping file and its template.
func LoadForm(mappingPath string) (*Form, error) {
	data, err := os.ReadFile(mappingPath)
	if err != nil {
		return nil, err
	}
	mapping, err := domain.ParseMapping(data)
	if err != nil {
		return nil, fmt.Errorf("%s: %w", mappingPath, err)
	}
	mapping.Dir = filepath.Dir(mappingPath)
	if err := mapping.Validate(); err != nil {
		return nil, fmt.Errorf("%s: %w", mappingPath, err)
	}

	templatePath := filepath.Join(mapping.Dir, mapping.Template.File)
	template, err := os.Open(templatePath)
	if err != nil {
		return nil, fmt.Errorf("%s: template: %w", mappingPath, err)
	}
	defer template.Close()

	if err := verifyDigest(template, mapping.Template.SHA256); err != nil {
		return nil, fmt.Errorf("%s: %w", mappingPath, err)
	}
	if _, err := template.Seek(0, io.SeekStart); err != nil {
		return nil, err
	}

	inventory, err := pdf.Inspect(template)
	if err != nil {
		return nil, fmt.Errorf("%s: read template: %w", mappingPath, err)
	}

	form := &Form{Mapping: mapping, Inventory: inventory, TemplatePath: templatePath}
	if err := verifyAgainstTemplate(form); err != nil {
		return nil, fmt.Errorf("%s: %w", mappingPath, err)
	}
	return form, nil
}

// verifyDigest checks the template is byte-for-byte the PDF the mapping was
// written against. A government agency reissuing a form under the same filename
// would otherwise move every field silently, and the applications would be
// wrong in ways nobody would notice until they were rejected.
func verifyDigest(r io.Reader, want string) error {
	digest := sha256.New()
	if _, err := io.Copy(digest, r); err != nil {
		return err
	}
	got := hex.EncodeToString(digest.Sum(nil))
	if !strings.EqualFold(got, want) {
		return fmt.Errorf("%w: the template does not match the mapping's sha256 (expected %s, found %s)", domain.ErrInvalidMapping, want, got)
	}
	return nil
}

// verifyAgainstTemplate is the check a mapping file cannot do on its own: does
// this form really have these fields, of these types, accepting these values.
func verifyAgainstTemplate(form *Form) error {
	mapping := form.Mapping
	var problems []string
	add := func(format string, args ...any) {
		problems = append(problems, fmt.Sprintf(format, args...))
	}

	if mapping.Template.PageCount != form.Inventory.PageCount {
		add("the mapping says %d pages, the template has %d", mapping.Template.PageCount, form.Inventory.PageCount)
	}

	switch mapping.Template.Kind {
	case domain.TemplateAcroForm:
		if !form.Inventory.HasAcroForm {
			add("the mapping calls this a fillable form, but the template has no form fields")
			break
		}
		for _, field := range mapping.Fields {
			if field.FillPolicy == domain.FillNever {
				continue
			}
			templateField, ok := form.Inventory.FieldByName(field.Target.Name)
			if !ok {
				add("field %q targets %q, which this template does not have", field.ID, field.Target.Name)
				continue
			}
			if templateField.IsAttestation() {
				// Alongside fillPolicy "never": these boxes are the applicant's
				// own act — signing, initialling, certifying, dating a
				// signature — and Help The Hive does not perform them. A
				// mapping that wants one filled has to say so explicitly, and
				// there is deliberately no way to say so.
				add("field %q targets %q, which this form uses as %s (%q); that is the applicant's to complete, so mark it fillPolicy \"never\"",
					field.ID, field.Target.Name, templateField.Attestation, templateField.Label)
				continue
			}
			if !templateField.Type.Fillable() {
				add("field %q targets %q, which is a %s and cannot hold a value", field.ID, field.Target.Name, templateField.Type)
				continue
			}
			if want := templateFieldType(field.Target.Type); want != templateField.Type {
				add("field %q calls %q a %s, but the template has it as a %s", field.ID, field.Target.Name, want, templateField.Type)
				continue
			}
			verifyValueMapAgainstTemplate(field, templateField, add)
		}
	case domain.TemplateFlat:
		for _, field := range mapping.Fields {
			if field.FillPolicy == domain.FillNever || field.Target.Rect == nil {
				continue
			}
			if field.Target.Page > len(form.Inventory.PageSizes) {
				continue // already reported by the page-count check
			}
			page := form.Inventory.PageSizes[field.Target.Page-1]
			rect := field.Target.Rect
			if rect.X < page.X || rect.Y < page.Y ||
				rect.X+rect.W > page.X+page.W || rect.Y+rect.H > page.Y+page.H {
				add("field %q sits outside page %d (the page is %.0f×%.0f points, origin bottom-left)",
					field.ID, field.Target.Page, page.W, page.H)
			}
			if field.Target.Font != nil && !pdf.SupportedFont(field.Target.Font.Name) {
				add("field %q asks for the font %q, which this engine cannot draw with", field.ID, field.Target.Font.Name)
			}
		}
	}

	if len(problems) > 0 {
		return fmt.Errorf("%w: %s", domain.ErrInvalidMapping, strings.Join(problems, "; "))
	}
	return nil
}

// verifyValueMapAgainstTemplate checks that every value a mapping could write
// into a choice or radio field is one the field actually offers. Getting this
// wrong means a box that silently stays blank on a submitted application.
func verifyValueMapAgainstTemplate(field domain.FieldMapping, templateField pdf.Field, add func(string, ...any)) {
	switch templateField.Type {
	case pdf.FieldRadio, pdf.FieldDropdown, pdf.FieldListbox:
	default:
		return
	}
	if len(templateField.Options) == 0 {
		return
	}
	for _, value := range field.ValueMap {
		if !containsString(templateField.Options, value) {
			add("field %q can write %q into %q, which only accepts %v", field.ID, value, field.Target.Name, templateField.Options)
		}
	}
	if field.Source.Constant != nil && !containsString(templateField.Options, *field.Source.Constant) {
		add("field %q writes the constant %q into %q, which only accepts %v", field.ID, *field.Source.Constant, field.Target.Name, templateField.Options)
	}
}

func templateFieldType(target domain.TargetType) pdf.FieldType {
	switch target {
	case domain.TargetText:
		return pdf.FieldText
	case domain.TargetCheckbox:
		return pdf.FieldCheckbox
	case domain.TargetRadio:
		return pdf.FieldRadio
	case domain.TargetDropdown:
		return pdf.FieldDropdown
	case domain.TargetListbox:
		return pdf.FieldListbox
	}
	return pdf.FieldUnknown
}

func containsString(haystack []string, needle string) bool {
	for _, candidate := range haystack {
		if candidate == needle {
			return true
		}
	}
	return false
}
