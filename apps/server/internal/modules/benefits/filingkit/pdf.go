package filingkit

import (
	"fmt"
	"strings"

	pdffont "github.com/pdfcpu/pdfcpu/pkg/font"
)

// Rendering: layout turns a Kit into per-page content streams, then
// pdfwrite.go assembles the file. US Letter, base-14 Type1 fonts only, so the
// sheet prints anywhere without embedded fonts.

const (
	pageWidth   = 612.0
	pageHeight  = 792.0
	margin      = 54.0
	footerY     = 38.0
	labelWidth  = 168.0
	columnGap   = 10.0
	valueX      = margin + labelWidth + columnGap
	valueWidth  = pageWidth - margin - valueX
	lineSpacing = 1.4
)

const (
	// Content-stream font keys (match the /Resources dict in the writer);
	// pdffontName maps each key to the base-14 name used for measuring.
	fontBody   = "F1"
	fontBold   = "F2"
	fontItalic = "F3"
)

// measure returns the width of s in points. It measures the WinAnsi-encoded
// bytes — the same bytes that reach the page — so wrapping never drifts from
// what is drawn. fontName is a content-stream key (F1/F2/F3); it is mapped to
// the base-14 name the width tables are registered under.
func measure(s, fontName string, size float64) float64 {
	encoded := encodeWinAnsi(s)
	var total int
	for i := 0; i < len(encoded); i++ {
		w, err := pdffont.CharWidth(pdffontName(fontName), rune(encoded[i]))
		if err != nil || w <= 0 {
			w = 600
		}
		total += w
	}
	return float64(total) * size / 1000
}

// pdffontName maps a content-stream font key to its base-14 font name.
func pdffontName(key string) string {
	switch key {
	case fontBold:
		return "Helvetica-Bold"
	case fontItalic:
		return "Helvetica-Oblique"
	default:
		return "Helvetica"
	}
}

// wrap greedly fills lines to maxWidth, breaking overlong words.
func wrap(s, fontName string, size, maxWidth float64) []string {
	var lines []string
	for _, raw := range strings.Split(s, "\n") {
		words := strings.Fields(raw)
		if len(words) == 0 {
			lines = append(lines, "")
			continue
		}
		current := ""
		flush := func() {
			if current != "" {
				lines = append(lines, current)
				current = ""
			}
		}
		for _, word := range words {
			for measure(word, fontName, size) > maxWidth && len(word) > 1 {
				// Break an overlong word (a URL, usually) at the widest
				// prefix that fits.
				cut := len(word)
				for cut > 1 && measure(word[:cut], fontName, size) > maxWidth {
					cut--
				}
				flush()
				lines = append(lines, word[:cut])
				word = word[cut:]
			}
			candidate := word
			if current != "" {
				candidate = current + " " + word
			}
			if measure(candidate, fontName, size) <= maxWidth {
				current = candidate
			} else {
				flush()
				current = word
			}
		}
		flush()
	}
	return lines
}

type page struct {
	ops strings.Builder
}

type layout struct {
	pages []*page
	cur   *page
	y     float64

	// sectionHead tracks the open section so a page break mid-section can
	// repeat its header marked "(continued)".
	sectionHead string
}

func (l *layout) newPage() {
	l.cur = &page{}
	l.pages = append(l.pages, l.cur)
	l.y = pageHeight - margin
	if l.sectionHead != "" {
		l.drawSectionHead(l.sectionHead + " (continued)")
	}
}

func (l *layout) ensureSpace(need float64) {
	if l.y-need < footerY+margin/2 {
		l.newPage()
	}
}

func (l *layout) text(x, y float64, font string, size float64, s string) {
	fmt.Fprintf(&l.cur.ops, "BT /%s %.2f Tf %.2f %.2f Td %s Tj ET\n",
		font, size, x, y, pdfString(s))
}

func (l *layout) rule(x1, x2, y, width float64) {
	fmt.Fprintf(&l.cur.ops, "%.2f w %.2f %.2f m %.2f %.2f l S\n",
		width, x1, y, x2, y)
}

