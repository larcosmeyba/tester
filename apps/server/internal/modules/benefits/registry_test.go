package benefits

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
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

	form, ok := registry.Current("us-xx-snap-hth-sample-1")
	if !ok {
		t.Fatal("the sample form was not found by id")
	}
	if form.Mapping.Program != "SNAP" {
		t.Errorf("expected the sample form to be a SNAP form, got %q", form.Mapping.Program)
	}
	if _, ok := registry.ByKey(form.Key()); !ok {
		t.Errorf("the form is not addressable by its exact revision key %q", form.Key())
	}
	if len(registry.List("XX", "SNAP")) == 0 {
		t.Error("filtering by state and program found nothing")
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
	rewriteMapping(t, dir, `"name": "lastName"`, `"name": "surname"`)

	_, err := LoadRegistry(filepath.Dir(dir))
	if err == nil || !strings.Contains(err.Error(), "which this template does not have") {
		t.Fatalf("expected a field the form does not have to be refused, got %v", err)
	}
}

func TestAMappingWithTheWrongFieldTypeIsRefused(t *testing.T) {
	dir := copySampleForm(t)
	rewriteMapping(t, dir, `"target": { "type": "text", "name": "lastName" }`, `"target": { "type": "checkbox", "name": "lastName" }`)

	_, err := LoadRegistry(filepath.Dir(dir))
	if err == nil || !strings.Contains(err.Error(), "but the template has it as a text") {
		t.Fatalf("expected a type mismatch against the real PDF to be refused, got %v", err)
	}
}

func TestAMappingThatWritesAnImpossibleChoiceIsRefused(t *testing.T) {
	dir := copySampleForm(t)
	rewriteMapping(t, dir,
		`{ "id": "state", "strength": "required",
      "target": { "type": "dropdown", "name": "state" },
      "source": { "fieldPath": "address.residential.state" } }`,
		`{ "id": "state", "strength": "required",
      "target": { "type": "dropdown", "name": "state" },
      "source": { "constant": "ZZ" } }`)

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

func rewriteMapping(t *testing.T, dir, old, replacement string) {
	t.Helper()
	path := filepath.Join(dir, MappingFileName)
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read mapping: %v", err)
	}
	updated := strings.Replace(string(data), old, replacement, 1)
	if updated == string(data) {
		t.Fatalf("the mapping does not contain %q, so this test is not testing what it thinks", old)
	}
	if err := os.WriteFile(path, []byte(updated), 0o600); err != nil {
		t.Fatalf("write mapping: %v", err)
	}
}
