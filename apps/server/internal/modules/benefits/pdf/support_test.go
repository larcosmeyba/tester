package pdf

import (
	"bytes"
	"fmt"
	"strings"
	"testing"
)

// An XFA form's fields live in an XML payload the engine cannot read, so its
// AcroForm looks empty. Treating that as "a flat form with no fields" would
// invite somebody to write coordinates for boxes that are not where they think,
// and the applicant would sign whatever the viewer decided to show.
func TestAnXFAFormIsRefusedRatherThanReadAsEmpty(t *testing.T) {
	_, err := Inspect(bytes.NewReader(buildXFAFixture(t)))
	if err == nil {
		t.Fatal("an XFA form must not be read as an ordinary one")
	}
	if !IsUnsupported(err) {
		t.Fatalf("expected an unsupported-PDF error, got %v", err)
	}
	if UnsupportedKind(err) != "xfa" {
		t.Errorf("expected the reason reported as xfa, got %q", UnsupportedKind(err))
	}
	// The message is read by whoever is onboarding the form, so it has to say
	// what to do next.
	if !strings.Contains(err.Error(), "XFA") || !strings.Contains(err.Error(), "agency") {
		t.Errorf("the error should name XFA and suggest a way forward, got: %v", err)
	}
}

// A hybrid file carries both an XFA payload and a real AcroForm. Every viewer
// falls back to the AcroForm, so it can be filled and must not be refused.
func TestAHybridXFAFormWithRealFieldsIsStillUsable(t *testing.T) {
	inventory, err := Inspect(bytes.NewReader(buildFixture(t)))
	if err != nil {
		t.Fatalf("a hybrid form should still be readable, got %v", err)
	}
	if len(inventory.Fields) == 0 {
		t.Fatal("expected the AcroForm fields to be found")
	}
}

func TestAnOrdinaryFormIsNotRefused(t *testing.T) {
	if _, err := Inspect(bytes.NewReader(buildFixture(t))); err != nil {
		t.Fatalf("a normal AcroForm must not be refused: %v", err)
	}
}

func TestGarbageIsReportedAsUnreadableNotFilled(t *testing.T) {
	_, err := Inspect(bytes.NewReader([]byte("this is not a PDF at all")))
	if err == nil {
		t.Fatal("expected a clear failure rather than an empty inventory")
	}
}

// A truncated download must fail rather than produce a partial document.
func TestATruncatedDocumentIsRefused(t *testing.T) {
	full := buildFixture(t)
	if _, err := Inspect(bytes.NewReader(full[:len(full)/2])); err == nil {
		t.Fatal("half a PDF must not read as a whole one")
	}
}

// buildXFAFixture writes a minimal pure-XFA document by hand.
//
// It is assembled from raw PDF bytes rather than through pdfcpu because
// pdfcpu's writer drops an AcroForm whose /Fields array is empty — which is
// exactly the shape a pure XFA form has. Building it directly also means the
// test exercises the real read path against the real structure, rather than
// against whatever a round-trip happened to preserve.
func buildXFAFixture(t *testing.T) []byte {
	t.Helper()

	objects := []string{
		"<< /Type /Catalog /Pages 2 0 R /AcroForm << /Fields [] /XFA 5 0 R >> >>",
		"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
		"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << >> >>",
	}

	// A drawn box rather than text: no font resource to declare, which keeps
	// the fixture to the structure under test.
	content := "0 0 0 RG 1 w 72 690 200 20 re S\n"
	objects = append(objects, fmt.Sprintf("<< /Length %d >>\nstream\n%sendstream", len(content), content))

	payload := `<?xml version="1.0"?><xdp:xdp xmlns:xdp="http://ns.adobe.com/xdp/"><template/></xdp:xdp>`
	objects = append(objects, fmt.Sprintf("<< /Length %d >>\nstream\n%s\nendstream", len(payload), payload))

	var out bytes.Buffer
	out.WriteString("%PDF-1.7\n")
	offsets := make([]int, len(objects)+1)
	for i, object := range objects {
		offsets[i+1] = out.Len()
		fmt.Fprintf(&out, "%d 0 obj\n%s\nendobj\n", i+1, object)
	}

	startxref := out.Len()
	fmt.Fprintf(&out, "xref\n0 %d\n0000000000 65535 f \n", len(objects)+1)
	for i := 1; i <= len(objects); i++ {
		fmt.Fprintf(&out, "%010d 00000 n \n", offsets[i])
	}
	fmt.Fprintf(&out, "trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF\n",
		len(objects)+1, startxref)

	return out.Bytes()
}
