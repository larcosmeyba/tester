package pdf

import (
	"io"
	"strconv"
	"strings"

	pdfcpu "github.com/pdfcpu/pdfcpu/pkg/pdfcpu"
	"github.com/pdfcpu/pdfcpu/pkg/pdfcpu/model"
)

// Text extraction with positions.
//
// pdfcpu can hand back a page's content stream but not its text, so this reads
// the stream itself: enough of the text-showing operators to know what a page
// says and roughly where on the page it says it.
//
// Two things depend on it, and neither would work without positions.
//
// Government forms name their fields terribly. California's SNAP application
// has 1,444 fields called "Text1 PG 1", "Check Bo34 PG 1" and so on — a name
// tells you nothing, and the only thing that identifies a box is the printed
// label beside it. Reading the label makes those forms mappable.
//
// And two thirds of the state forms in this collection have no form fields at
// all. They are print-and-fill PDFs, but they are text-based rather than
// scanned, so their labels and the ruled lines beside them can be found rather
// than measured by hand.
//
// This is not a general-purpose text extractor. It handles the operators these
// forms actually use, positions each run by its text matrix, and approximates
// advance width. That is accurate enough to say which label sits beside which
// box, which is all it is for.

// TextRun is a piece of text and where it starts, in PDF user space with the
// page's bottom-left corner as the origin.
type TextRun struct {
	Text string
	X, Y float64
	Size float64
}

// PageText returns the text runs on one page, in the order the page draws them.
func PageText(ctx *model.Context, pageNr int) ([]TextRun, error) {
	reader, err := pdfcpu.ExtractPageContent(ctx, pageNr)
	if err != nil || reader == nil {
		return nil, err
	}
	content, err := io.ReadAll(reader)
	if err != nil {
		return nil, err
	}
	return parseTextRuns(content, pageFontDecoders(ctx, pageNr)), nil
}

// matrix is the subset of a PDF transformation matrix that matters here:
// scale and translation. Rotation and skew are carried through the multiply
// but never inspected, because a form's labels are not set at an angle.
type matrix struct{ a, b, c, d, e, f float64 }

var identity = matrix{a: 1, d: 1}

func (m matrix) mul(n matrix) matrix {
	return matrix{
		a: m.a*n.a + m.b*n.c,
		b: m.a*n.b + m.b*n.d,
		c: m.c*n.a + m.d*n.c,
		d: m.c*n.b + m.d*n.d,
		e: m.e*n.a + m.f*n.c + n.e,
		f: m.e*n.b + m.f*n.d + n.f,
	}
}

func parseTextRuns(content []byte, decoders map[string]*fontDecoder) []TextRun {
	var (
		runs      []TextRun
		operands  []token
		ctm       = identity
		stack     []matrix
		textM     = identity
		lineM     = identity
		fontSize  float64
		leading   float64
		inText    bool
		decoder   *fontDecoder
	)

	emit := func(raw string) {
		// The bytes only mean something through the current font.
		s := decoder.decode(raw)
		if strings.TrimSpace(s) == "" {
			return
		}
		placed := textM.mul(ctm)
		size := fontSize * placed.d
		if size < 0 {
			size = -size
		}
		runs = append(runs, TextRun{Text: s, X: placed.e, Y: placed.f, Size: size})
		// Advance the text matrix by an approximate width, so several runs
		// shown from one position do not all land on top of each other.
		textM = matrix{a: 1, d: 1, e: approxWidth(s, fontSize)}.mul(textM)
	}

	for _, tok := range tokenize(content) {
		if tok.kind != tokenOperator {
			operands = append(operands, tok)
			if len(operands) > 8 {
				operands = operands[len(operands)-8:]
			}
			continue
		}

		switch tok.text {
		case "q":
			stack = append(stack, ctm)
		case "Q":
			if n := len(stack); n > 0 {
				ctm = stack[n-1]
				stack = stack[:n-1]
			}
		case "cm":
			if len(operands) >= 6 {
				n := numbers(operands, 6)
				ctm = matrix{n[0], n[1], n[2], n[3], n[4], n[5]}.mul(ctm)
			}
		case "BT":
			inText, textM, lineM = true, identity, identity
		case "ET":
			inText = false
		case "Tf":
			if len(operands) >= 2 {
				fontSize = numbers(operands, 1)[0]
				if name := operands[len(operands)-2]; name.kind == tokenName {
					decoder = decoders[name.text]
				}
			}
		case "TL":
			if len(operands) >= 1 {
				leading = numbers(operands, 1)[0]
			}
		case "Tm":
			if len(operands) >= 6 {
				n := numbers(operands, 6)
				textM = matrix{n[0], n[1], n[2], n[3], n[4], n[5]}
				lineM = textM
			}
		case "Td":
			if len(operands) >= 2 {
				n := numbers(operands, 2)
				lineM = matrix{a: 1, d: 1, e: n[0], f: n[1]}.mul(lineM)
				textM = lineM
			}
		case "TD":
			if len(operands) >= 2 {
				n := numbers(operands, 2)
				leading = -n[1]
				lineM = matrix{a: 1, d: 1, e: n[0], f: n[1]}.mul(lineM)
				textM = lineM
			}
		case "T*":
			lineM = matrix{a: 1, d: 1, f: -leading}.mul(lineM)
			textM = lineM
		case "Tj", "'", "\"":
			if !inText {
				break
			}
			if tok.text != "Tj" {
				lineM = matrix{a: 1, d: 1, f: -leading}.mul(lineM)
				textM = lineM
			}
			if len(operands) >= 1 {
				last := operands[len(operands)-1]
				if last.kind == tokenString {
					emit(last.text)
				}
			}
		case "TJ":
			if !inText || len(operands) == 0 {
				break
			}
			last := operands[len(operands)-1]
			if last.kind == tokenArray {
				emit(last.text)
			}
		}
		operands = operands[:0]
	}
	return runs
}

func numbers(operands []token, n int) []float64 {
	out := make([]float64, n)
	start := len(operands) - n
	if start < 0 {
		return out
	}
	for i := 0; i < n; i++ {
		out[i], _ = strconv.ParseFloat(operands[start+i].text, 64)
	}
	return out
}

// approxWidth estimates how far a string advances. Half the point size per
// character is close enough for the proportional fonts these forms use, and
// the only thing that depends on it is whether two runs on one line are told
// apart.
func approxWidth(s string, size float64) float64 {
	return float64(len([]rune(s))) * size * 0.5
}
