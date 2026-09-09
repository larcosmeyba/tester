package pdf

import (
	"bytes"
	"io"
	"testing"

	pdfcpu "github.com/pdfcpu/pdfcpu/pkg/pdfcpu"
)

// pageContent returns a page's decoded content stream. Tests use it to check
// what is actually drawn on the page, rather than trusting that a field value
// implies a mark on paper.
func pageContent(t *testing.T, data []byte, pageNr int) []byte {
	t.Helper()
	ctx, err := readContext(bytes.NewReader(data))
	if err != nil {
		t.Fatalf("read pdf: %v", err)
	}
	reader, err := pdfcpu.ExtractPageContent(ctx, pageNr)
	if err != nil {
		t.Fatalf("extract page %d content: %v", pageNr, err)
	}
	if reader == nil {
		return nil
	}
	content, err := io.ReadAll(reader)
	if err != nil {
		t.Fatalf("read page %d content: %v", pageNr, err)
	}
	return content
}
