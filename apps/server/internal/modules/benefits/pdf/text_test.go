package pdf

import (
	"bytes"
	"strings"
	"testing"
)

func TestTextRunsCarryTheirPositions(t *testing.T) {
	content := []byte("BT /F1 12 Tf 1 0 0 1 72 700 Tm (Last name) Tj ET")
	runs := parseTextRuns(content, nil)
	if len(runs) != 1 {
		t.Fatalf("expected one run, got %+v", runs)
	}
	if runs[0].Text != "Last name" {
		t.Errorf("text: got %q", runs[0].Text)
	}
	// Origin is bottom-left, so a run near the top of a Letter page has a large Y.
	if runs[0].X != 72 || runs[0].Y != 700 {
		t.Errorf("position: got (%.1f, %.1f), want (72, 700)", runs[0].X, runs[0].Y)
	}
}

func TestTdAndTStarMoveDownThePage(t *testing.T) {
	content := []byte("BT /F1 10 Tf 14 TL 1 0 0 1 50 600 Tm (first) Tj T* (second) Tj ET")
	runs := parseTextRuns(content, nil)
	if len(runs) != 2 {
		t.Fatalf("expected two runs, got %+v", runs)
	}
	if runs[1].Y >= runs[0].Y {
		t.Fatalf("the second line should sit below the first: %.1f then %.1f", runs[0].Y, runs[1].Y)
	}
}

func TestKerningArraysReadAsOneString(t *testing.T) {
	content := []byte("BT /F1 10 Tf 1 0 0 1 0 0 Tm [(Mon)-20(thly)-15( rent)] TJ ET")
	runs := parseTextRuns(content, nil)
	if len(runs) != 1 || runs[0].Text != "Monthly rent" {
		t.Fatalf("expected the kerned pieces joined, got %+v", runs)
	}
}

func TestEscapesAndParenthesesSurviveTokenizing(t *testing.T) {
	content := []byte(`BT /F1 10 Tf 1 0 0 1 0 0 Tm (Name \(last, first\)) Tj ET`)
	runs := parseTextRuns(content, nil)
	if len(runs) != 1 || runs[0].Text != "Name (last, first)" {
		t.Fatalf("expected escaped parentheses read literally, got %+v", runs)
	}
}

func TestTheCurrentTransformationMatrixIsApplied(t *testing.T) {
	// A page that translates its whole content must not report text at the
	// untranslated position, or every label lands in the wrong place.
	content := []byte("q 1 0 0 1 100 50 cm BT /F1 10 Tf 1 0 0 1 10 10 Tm (shifted) Tj ET Q")
	runs := parseTextRuns(content, nil)
	if len(runs) != 1 {
		t.Fatalf("expected one run, got %+v", runs)
	}
	if runs[0].X != 110 || runs[0].Y != 60 {
		t.Fatalf("expected (110, 60), got (%.1f, %.1f)", runs[0].X, runs[0].Y)
	}
}

// A subset font renumbers its codes, so its bytes are meaningless without the
// font's own map. Reading them raw is how "Application" becomes "5DD@=75H=CB".
func TestASubsetFontIsReadThroughItsOwnEncoding(t *testing.T) {
	decoder := &fontDecoder{
		simple:         map[byte]rune{0x35: 'a', 0x44: 'p', 0x40: 'l', 0x3D: 'i', 0x37: 'c'},
		hasDifferences: true,
		toUnicode:      map[uint32]string{},
	}
	got := decoder.decode(string([]byte{0x35, 0x44, 0x44, 0x40, 0x3D, 0x37}))
	if got != "applic" {
		t.Fatalf("expected the font's own mapping to be used, got %q", got)
	}
}

func TestASubsetFontDropsCodesItDoesNotDefine(t *testing.T) {
	// Falling through to the raw byte would print an unrelated letter, and a
	// wrong character in a label is worse than a missing one.
	decoder := &fontDecoder{
		simple:         map[byte]rune{0x35: 'a'},
		hasDifferences: true,
		toUnicode:      map[uint32]string{},
	}
	if got := decoder.decode(string([]byte{0x35, 0x99})); got != "a" {
		t.Fatalf("expected the undefined code dropped, got %q", got)
	}
}

func TestAToUnicodeCMapIsRead(t *testing.T) {
	cmap := `
/CIDInit /ProcSet findresource begin
1 beginbfchar
<0024> <0041>
endbfchar
1 beginbfrange
<0003> <0005> <0020>
endbfrange
`
	out := map[uint32]string{}
	parseToUnicode(cmap, out)
	if out[0x24] != "A" {
		t.Errorf("bfchar: got %q", out[0x24])
	}
	if out[0x03] != " " || out[0x05] != "\"" {
		t.Errorf("bfrange: got %q and %q", out[0x03], out[0x05])
	}
}

func TestIdentityHTextIsReadTwoBytesAtATime(t *testing.T) {
	decoder := &fontDecoder{twoByte: true, toUnicode: map[uint32]string{0x0024: "A", 0x0025: "B"}}
	if got := decoder.decode(string([]byte{0x00, 0x24, 0x00, 0x25})); got != "AB" {
		t.Fatalf("expected AB, got %q", got)
	}
}

func TestHexStringsWithAByteOrderMarkDecodeAsText(t *testing.T) {
	content := []byte("BT /F1 10 Tf 1 0 0 1 0 0 Tm <FEFF0048> Tj ET")
	runs := parseTextRuns(content, nil)
	if len(runs) != 1 || runs[0].Text != "H" {
		t.Fatalf("expected UTF-16 decoded, got %+v", runs)
	}
}

func TestTokenizerSkipsDictionariesAndComments(t *testing.T) {
	content := []byte("<</Type /Page>> % a comment\nBT /F1 10 Tf 1 0 0 1 0 0 Tm (ok) Tj ET")
	runs := parseTextRuns(content, nil)
	if len(runs) != 1 || runs[0].Text != "ok" {
		t.Fatalf("expected the text read past the dictionary and comment, got %+v", runs)
	}
}

func TestPageTextIsFoundOnTheRealFixture(t *testing.T) {
	ctx, err := readContext(bytes.NewReader(buildFixture(t)))
	if err != nil {
		t.Fatalf("read fixture: %v", err)
	}
	runs, err := PageText(ctx, 1)
	if err != nil {
		t.Fatalf("page text: %v", err)
	}
	var all strings.Builder
	for _, run := range runs {
		all.WriteString(run.Text)
		all.WriteString(" ")
	}
	if !strings.Contains(all.String(), "Last name") {
		t.Fatalf("expected the fixture's printed labels to be readable, got: %s", all.String())
	}
}

func TestFieldsPickUpTheirPrintedLabels(t *testing.T) {
	inventory, err := Inspect(bytes.NewReader(buildFixture(t)))
	if err != nil {
		t.Fatalf("inspect: %v", err)
	}
	field, ok := inventory.FieldByName("applicantLastName")
	if !ok {
		t.Fatal("field missing")
	}
	if !strings.Contains(strings.ToLower(field.Label), "last name") {
		t.Fatalf("expected the printed label attached to the field, got %q", field.Label)
	}
}
