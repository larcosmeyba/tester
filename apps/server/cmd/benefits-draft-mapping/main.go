// Command benefits-draft-mapping produces a starting point for a form mapping.
//
// It inspects a blank government PDF and, if an AI provider is configured, asks
// it which Help The Hive field path each form field probably corresponds to.
// The result is a draft file for a person to read, correct and commit.
//
// What this command is not: a way to fill anything. The draft it writes has no
// effect until somebody reviews it and puts it in the forms directory, and the
// server refuses to load a mapping whose fields do not match the real PDF. The
// model helps write the mapping once; the mapping fills every application after
// that, deterministically.
//
// The model is shown the blank form's structure and the field vocabulary, and
// nothing else. No applicant data exists in this program.
//
//	BENEFITS_AI_PROVIDER=anthropic \
//	BENEFITS_AI_API_KEY=... \
//	go run ./cmd/benefits-draft-mapping \
//	  -program SNAP -state CA -code "CF 285" -version 2026.01 \
//	  -out forms/us/ca/snap/cf285/2026.01/mapping.draft.json \
//	  path/to/form.pdf
package main

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"os"
	"strings"
	"time"

	domain "github.com/helpthehive/server/internal/domain/benefits"
	"github.com/helpthehive/server/internal/modules/benefits/aiprovider"
	"github.com/helpthehive/server/internal/modules/benefits/assist"
	"github.com/helpthehive/server/internal/modules/benefits/pdf"
)

func main() {
	var (
		program = flag.String("program", "", "benefit program, e.g. SNAP")
		state   = flag.String("state", "", "two-letter state code, e.g. CA")
		country = flag.String("country", "US", "country code")
		code    = flag.String("code", "", "the agency's form code, e.g. \"CF 285\"")
		title   = flag.String("title", "", "the form's printed title")
		version = flag.String("version", "", "the form's version, e.g. 2026.01")
		id      = flag.String("id", "", "mapping id (default: derived from country, state, program and code)")
		out     = flag.String("out", "", "where to write the draft (default: stdout)")
	)
	flag.Parse()

	if flag.NArg() != 1 {
		fmt.Fprintln(os.Stderr, "usage: benefits-draft-mapping [flags] <form.pdf>")
		flag.PrintDefaults()
		os.Exit(2)
	}
	if *program == "" || *version == "" {
		fail(errors.New("-program and -version are required"))
	}

	path := flag.Arg(0)
	file, err := os.Open(path)
	if err != nil {
		fail(err)
	}
	defer file.Close()

	inventory, err := pdf.Inspect(file)
	if err != nil {
		fail(err)
	}
	if _, err := file.Seek(0, io.SeekStart); err != nil {
		fail(err)
	}
	digest := sha256.New()
	if _, err := io.Copy(digest, file); err != nil {
		fail(err)
	}

	mappingID := *id
	if mappingID == "" {
		mappingID = strings.ToLower(strings.Join(nonEmpty(*country, *state, *program, *code), "-"))
		mappingID = strings.ReplaceAll(mappingID, " ", "-")
	}

	suggestions := suggest(inventory)

	mapping := domain.FormMapping{
		SchemaVersion:     domain.MappingSchemaVersion,
		ID:                mappingID,
		Jurisdiction:      domain.Jurisdiction{Country: *country, State: *state},
		Program:           *program,
		FormCode:          *code,
		FormTitle:         *title,
		FormVersion:       *version,
		Revision:          1,
		Status:            "draft",
		VocabularyVersion: domain.VocabularyVersion,
		Template: domain.TemplateRef{
			Kind:      templateKind(inventory),
			File:      "template.pdf",
			SHA256:    hex.EncodeToString(digest.Sum(nil)),
			PageCount: inventory.PageCount,
		},
	}

	mapped := map[string]domain.FieldPath{}
	for _, suggestion := range suggestions.Suggestions {
		mapped[suggestion.FormField] = suggestion.FieldPath
	}

	for _, field := range inventory.Fields {
		fieldPath, ok := mapped[field.Name]
		if !ok {
			continue
		}
		mapping.Fields = append(mapping.Fields, domain.FieldMapping{
			ID:     fieldID(field.Name),
			Target: domain.Target{Type: targetType(field.Type), Name: field.Name},
			Source: domain.SourceRef{FieldPath: fieldPath},
			Note:   "DRAFT: proposed automatically, not yet reviewed by a person",
		})
	}

	encoded, err := json.MarshalIndent(mapping, "", "  ")
	if err != nil {
		fail(err)
	}
	encoded = append(encoded, '\n')

	if *out == "" {
		os.Stdout.Write(encoded)
	} else if err := os.WriteFile(*out, encoded, 0o644); err != nil {
		fail(err)
	}

	report(os.Stderr, inventory, suggestions, *out)
}

