package benefits_test

import (
	"go/parser"
	"go/token"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"testing"
)

const modulePath = "github.com/helpthehive/server"

// These are the structural guarantees the benefits feature is built on. They
// are asserted here rather than written down in a comment somewhere, because a
// promise about what an AI model cannot reach is only worth anything if
// something checks it.

// TestTheFillPathCannotReachTheAIAssistant proves the division the whole design
// rests on: what goes onto a government form is decided by deterministic code
// and reviewed mapping files, and there is no import path from any of it to a
// model.
func TestTheFillPathCannotReachTheAIAssistant(t *testing.T) {
	forbidden := map[string]string{
		modulePath + "/internal/modules/benefits/assist":  "the AI mapping assistant",
		modulePath + "/internal/modules/mealgen/provider": "an AI provider",
	}

	for _, entry := range []string{
		"internal/domain/benefits",
		"internal/modules/benefits/pdf",
	} {
		for dependency := range transitiveImports(t, entry) {
			if what, banned := forbidden[dependency]; banned {
				t.Errorf("%s reaches %s (%s). Nothing that decides or writes a value on a benefits form may depend on a model.",
					entry, what, dependency)
			}
		}
	}
}

// TestHelpTheHivesOwnFillCodeMakesNoNetworkCall is the same guarantee from the
// other side: none of the Help The Hive code that decides or writes a value on
// a form opens a socket or runs a process.
//
// The scope is stated precisely because the test can only prove what it checks:
// it walks this module's own packages, not the internals of third-party
// libraries. pdfcpu does import net/http for its own remote-image feature, and
// this engine never uses that path — it is only ever handed local bytes. What
// is asserted here is that no Help The Hive file in the fill path can send an
// applicant's answers anywhere.
func TestHelpTheHivesOwnFillCodeMakesNoNetworkCall(t *testing.T) {
	networkPackages := map[string]bool{
		"net":      true,
		"net/http": true,
		"net/url":  false, // parsing a URL is not a network call
		"net/smtp": true,
		"os/exec":  true,
	}

	for _, entry := range []string{
		"internal/domain/benefits",
		"internal/modules/benefits/pdf",
	} {
		for dependency := range transitiveImports(t, entry) {
			if networkPackages[dependency] {
				t.Errorf("%s depends on %s, so the code that fills a benefits form could reach the network", entry, dependency)
			}
		}
	}
}

// TestBenefitsDoesNotDependOnTheMealSystem keeps the two features separable.
//
// They are unrelated products that happen to share a server. Benefits borrowing
// the meal system's AI provider meant the benefits work could not be reviewed
// or merged without the meal refactor coming with it, and meant a change made
// for meal planning could alter how a government form is mapped.
func TestBenefitsDoesNotDependOnTheMealSystem(t *testing.T) {
	// Direct imports, not the transitive closure. Every domain in this server
	// goes through the one shared repository layer in internal/db, and that
	// package necessarily knows about meals, pantry and the rest — reaching
	// meal types that way is the architecture working, not a coupling. What
	// must not happen is a benefits package naming a meal package itself.
	foreign := []string{
		"/internal/modules/meal", "/internal/domain/meals",
		"/internal/modules/penny", "/internal/domain/penny",
		"/internal/transcriber", "/internal/modules/recipes",
	}

	for _, entry := range []string{
		"internal/domain/benefits",
		"internal/modules/benefits",
		"internal/modules/benefits/pdf",
		"internal/modules/benefits/assist",
		"internal/modules/benefits/secrets",
		"internal/modules/benefits/aiprovider",
	} {
		for _, dependency := range importsOf(t, filepath.Join(moduleRoot(t), entry)) {
			for _, unwanted := range foreign {
				if strings.Contains(dependency, unwanted) {
					t.Errorf("%s imports %s directly; the benefits system must be reviewable and mergeable on its own", entry, dependency)
				}
			}
		}
	}
}

// TestTheDomainHasNoDatabaseOrPDFDependency keeps the resolver — the part that
// decides what a form will say — pure and therefore fully testable without a
// database, a template or a network.
func TestTheDomainHasNoDatabaseOrPDFDependency(t *testing.T) {
	for dependency := range transitiveImports(t, "internal/domain/benefits") {
		switch {
		case dependency == modulePath+"/internal/db":
			t.Error("internal/domain/benefits depends on the database layer; the rules must stay pure")
		case strings.HasPrefix(dependency, "github.com/pdfcpu/"):
			t.Error("internal/domain/benefits depends on a PDF library; deciding what a form says must not require opening one")
		case strings.HasPrefix(dependency, "github.com/jackc/"):
			t.Error("internal/domain/benefits depends on a database driver")
		}
	}
}

// TestTheAssistantOnlyEverSeesABlankForm checks the assistant's own inputs: it
// may reach the PDF inspector and the vocabulary, and must not be able to reach
// the profile store or the database.
func TestTheAssistantOnlyEverSeesABlankForm(t *testing.T) {
	for dependency := range transitiveImports(t, "internal/modules/benefits/assist") {
		if dependency == modulePath+"/internal/db" {
			t.Error("the AI assistant can reach the database, so it could be handed applicant data")
		}
		if dependency == modulePath+"/internal/modules/benefits" {
			t.Error("the AI assistant can reach the benefits service, so it could be handed a profile")
		}
	}
}

// transitiveImports returns everything a package depends on, following imports
// through this module's own packages. Third-party packages are recorded but not
// walked into, so these tests speak about Help The Hive's code rather than about
// its dependencies' internals. Test files are excluded: what a test imports says
// nothing about what ships.
func transitiveImports(t *testing.T, relative string) map[string]bool {
	t.Helper()
	root := moduleRoot(t)
	seen := map[string]bool{}

	var walk func(pkg string)
	walk = func(pkg string) {
		if seen[pkg] {
			return
		}
		seen[pkg] = true
		if !strings.HasPrefix(pkg, modulePath) {
			return
		}
		dir := filepath.Join(root, strings.TrimPrefix(pkg, modulePath+"/"))
		for _, imported := range importsOf(t, dir) {
			walk(imported)
		}
	}

	for _, imported := range importsOf(t, filepath.Join(root, relative)) {
		walk(imported)
	}
	return seen
}

func importsOf(t *testing.T, dir string) []string {
	t.Helper()
	entries, err := os.ReadDir(dir)
	if err != nil {
		t.Fatalf("read %s: %v", dir, err)
	}

	fset := token.NewFileSet()
	unique := map[string]bool{}
	for _, entry := range entries {
		name := entry.Name()
		if entry.IsDir() || !strings.HasSuffix(name, ".go") || strings.HasSuffix(name, "_test.go") {
			continue
		}
		file, err := parser.ParseFile(fset, filepath.Join(dir, name), nil, parser.ImportsOnly)
		if err != nil {
			t.Fatalf("parse %s: %v", name, err)
		}
		for _, spec := range file.Imports {
			path, err := strconv.Unquote(spec.Path.Value)
			if err != nil {
				continue
			}
			unique[path] = true
		}
	}

	out := make([]string, 0, len(unique))
	for path := range unique {
		out = append(out, path)
	}
	sort.Strings(out)
	return out
}

func moduleRoot(t *testing.T) string {
	t.Helper()
	root, err := filepath.Abs(filepath.Join("..", "..", ".."))
	if err != nil {
		t.Fatalf("resolve module root: %v", err)
	}
	if _, err := os.Stat(filepath.Join(root, "go.mod")); err != nil {
		t.Fatalf("expected go.mod at %s: %v", root, err)
	}
	return root
}