// Render turns a Kit into a printable PDF answer sheet.
func Render(k Kit) ([]byte, error) {
	l := &layout{}
	l.newPage()
	l.header(k)

	for _, sec := range k.Sections {
		l.drawSectionHead(sec.Code + " — " + sec.Title)
		for _, row := range sec.Rows {
			l.row(row)
		}
	}
	l.sectionHead = ""
	l.disclaimer(k)

	contents := make([]string, len(l.pages))
	for i, p := range l.pages {
		var footer strings.Builder
		footer.WriteString(p.ops.String())
		n := len(l.pages)
		left := "Transcription aid — not the official form"
		right := fmt.Sprintf("Page %d of %d", i+1, n)
		fmt.Fprintf(&footer, "%.2f g\n", 0.45)
		fmt.Fprintf(&footer, "BT /%s %.2f Tf %.2f %.2f Td %s Tj ET\n",
			fontBody, 8.0, margin, footerY, pdfString(left))
		rightW := measure(right, fontBody, 8)
		fmt.Fprintf(&footer, "BT /%s %.2f Tf %.2f %.2f Td %s Tj ET\n",
			fontBody, 8.0, pageWidth-margin-rightW, footerY, pdfString(right))
		footer.WriteString("0 g\n")
		contents[i] = footer.String()
	}
	return buildPDF(contents)
}

func (l *layout) header(k Kit) {
	f := k.Form
	l.text(margin, l.y, fontBold, 15, "Help The Hive — filing kit")
	l.y -= 15 * lineSpacing

	l.text(margin, l.y, fontBold, 13, f.Title)
	l.y -= 13 * lineSpacing

	stateProgram := strings.Trim(strings.TrimSpace(f.State)+" · "+strings.TrimSpace(f.Program), " ·")
	if stateProgram != "" {
		l.text(margin, l.y, fontBody, 10, stateProgram)
		l.y -= 10 * lineSpacing
	}
	formLine := ""
	if f.FormCode != "" {
		formLine = "Form " + f.FormCode
	}
	if f.Version != "" {
		formLine = strings.TrimSpace(formLine + " · " + f.Version)
	}
	if formLine != "" {
		l.text(margin, l.y, fontBody, 9.5, formLine)
		l.y -= 9.5 * lineSpacing
	}
	l.text(margin, l.y, fontBody, 9.5, "Generated "+k.GeneratedAt.Format("Jan 2, 2006"))
	l.y -= 9.5 * lineSpacing

	if f.AgencyName != "" || f.AgencyURL != "" {
		agency := strings.Trim(strings.TrimSpace(f.AgencyName)+" — "+strings.TrimSpace(f.AgencyURL), " —")
		for _, line := range wrap("Official form: "+agency, fontBody, 9.5, pageWidth-2*margin) {
			l.text(margin, l.y, fontBody, 9.5, line)
			l.y -= 9.5 * lineSpacing
		}
	}
	l.y -= 6

	intro := "This is a transcription aid, not the official form. It lists your saved answers " +
		"in the order the official form asks for them. Copy each answer onto the official paper form. " +
		"Ruled lines marked \u201cfill in by hand\u201d still need an answer — write those in yourself."
	l.y = l.paragraph(margin, l.y, pageWidth-2*margin, fontBody, 9.5, intro) - 4

	l.y -= 4
}

func (l *layout) paragraph(x, y, w float64, font string, size float64, s string) float64 {
	for _, line := range wrap(s, font, size, w) {
		l.text(x, y, font, size, line)
		y -= size * lineSpacing
	}
	return y
}

func (l *layout) drawSectionHead(head string) {
	l.ensureSpace(44)
	// Assign only after the break check: newPage repeats the *previous*
	// section's head as "(continued)", and must not see this one early.
	l.sectionHead = head
	l.y -= 6
	l.text(margin, l.y, fontBold, 11, head)
	l.y -= 11 * lineSpacing * 0.55
	l.rule(margin, pageWidth-margin, l.y, 0.75)
	l.y -= 8
}

