package filingkit

import (
	"bytes"
	"fmt"
	"strings"
)

// A minimal PDF 1.4 writer, stdlib only.
//
// The kit needs a clean printable answer sheet — text, ruled lines, a footer —
// not form fields or overlays, so it does not go through the benefits pdf
// package (which manipulates existing templates). This writer emits a fixed
// structure: catalog, pages, three Type1 base-14 fonts, one uncompressed
// content stream per page. Streams stay uncompressed deliberately: the bytes
// are debuggable and the unit tests can assert on the emitted text.
//
// Text is WinAnsi-encoded (cp1252). Latin-1 and common punctuation round-trip
// exactly; anything outside it becomes "?" — documented on the sheet's own
// terms in DESIGN.md.

// winAnsiExtras maps runes outside Latin-1 to their Windows-1252 byte.
// ASCII passes through unchanged; Latin-1 (U+0080–U+00FF) maps to the same
// byte value.
var winAnsiExtras = map[rune]byte{
	'€': 0x80, '‚': 0x82, 'ƒ': 0x83, '„': 0x84, '…': 0x85,
	'†': 0x86, '‡': 0x87, 'ˆ': 0x88, '‰': 0x89, 'Š': 0x8A,
	'‹': 0x8B, 'Œ': 0x8C, 'Ž': 0x8E, '‘': 0x91, '’': 0x92,
	'“': 0x93, '”': 0x94, '•': 0x95, '–': 0x96, '—': 0x97,
	'˜': 0x98, '™': 0x99, 'š': 0x9A, '›': 0x9B, 'œ': 0x9C,
	'ž': 0x9E, 'Ÿ': 0x9F,
}

// encodeWinAnsi renders s as WinAnsi bytes for a PDF string literal.
func encodeWinAnsi(s string) string {
	var b strings.Builder
	b.Grow(len(s))
	for _, r := range s {
		switch {
		case r < 0x80:
			b.WriteByte(byte(r))
		case r <= 0xFF:
			b.WriteByte(byte(r))
		default:
			if code, ok := winAnsiExtras[r]; ok {
				b.WriteByte(code)
			} else {
				b.WriteByte('?')
			}
		}
	}
	return b.String()
}

// pdfEscape escapes a WinAnsi string for a PDF literal: backslash,
// parentheses, and control bytes.
func pdfEscape(s string) string {
	var b strings.Builder
	b.Grow(len(s) + 8)
	for i := 0; i < len(s); i++ {
		c := s[i]
		switch c {
		case '\\', '(', ')':
			b.WriteByte('\\')
			b.WriteByte(c)
		default:
			if c < 0x20 || c == 0x7F {
				b.WriteByte(' ')
				continue
			}
			b.WriteByte(c)
		}
	}
	return b.String()
}

// pdfString renders s as a PDF string literal, WinAnsi-encoded and escaped.
func pdfString(s string) string {
	return "(" + pdfEscape(encodeWinAnsi(s)) + ")"
}

// buildPDF assembles one PDF from per-page content streams.
func buildPDF(pageContents []string) ([]byte, error) {
	n := len(pageContents)
	if n == 0 {
		return nil, fmt.Errorf("filingkit: a PDF needs at least one page")
	}

	// Deterministic numbering: 1 catalog, 2 pages, 3–5 fonts
	// (F1 Helvetica, F2 Helvetica-Bold, F3 Helvetica-Oblique),
	// then per page i: content 6+2i, page dict 7+2i.
	// Forward references are legal in PDF, so the catalog and the
	// pages object can name objects appended later.
	pageObj := func(i int) int { return 7 + 2*i }

	objs := make([][]byte, 0, 5+2*n)
	objs = append(objs, []byte("<< /Type /Catalog /Pages 2 0 R >>"))

	kids := make([]string, n)
	for i := range pageContents {
		kids[i] = fmt.Sprintf("%d 0 R", pageObj(i))
	}
	objs = append(objs, []byte(fmt.Sprintf("<< /Type /Pages /Kids [%s] /Count %d >>",
		strings.Join(kids, " "), n)))

	objs = append(objs,
		[]byte("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>"),
		[]byte("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>"),
		[]byte("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Oblique /Encoding /WinAnsiEncoding >>"),
	)

	for i, content := range pageContents {
		stream := []byte(fmt.Sprintf("<< /Length %d >>\nstream\n%s\nendstream",
			len(content), content))
		objs = append(objs, stream)
		if len(objs) != 6+2*i {
			return nil, fmt.Errorf("filingkit: object numbering drifted at content %d", i)
		}
		page := []byte(fmt.Sprintf(
			"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] "+
				"/Resources << /Font << /F1 3 0 R /F2 4 0 R /F3 5 0 R >> >> "+
				"/Contents %d 0 R >>",
			6+2*i))
		objs = append(objs, page)
		if len(objs) != pageObj(i) {
			return nil, fmt.Errorf("filingkit: object numbering drifted at page %d", i)
		}
	}

	var buf bytes.Buffer
	buf.WriteString("%PDF-1.4\n")
	offsets := make([]int64, len(objs)+1)
	for i, body := range objs {
		offsets[i+1] = int64(buf.Len())
		fmt.Fprintf(&buf, "%d 0 obj\n", i+1)
		buf.Write(body)
		buf.WriteString("\nendobj\n")
	}
	xrefAt := int64(buf.Len())
	fmt.Fprintf(&buf, "xref\n0 %d\n", len(objs)+1)
	buf.WriteString("0000000000 65535 f \n")
	for i := 1; i <= len(objs); i++ {
		fmt.Fprintf(&buf, "%010d 00000 n \n", offsets[i])
	}
	fmt.Fprintf(&buf, "trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF\n",
		len(objs)+1, xrefAt)
	return buf.Bytes(), nil
}
