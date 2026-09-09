package filingkit

import (
	"bytes"
	"strconv"
	"strings"
	"testing"
	"time"

	domain "github.com/helpthehive/server/internal/domain/benefits"
)

func TestRenderProducesValidPDF(t *testing.T) {
	kit, err := Generate(syntheticProfile(t), testForm(), time.Date(2026, 9, 8, 0, 0, 0, 0, time.UTC))
	if err != nil {
		t.Fatalf("Generate: %v", err)
	}
	data, err := Render(kit)
	if err != nil {
		t.Fatalf("Render: %v", err)
	}
	if !bytes.HasPrefix(data, []byte("%PDF-1.4")) {
		t.Fatal("missing PDF header")
	}
	if !bytes.HasSuffix(bytes.TrimRight(data, "\n"), []byte("%%EOF")) {
		t.Fatal("missing EOF marker")
	}

	// The xref table must point at the real object offsets.
	xrefIdx := bytes.LastIndex(data, []byte("startxref"))
	if xrefIdx < 0 {
		t.Fatal("missing startxref")
	}
	offset, err := strconv.Atoi(strings.Fields(string(data[xrefIdx+len("startxref"):]))[0])
	if err != nil {
		t.Fatalf("startxref offset: %v", err)
	}
	if !bytes.HasPrefix(data[offset:], []byte("xref")) {
		t.Fatalf("xref table not at startxref offset %d", offset)
	}

	// Streams stay uncompressed so the emitted text is inspectable.
	for _, needle := range []string{
		"Help The Hive",             // title words
		"Applicant identity",        // section A header
		"fill in by hand",           // blank-line note
		"Transcription aid",         // footer + disclaimer
		"never submits them",        // the hard rule, in the disclaimer
		"https://example.gov/apply", // where to get the official form
	} {
		if !bytes.Contains(data, []byte(needle)) {
			t.Fatalf("PDF does not contain %q", needle)
		}
	}
	if !bytes.Contains(data, []byte("Sam")) {
		t.Fatal("expected an answered value on the sheet")
	}
}

func TestRenderEmptyProfile(t *testing.T) {
	kit, err := Generate(domain.NewProfile("empty"), testForm(), time.Now())
	if err != nil {
		t.Fatalf("Generate: %v", err)
	}
	data, err := Render(kit)
	if err != nil {
		t.Fatalf("Render: %v", err)
	}
	if !bytes.HasPrefix(data, []byte("%PDF-1.4")) {
		t.Fatal("missing PDF header")
	}
	// An empty profile still yields a usable sheet: every section is blank
	// ruled lines, and the certification block is always there.
	if !bytes.Contains(data, []byte("fill in by hand")) {
		t.Fatal("empty kit should be all blank lines")
	}
	if !bytes.Contains(data, []byte("Signature")) {
		t.Fatal("certification block missing")
	}
}

func TestWinAnsiEncoding(t *testing.T) {
	encoded := encodeWinAnsi("Caf\u00e9 \u2014 \u201chi\u201d \u20ac")
	want := []byte{'C', 'a', 'f', 0xE9, ' ', 0x97, ' ', 0x93, 'h', 'i', 0x94, ' ', 0x80}
	if encoded != string(want) {
		t.Fatalf("encoded = %q, want %q", encoded, string(want))
	}
	if got := encodeWinAnsi("emoji \U0001F600 here"); !strings.Contains(got, "?") {
		t.Fatalf("unmappable rune should fall back to ?, got %q", got)
	}
	if got := pdfEscape(`a(b)\c`); got != `a\(b\)\\c` {
		t.Fatalf("escape = %q", got)
	}
}

func TestWrapBreaksLongWords(t *testing.T) {
	lines := wrap("https://example.gov/a/very/long/path/that/keeps/going", fontBody, 9.5, 100)
	if len(lines) < 2 {
		t.Fatalf("long URL was not broken: %v", lines)
	}
	for _, line := range lines {
		if measure(line, fontBody, 9.5) > 100.001 {
			t.Fatalf("line overflows: %q", line)
		}
	}
}
