package benefits

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	domain "github.com/helpthehive/server/internal/domain/benefits"
)

// formsRoot is the checked-in forms tree.
func formsRoot(t *testing.T) string {
	t.Helper()
	root, err := filepath.Abs(filepath.Join("..", "..", "..", "forms"))
	if err != nil {
		t.Fatalf("resolve forms root: %v", err)
	}
	return root
}

func TestEveryCheckedInMappingLoadsAndMatchesItsTemplate(t *testing.T) {
	// This is the guard that a form mapping is never wrong in production. It
	// parses every mapping, verifies the template's hash, opens the PDF, and
	// checks that every field the mapping addresses really exists with the type
	// and options the mapping assumes.
	registry, err := LoadRegistry(formsRoot(t))
	if err != nil {
		t.Fatalf("load forms: %v", err)
	}
	if registry.Len() == 0 {
		t.Fatal("no form mappings were loaded; the sample form should be present")
	}
	for _, form := range registry.List("", "") {
		if form.Mapping.VocabularyVersion == 0 {
			t.Errorf("%s: no vocabulary version", form.Key())
		}
		if len(form.Mapping.Fields) == 0 {
			t.Errorf("%s: mapping fills nothing", form.Key())
		}
	}
}

func TestRegistryFindsTheSampleFormByIdAndByState(t *testing.T) {
	registry, err := LoadRegistry(formsRoot(t))
	if err != nil {
		t.Fatalf("load forms: %v", err)
	}

	form, ok := registry.Any("us-xx-snap-hth-sample-1")
	if !ok {
		t.Fatal("the sample form was not found by id")
	}
	if form.Mapping.Program != "SNAP" {
		t.Errorf("expected the sample form to be a SNAP form, got %q", form.Mapping.Program)
	}
	if _, ok := registry.ByKey(form.Key()); !ok {
		t.Errorf("the form is not addressable by its exact revision key %q", form.Key())
	}
	// A draft mapping is never offered to an applicant. The sample form has no
	// agency and the Missouri one has unconfirmed provenance, so neither is
	// listed however it is filtered.
	if listed := registry.List("XX", "SNAP"); len(listed) != 0 {
		t.Errorf("a draft form must not be offered, got %d", len(listed))
	}
	if _, active := registry.Current("us-xx-snap-hth-sample-1"); active {
		t.Error("Current must not return a draft mapping")
	}
	if len(registry.List("ZZ", "")) != 0 {
		t.Error("filtering by a state with no forms should find nothing")
	}
}

func TestAMissingFormsDirectoryIsNotAnError(t *testing.T) {
	// A deployment with no forms installed still runs; it just cannot fill
	// anything yet.
	registry, err := LoadRegistry(filepath.Join(t.TempDir(), "absent"))
	if err != nil {
		t.Fatalf("expected an absent forms directory to be fine, got %v", err)
	}
	if registry.Len() != 0 {
		t.Fatal("expected an empty registry")
	}
}

func TestATamperedTemplateIsRefused(t *testing.T) {
	// If an agency reissues a form under the same filename, every field moves.
	// Loading it anyway would produce applications that are wrong in ways
	// nobody would notice until they were rejected.
	dir := copySampleForm(t)
	template := filepath.Join(dir, "template.pdf")
	data, err := os.ReadFile(template)
	if err != nil {
		t.Fatalf("read template: %v", err)
	}
	if err := os.WriteFile(template, append(data, '\n'), 0o600); err != nil {
		t.Fatalf("write template: %v", err)
	}

	_, err = LoadRegistry(filepath.Dir(dir))
	if err == nil || !strings.Contains(err.Error(), "sha256") {
		t.Fatalf("expected a hash mismatch to be refused, got %v", err)
	}
}

func TestAMappingThatAddressesAMissingFieldIsRefused(t *testing.T) {
	dir := copySampleForm(t)
	editMapping(t, dir, func(mapping map[string]any) {
		field(t, mapping, "last_name")["target"].(map[string]any)["name"] = "surname"
	})

	_, err := LoadRegistry(filepath.Dir(dir))
	if err == nil || !strings.Contains(err.Error(), "which this template does not have") {
		t.Fatalf("expected a field the form does not have to be refused, got %v", err)
	}
}

func TestAMappingWithTheWrongFieldTypeIsRefused(t *testing.T) {
	dir := copySampleForm(t)
	editMapping(t, dir, func(mapping map[string]any) {
		field(t, mapping, "last_name")["target"].(map[string]any)["type"] = "checkbox"
	})

	_, err := LoadRegistry(filepath.Dir(dir))
	if err == nil || !strings.Contains(err.Error(), "but the template has it as a text") {
		t.Fatalf("expected a type mismatch against the real PDF to be refused, got %v", err)
	}
}

