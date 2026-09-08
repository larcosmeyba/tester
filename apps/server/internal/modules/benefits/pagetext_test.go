package benefits

import (
	"bytes"
	"io"
	"testing"

	"github.com/pdfcpu/pdfcpu/pkg/api"
	pdfcpu "github.com/pdfcpu/pdfcpu/pkg/pdfcpu"
	"github.com/pdfcpu/pdfcpu/pkg/pdfcpu/model"
)

// pageText returns a page's content stream, so a test can assert what is
// actually drawn rather than trusting that a resolution implies ink on paper.
func pageText(t *testing.T, document []byte, pageNr int) string {
	t.Helper()
	conf := model.NewDefaultConfiguration()
	conf.ValidationMode = model.ValidationRelaxed
	ctx, err := api.ReadValidateAndOptimize(bytes.NewReader(document), conf)
	if err != nil {
		t.Fatalf("read document: %v", err)
	}
	reader, err := pdfcpu.ExtractPageContent(ctx, pageNr)
	if err != nil {
		t.Fatalf("extract page %d: %v", pageNr, err)
	}
	if reader == nil {
		return ""
	}
	content, err := io.ReadAll(reader)
	if err != nil {
		t.Fatalf("read page %d: %v", pageNr, err)
	}
	return string(content)
}
