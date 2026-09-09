package benefits

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// Form versioning: a mapping is tied to one exact document, and an application
// is tied to one exact mapping.

// If an agency reissues a form under the same filename, every field on it
// moves. Filling the new document with the old mapping would produce
// applications that are wrong in ways nobody notices until they are rejected,
// so the mismatch stops the server rather than being papered over.
func TestAChangedOfficialFormStopsTheServer(t *testing.T) {
	dir := copySampleForm(t)
	template := filepath.Join(dir, "template.pdf")

	original, err := os.ReadFile(template)
	if err != nil {
		t.Fatalf("read template: %v", err)
	}
	if err := os.WriteFile(template, append(original, "\n% the agency changed something\n"...), 0o600); err != nil {
		t.Fatalf("write template: %v", err)
	}

	_, err = LoadRegistry(filepath.Dir(dir))
	if err == nil {
		t.Fatal("a template that does not match its mapping must not load")
	}
	if !strings.Contains(err.Error(), "sha256") {
		t.Fatalf("the error should name the hash so a reviewer knows what to check: %v", err)
	}
}

// An application records the exact revision it was started on. A newer revision
// becoming active must not change what somebody already reviewed.
func TestAnApplicationKeepsTheRevisionItWasStartedOn(t *testing.T) {
	registry, err := LoadRegistry(formsRoot(t))
	if err != nil {
		t.Fatalf("load forms: %v", err)
	}
	form, ok := registry.Any("us-mo-snap-im1ss")
	if !ok {
		t.Skip("the Missouri form is not installed in this tree")
	}

	// The key is what an application stores, and it names version and revision
	// rather than just the form.
	key := form.Key()
	if !strings.Contains(key, form.Mapping.FormVersion) {
		t.Errorf("the key should pin the form version, got %q", key)
	}
	if !strings.Contains(key, "#") {
		t.Errorf("the key should pin the revision, got %q", key)
	}

	byKey, ok := registry.ByKey(key)
	if !ok || byKey.Mapping.Revision != form.Mapping.Revision {
		t.Fatal("a run must be able to find the exact revision it was filled from")
	}
}

// A form nobody has confirmed the provenance of is never offered to an
// applicant, however complete its mapping is.
func TestAMappingWithoutProvenanceCannotBeActive(t *testing.T) {
	dir := copySampleForm(t)
	editMapping(t, dir, func(mapping map[string]any) {
		mapping["status"] = "active"
		delete(mapping["template"].(map[string]any), "sourceUrl")
	})

	_, err := LoadRegistry(filepath.Dir(dir))
	if err == nil || !strings.Contains(err.Error(), "sourceUrl") {
		t.Fatalf("an active mapping with no recorded source must be refused, got %v", err)
	}
}

func TestADeprecatedMappingMustSayWhatReplacedIt(t *testing.T) {
	dir := copySampleForm(t)
	editMapping(t, dir, func(mapping map[string]any) {
		mapping["status"] = "deprecated"
	})

	_, err := LoadRegistry(filepath.Dir(dir))
	if err == nil || !strings.Contains(err.Error(), "supersededBy") {
		t.Fatalf("a deprecated mapping should name its replacement, got %v", err)
	}
}

func TestAnUnknownStatusIsRefused(t *testing.T) {
	dir := copySampleForm(t)
	editMapping(t, dir, func(mapping map[string]any) {
		mapping["status"] = "probably fine"
	})

	_, err := LoadRegistry(filepath.Dir(dir))
	if err == nil || !strings.Contains(err.Error(), "status must be") {
		t.Fatalf("expected an unknown status to be refused, got %v", err)
	}
}

// The retrieval date has to be a date, so "when was this last checked against
// the agency?" is answerable.
func TestRetrievedAtMustBeADate(t *testing.T) {
	dir := copySampleForm(t)
	editMapping(t, dir, func(mapping map[string]any) {
		mapping["status"] = "active"
		template := mapping["template"].(map[string]any)
		template["sourceUrl"] = "https://example.gov/form.pdf"
		template["retrievedAt"] = "last Tuesday"
	})

	_, err := LoadRegistry(filepath.Dir(dir))
	if err == nil || !strings.Contains(err.Error(), "retrievedAt") {
		t.Fatalf("expected a bad retrieval date to be refused, got %v", err)
	}
}