func (l *layout) row(row Row) {
	switch {
	case row.State == RowSubhead:
		// Keep the subhead with at least one row: never orphan it at the
		// bottom of a page.
		l.ensureSpace(30 + 28)
		l.text(margin, l.y, fontBold, 10, row.Subhead)
		l.y -= 10 * lineSpacing
		if row.Note != "" {
			l.ensureSpace(20)
			l.text(margin, l.y, fontItalic, 8.5, row.Note)
			l.y -= 8.5 * lineSpacing
		}
		l.y -= 2
	case row.State == RowBlank:
		l.blankRow(row)
	case row.State == RowDeclined:
		l.ensureSpace(20)
		l.text(margin, l.y, fontBold, 9.5, row.Label)
		l.text(valueX, l.y, fontItalic, 9.5, "Declined to answer")
		l.y -= 9.5 * lineSpacing
	case row.State == RowInfo:
		l.infoRow(row)
	default: // RowAnswered
		l.answerRow(row)
	}
}

func (l *layout) labelLines(label string) []string {
	return wrap(label, fontBold, 9.5, labelWidth)
}

func (l *layout) answerRow(row Row) {
	labelLines := l.labelLines(row.Label)
	valueLines := wrap(row.Display, fontBody, 9.5, valueWidth)
	n := len(labelLines)
	if len(valueLines) > n {
		n = len(valueLines)
	}
	l.ensureSpace(float64(n)*9.5*lineSpacing + 2)
	y := l.y
	for i, line := range labelLines {
		l.text(margin, y-float64(i)*9.5*lineSpacing, fontBold, 9.5, line)
	}
	for i, line := range valueLines {
		l.text(valueX, y-float64(i)*9.5*lineSpacing, fontBody, 9.5, line)
	}
	l.y = y - float64(n)*9.5*lineSpacing - 2
}

func (l *layout) blankRow(row Row) {
	labelLines := l.labelLines(row.Label)
	l.ensureSpace(float64(len(labelLines))*9.5*lineSpacing + 9.5*lineSpacing + 6)
	y := l.y
	for i, line := range labelLines {
		l.text(margin, y-float64(i)*9.5*lineSpacing, fontBold, 9.5, line)
	}
	ruleY := y - 3
	l.rule(valueX, pageWidth-margin, ruleY, 0.5)
	l.y = y - float64(len(labelLines))*9.5*lineSpacing
	l.text(valueX, l.y, fontItalic, 8.5, row.Note)
	l.y -= 8.5*lineSpacing + 4
}

func (l *layout) infoRow(row Row) {
	noteLines := wrap(row.Note, fontItalic, 9.5, valueWidth)
	l.ensureSpace(float64(len(noteLines))*9.5*lineSpacing + 2)
	l.text(margin, l.y, fontBold, 9.5, row.Label)
	for i, line := range noteLines {
		l.text(valueX, l.y-float64(i)*9.5*lineSpacing, fontItalic, 9.5, line)
	}
	l.y -= float64(len(noteLines))*9.5*lineSpacing + 2
}

func (l *layout) disclaimer(k Kit) {
	l.ensureSpace(90)
	l.y -= 10

	text := "This is a transcription aid, not the official form. " +
		"Help The Hive prepares documents \u2014 it never submits them. "
	if k.Form.AgencyName != "" {
		text += "Get the official form from " + k.Form.AgencyName
		if k.Form.AgencyURL != "" {
			text += " (" + k.Form.AgencyURL + ")"
		}
		text += ", "
	}
	text += "copy your answers onto it, and review every line before you sign."

	lines := wrap(text, fontBody, 9.5, pageWidth-2*margin-16)
	boxH := float64(len(lines))*9.5*lineSpacing + 16
	l.ensureSpace(boxH + 10)
	top := l.y
	l.y -= 8
	for _, line := range lines {
		l.text(margin+8, l.y, fontBody, 9.5, line)
		l.y -= 9.5 * lineSpacing
	}
	l.y -= 8
	fmt.Fprintf(&l.cur.ops, "%.2f w %.2f %.2f %.2f %.2f re S\n",
		0.5, margin, l.y, pageWidth-2*margin, top-l.y)
}
