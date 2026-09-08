package pdf

import (
	"fmt"
	"strings"

	"github.com/pdfcpu/pdfcpu/pkg/font"
)

// The overlay renderer draws with the PDF base-14 fonts, which are always
// available and never need embedding. They are encoded WinAnsi (Windows-1252).
//
// That has a real limit, and it is deliberately a hard error rather than a
// silent substitution: a name like "Nguyễn" has characters WinAnsi cannot
// represent, and writing "Nguyn" onto a benefits application would be a
// corrupted legal name. Such a value is reported as a field problem for the
// reviewer instead. Lifting the limit means embedding a Unicode TrueType font;
// until then, unrepresentable text is surfaced, not mangled.

// DefaultFont is used when a flat mapping does not name one.
const DefaultFont = "Helvetica"

var supportedFonts = map[string]bool{
	"Helvetica": true, "Helvetica-Bold": true, "Helvetica-Oblique": true, "Helvetica-BoldOblique": true,
	"Times-Roman": true, "Times-Bold": true, "Times-Italic": true, "Times-BoldItalic": true,
	"Courier": true, "Courier-Bold": true, "Courier-Oblique": true, "Courier-BoldOblique": true,
}

// SupportedFont reports whether a mapping may ask for this font.
func SupportedFont(name string) bool { return supportedFonts[name] }

// SupportedFonts lists the fonts a flat mapping may name.
func SupportedFonts() []string {
	names := make([]string, 0, len(supportedFonts))
	for name := range supportedFonts {
		names = append(names, name)
	}
	return names
}

// winAnsiHighRange maps the characters Windows-1252 places in 0x80-0x9F, where
// Latin-1 has control codes.
var winAnsiHighRange = map[rune]byte{
	'€': 0x80, '‚': 0x82, 'ƒ': 0x83, '„': 0x84, '…': 0x85,
	'†': 0x86, '‡': 0x87, 'ˆ': 0x88, '‰': 0x89, 'Š': 0x8A,
	'‹': 0x8B, 'Œ': 0x8C, 'Ž': 0x8E, '‘': 0x91, '’': 0x92,
	'“': 0x93, '”': 0x94, '•': 0x95, '–': 0x96, '—': 0x97,
	'˜': 0x98, '™': 0x99, 'š': 0x9A, '›': 0x9B, 'œ': 0x9C,
	'ž': 0x9E, 'Ÿ': 0x9F,
}

// UnrepresentableError names the exact character that could not be written, so
// the reviewer sees what to do about it rather than a generic failure.
type UnrepresentableError struct {
	Char rune
	Text string
}

func (e *UnrepresentableError) Error() string {
	return fmt.Sprintf("the character %q cannot be written with the form's font, and this system will not drop it from the value silently", string(e.Char))
}

// encodeWinAnsi converts text to Windows-1252 bytes, refusing anything it
// cannot represent exactly.
func encodeWinAnsi(text string) ([]byte, error) {
	out := make([]byte, 0, len(text))
	for _, r := range text {
		switch {
		case r == '\n' || r == '\r' || r == '\t':
			out = append(out, ' ')
		case r < 0x80:
			out = append(out, byte(r))
		case r >= 0xA0 && r <= 0xFF:
			out = append(out, byte(r))
		default:
			if b, ok := winAnsiHighRange[r]; ok {
				out = append(out, b)
				continue
			}
			return nil, &UnrepresentableError{Char: r, Text: text}
		}
	}
	return out, nil
}

// escapePDFString wraps encoded bytes as a PDF literal string. The three
// characters that terminate or escape a literal are backslash-escaped, and
// everything outside printable ASCII goes out as an octal escape so the content
// stream stays 7-bit clean and safe to diff.
func escapePDFString(encoded []byte) string {
	var out strings.Builder
	out.WriteByte('(')
	for _, b := range encoded {
		switch {
		case b == '(' || b == ')' || b == '\\':
			out.WriteByte('\\')
			out.WriteByte(b)
		case b < 0x20 || b > 0x7E:
			fmt.Fprintf(&out, "\\%03o", b)
		default:
			out.WriteByte(b)
		}
	}
	out.WriteByte(')')
	return out.String()
}

// textWidth measures a string at a font size, in points.
func textWidth(text, fontName string, size float64) (float64, error) {
	width, err := font.TextWidthFloat(text, fontName, size)
	if err != nil {
		return 0, fmt.Errorf("measure text in %s: %w", fontName, err)
	}
	return width, nil
}