func TestAMappingThatWritesAnImpossibleChoiceIsRefused(t *testing.T) {
	dir := copySampleForm(t)
	editMapping(t, dir, func(mapping map[string]any) {
		state := field(t, mapping, "state")
		state["source"] = map[string]any{"constant": "ZZ"}
	})

	_, err := LoadRegistry(filepath.Dir(dir))
	if err == nil || !strings.Contains(err.Error(), "only accepts") {
		t.Fatalf("expected a value the dropdown cannot hold to be refused, got %v", err)
	}
}

// copySampleForm copies the sample form into a temp tree so a test can break it
// without touching the repository.
func copySampleForm(t *testing.T) string {
	t.Helper()
	source := filepath.Join(formsRoot(t), "us", "xx", "snap", "hth-sample-1", "2026.01")
	root := t.TempDir()
	dir := filepath.Join(root, "sample")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatalf("mkdir: %v", err)
	}
	for _, name := range []string{"mapping.json", MappingFileName, "template.pdf"} {
		data, err := os.ReadFile(filepath.Join(source, name))
		if err != nil {
			continue
		}
		if err := os.WriteFile(filepath.Join(dir, name), data, 0o600); err != nil {
			t.Fatalf("copy %s: %v", name, err)
		}
	}
	return dir
}

// editMapping mutates a copied mapping through its JSON rather than by string
// replacement, so reformatting the checked-in file cannot quietly turn one of
// these tests into a no-op.
func editMapping(t *testing.T, dir string, edit func(mapping map[string]any)) {
	t.Helper()
	path := filepath.Join(dir, MappingFileName)

	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read mapping: %v", err)
	}
	var mapping map[string]any
	if err := json.Unmarshal(data, &mapping); err != nil {
		t.Fatalf("parse mapping: %v", err)
	}
	edit(mapping)

	updated, err := json.MarshalIndent(mapping, "", "  ")
	if err != nil {
		t.Fatalf("encode mapping: %v", err)
	}
	if err := os.WriteFile(path, updated, 0o600); err != nil {
		t.Fatalf("write mapping: %v", err)
	}
}

// field finds one mapping field by id so a test can break exactly it.
func field(t *testing.T, mapping map[string]any, id string) map[string]any {
	t.Helper()
	for _, entry := range mapping["fields"].([]any) {
		candidate := entry.(map[string]any)
		if candidate["id"] == id {
			return candidate
		}
	}
	t.Fatalf("no field %q in the mapping", id)
	return nil
}

// TestListServesFederalFormsForAnyState guards the fix for the federal VA
// forms: a mapping with no state jurisdiction (country US only) applies in
// every state, so Registry.List must return it however the caller filters by
// state. A form that declares a different state must still be excluded.
func TestListServesFederalFormsForAnyState(t *testing.T) {
	newForm := func(id, state, program string) *Form {
		return &Form{Mapping: &domain.FormMapping{
			ID:           id,
			Jurisdiction: domain.Jurisdiction{Country: "US", State: state},
			Program:      program,
			FormVersion:  "2026.01",
			Revision:     1,
			Status:       "active",
		}}
	}
	r := NewRegistry()
	for _, f := range []*Form{
		newForm("us-federal-va-21-526ez", "", "va_disability"),
		newForm("us-mo-snap-test", "MO", "SNAP"),
	} {
		if err := r.add(f); err != nil {
			t.Fatalf("add form: %v", err)
		}
	}

	seen := func(forms []*Form, id string) bool {
		for _, f := range forms {
			if f.Mapping.ID == id {
				return true
			}
		}
		return false
	}

	// The federal VA disability form is served for a state filter, by full
	// state name, and for the matching program — in every state.
	for _, state := range []string{"CA", "California", "TX", "MO"} {
		listed := r.List(state, "")
		if !seen(listed, "us-federal-va-21-526ez") {
			t.Errorf("List(%q, \"\"): federal VA form missing", state)
		}
	}
	if listed := r.List("CA", "va_disability"); !seen(listed, "us-federal-va-21-526ez") {
		t.Error("List(CA, va_disability): federal VA form missing")
	}
	// A state form is still scoped to its own state.
	if listed := r.List("CA", ""); seen(listed, "us-mo-snap-test") {
		t.Error("List(CA, \"\"): Missouri SNAP form must not be served for California")
	}
	if listed := r.List("MO", ""); !seen(listed, "us-mo-snap-test") {
		t.Error("List(MO, \"\"): Missouri SNAP form missing for its own state")
	}
	// Program filtering still applies to federal forms.
	if listed := r.List("CA", "SNAP"); seen(listed, "us-federal-va-21-526ez") {
		t.Error("List(CA, SNAP): VA disability form must not match a SNAP filter")
	}
}