// suggest asks the configured aiprovider. With no provider configured this is not
// a failure: it returns nothing, and the draft comes out as an empty skeleton
// with every field listed for a person to map by hand. That is the honest
// default, and the whole system works that way — the AI is a convenience for
// whoever writes the mapping, never a dependency.
func suggest(inventory pdf.Inventory) assist.Result {
	aiProvider, err := aiprovider.New(providerConfig())
	if err != nil {
		fmt.Fprintf(os.Stderr, "AI provider not usable (%v); writing an empty draft\n", err)
		return assist.Result{Unmapped: fieldNames(inventory)}
	}

	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	result, err := assist.NewSuggester(aiProvider).Suggest(ctx, inventory)
	if err != nil {
		if !errors.Is(err, aiprovider.ErrNoProvider) {
			fmt.Fprintf(os.Stderr, "no suggestions (%v); writing an empty draft\n", err)
		}
		return assist.Result{Unmapped: fieldNames(inventory)}
	}
	return result
}

// providerConfig reads the benefits system's own provider settings.
func providerConfig() aiprovider.Config {
	return aiprovider.LoadConfig()
}

func report(w io.Writer, inventory pdf.Inventory, result assist.Result, out string) {
	fmt.Fprintf(w, "\n%d of %d fields have a proposed mapping.\n", len(result.Suggestions), len(inventory.Fields))
	if len(result.Rejected) > 0 {
		fmt.Fprintf(w, "\n%d suggestions were discarded because they did not name a real field or a real path:\n", len(result.Rejected))
		for _, rejected := range result.Rejected {
			fmt.Fprintf(w, "  - %s\n", rejected)
		}
	}
	if len(result.Unmapped) > 0 {
		fmt.Fprintf(w, "\n%d fields need a person to map them:\n", len(result.Unmapped))
		for _, name := range result.Unmapped {
			fmt.Fprintf(w, "  - %s\n", name)
		}
	}
	fmt.Fprintln(w, "\nThis is a draft. Nothing here fills a form until you have checked every")
	fmt.Fprintln(w, "line against the printed PDF, added transforms and requirements, marked the")
	fmt.Fprintln(w, "signature fields as fillPolicy \"never\", and set status to \"active\".")
	if out != "" {
		fmt.Fprintf(w, "\nWritten to %s\n", out)
	}
}

func templateKind(inventory pdf.Inventory) domain.TemplateKind {
	if inventory.HasAcroForm {
		return domain.TemplateAcroForm
	}
	return domain.TemplateFlat
}

func targetType(fieldType pdf.FieldType) domain.TargetType {
	switch fieldType {
	case pdf.FieldCheckbox:
		return domain.TargetCheckbox
	case pdf.FieldRadio:
		return domain.TargetRadio
	case pdf.FieldDropdown:
		return domain.TargetDropdown
	case pdf.FieldListbox:
		return domain.TargetListbox
	}
	return domain.TargetText
}

// fieldID turns a PDF field name into something readable in a mapping file.
func fieldID(name string) string {
	replacer := strings.NewReplacer(".", "_", "[", "_", "]", "", " ", "_", "-", "_")
	return strings.ToLower(strings.Trim(replacer.Replace(name), "_"))
}

func fieldNames(inventory pdf.Inventory) []string {
	names := make([]string, 0, len(inventory.Fields))
	for _, field := range inventory.Fields {
		names = append(names, field.Name)
	}
	return names
}

func nonEmpty(values ...string) []string {
	out := make([]string, 0, len(values))
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			out = append(out, value)
		}
	}
	return out
}

func fail(err error) {
	fmt.Fprintln(os.Stderr, "benefits-draft-mapping:", err)
	os.Exit(1)
}
