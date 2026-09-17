package benefits

import (
	"bytes"
	"encoding/json"
	"go/ast"
	"go/parser"
	"go/token"
	"log/slog"
	"os"
	"path/filepath"
	"strings"
	"testing"

	domain "github.com/helpthehive/server/internal/domain/benefits"
)

// What must never leave the server, and what must never reach a log line.
//
// A benefits application is a household's name, address, income, dates of birth
// and often a Social Security number. The rules below are the ones that would
// be easiest to break by accident during a debugging session, so they are
// tested rather than trusted.

// The audit trail records which answer fed which box. It must not record the
// answer: it already lives in the profile and on the document, and a third copy
// is a third thing to protect and a third thing to leak.
func TestTheAuditTrailStoresNoAnswers(t *testing.T) {
	form := missouriForm(t)
	resolution := domain.Resolve(completeProfile(t), form.Mapping)

	if len(resolution.Filled) == 0 {
		t.Fatal("expected the profile to fill something")
	}

	secrets := []string{"Rivera", "Ana", "123-45-6789", "123456789", "140 Mission Street",
		"555-123-4567", "ana.rivera@example.com", "Springfield", "65806", "1988"}

	for _, field := range auditFields(resolution) {
		encoded, err := json.Marshal(field)
		if err != nil {
			t.Fatalf("encode audit field: %v", err)
		}
		for _, secret := range secrets {
			if bytes.Contains(encoded, []byte(secret)) {
				t.Errorf("the audit row for %q carries an answer (%q): %s", field.FieldID, secret, encoded)
			}
		}
	}
}

// A problem explains why a value could not be written. It must describe the box
// and the shape of the failure, never quote the value into somewhere that gets
// logged and stored.
func TestProblemReasonsDoNotQuoteSensitiveValues(t *testing.T) {
	profile := domain.NewProfile("u1")
	// Immigration status is sensitive but collectible (unlike the
	// never-collected SSN), so it exercises the masking machinery.
	if err := profile.Set("applicant.immigration_status", domain.Text("permanent resident", domain.SourceUser)); err != nil {
		t.Fatalf("set: %v", err)
	}

	mapping := &domain.FormMapping{
		SchemaVersion: domain.MappingSchemaVersion,
		ID:            "t", FormVersion: "2026.01", Revision: 1, Status: "draft",
		VocabularyVersion: domain.VocabularyVersion,
		Template:          domain.TemplateRef{Kind: domain.TemplateAcroForm, File: "t.pdf", SHA256: strings.Repeat("a", 64), PageCount: 1},
		Fields: []domain.FieldMapping{{
			ID:     "immigration_status_as_date",
			Target: domain.Target{Type: domain.TargetText, Name: "Immigration Status"},
			Source: domain.SourceRef{FieldPath: "applicant.immigration_status"},
			// A date transform on a text answer fails, which is the
			// point: the failure must not carry the answer.
			Transforms: []domain.Transform{{Op: domain.OpDate, Layout: "01/02/2006"}},
		}},
	}

	resolution := domain.Resolve(profile, mapping)
	if len(resolution.Problems) == 0 {
		t.Fatal("expected the transform to fail")
	}
	for _, problem := range resolution.Problems {
		if strings.Contains(problem.Reason, "permanent resident") {
			t.Errorf("a problem quoted a sensitive answer: %s", problem.Reason)
		}
	}
}

// The service logs progress. Nothing it logs may be an answer.
func TestServiceLogsCarryNoAnswers(t *testing.T) {
	var captured bytes.Buffer
	logger := slog.New(slog.NewJSONHandler(&captured, nil))

	form := missouriForm(t)
	resolution := domain.Resolve(completeProfile(t), form.Mapping)

	logger.Info("benefits application filled",
		"application_id", "app-1",
		"form", form.Key(),
		"status", StatusReadyForReview,
		"filled", len(resolution.Filled),
		"missing", len(resolution.Missing),
		"problems", len(resolution.Problems),
	)

	for _, secret := range []string{"Rivera", "123456789", "140 Mission Street", "ana.rivera"} {
		if strings.Contains(captured.String(), secret) {
			t.Errorf("a log line carried %q: %s", secret, captured.String())
		}
	}
}

// The rule above is only as good as the call sites, so the call sites are
// checked directly: no logging call in the benefits packages may pass a value
// read out of a profile.
//
// It looks for the accessors that unwrap an answer — TextValue, MoneyValue and
// friends — appearing as an argument to a log call. Those are the only ways to
// get a raw answer out of the domain, so this catches the mistake at its source.
func TestNoLogCallPassesAnUnwrappedAnswer(t *testing.T) {
	accessors := map[string]bool{
		"TextValue": true, "NumberValue": true, "MoneyValue": true,
		"DateValue": true, "BoolValue": true, "ListValue": true,
	}
	logMethods := map[string]bool{"Info": true, "Warn": true, "Error": true, "Debug": true}

	root := serverRoot(t)
	for _, dir := range []string{
		"internal/domain/benefits",
		"internal/modules/benefits",
		"internal/modules/benefits/pdf",
		"internal/modules/benefits/assist",
		"internal/modules/benefits/secrets",
	} {
		walkGoFiles(t, filepath.Join(root, dir), func(path string, file *ast.File, fset *token.FileSet) {
			ast.Inspect(file, func(node ast.Node) bool {
				call, ok := node.(*ast.CallExpr)
				if !ok {
					return true
				}
				selector, ok := call.Fun.(*ast.SelectorExpr)
				if !ok || !logMethods[selector.Sel.Name] {
					return true
				}
				for _, arg := range call.Args {
					inner, ok := arg.(*ast.CallExpr)
					if !ok {
						continue
					}
					if innerSel, ok := inner.Fun.(*ast.SelectorExpr); ok && accessors[innerSel.Sel.Name] {
						t.Errorf("%s:%d passes %s() to a log call; log the field path, never the answer",
							path, fset.Position(inner.Pos()).Line, innerSel.Sel.Name)
					}
				}
				return true
			})
		})
	}
}

// A Value must not be able to spill its contents into a log line through the
// default formatting of a struct.
func TestAValueCannotBeFormattedIntoALogLine(t *testing.T) {
	value := domain.Text("123456789", domain.SourceUser)
	if strings.Contains(value.Redacted(), "123456789") {
		t.Fatal("Redacted leaked the answer")
	}
	if _, ok := any(value).(interface{ String() string }); ok {
		t.Fatal("Value must not implement String")
	}
}

// serverRoot locates apps/server from this package's directory.
func serverRoot(t *testing.T) string {
	t.Helper()
	root, err := filepath.Abs(filepath.Join("..", "..", ".."))
	if err != nil {
		t.Fatalf("resolve server root: %v", err)
	}
	if _, err := os.Stat(filepath.Join(root, "go.mod")); err != nil {
		t.Fatalf("expected go.mod at %s: %v", root, err)
	}
	return root
}

func walkGoFiles(t *testing.T, dir string, visit func(string, *ast.File, *token.FileSet)) {
	t.Helper()
	entries, err := os.ReadDir(dir)
	if err != nil {
		t.Fatalf("read %s: %v", dir, err)
	}
	fset := token.NewFileSet()
	for _, entry := range entries {
		name := entry.Name()
		if entry.IsDir() || !strings.HasSuffix(name, ".go") || strings.HasSuffix(name, "_test.go") {
			continue
		}
		path := filepath.Join(dir, name)
		file, err := parser.ParseFile(fset, path, nil, 0)
		if err != nil {
			t.Fatalf("parse %s: %v", path, err)
		}
		visit(path, file, fset)
	}
}
