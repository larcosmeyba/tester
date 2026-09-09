package pdf

import (
	"bytes"
	"errors"
	"fmt"
	"regexp"
	"strconv"
	"strings"
	"testing"

	"github.com/pdfcpu/pdfcpu/pkg/api"
)

// A flat form: printed rules and labels, no fields at all. This is what a
// scanned or print-only government PDF looks like, and the only way to fill one
// is to draw at coordinates.
const flatFixtureJSON = `{
  "paper": "LetterP",
  "origin": "LowerLeft",
  "pages": {
    "1": { "content": { "text": [
      { "value": "FLAT APPLICATION - PAGE 1", "pos": [40, 720], "font": { "name": "Helvetica-Bold", "size": 14 } },
      { "value": "Last name: ______________________", "pos": [40, 660], "font": { "name": "Helvetica", "size": 10 } }
    ] } },
    "2": { "content": { "text": [
      { "value": "FLAT APPLICATION - PAGE 2", "pos": [40, 720], "font": { "name": "Helvetica-Bold", "size": 14 } }
    ] } }
  }
}`

func buildFlatFixture(t *testing.T) []byte {
	t.Helper()
	var out bytes.Buffer
	if err := api.Create(nil, strings.NewReader(flatFixtureJSON), &out, configuration()); err != nil {
		t.Fatalf("build flat fixture: %v", err)
	}
	return out.Bytes()
}

var textMatrix = regexp.MustCompile(`1 0 0 1 (-?[0-9.]+) (-?[0-9.]+) Tm`)

// drawnAt returns the position of the first text-drawing operation whose value
// matches, so a test can assert where on the page something landed.
func drawnAt(t *testing.T, content, value string) (float64, float64) {
	t.Helper()
	index := strings.Index(content, "("+value+") Tj")
	if index < 0 {
		t.Fatalf("nothing drew %q; content was:\n%s", value, content)
	}
	matches := textMatrix.FindAllStringSubmatch(content[:index], -1)
	if len(matches) == 0 {
		t.Fatalf("no text matrix precedes %q", value)
	}
	last := matches[len(matches)-1]
	x, _ := strconv.ParseFloat(last[1], 64)
	y, _ := strconv.ParseFloat(last[2], 64)
	return x, y
}

func TestOverlayDrawsAtBottomLeftCoordinates(t *testing.T) {
	out, err := Overlay(bytes.NewReader(buildFlatFixture(t)), []Placement{
		{Ref: "last", Page: 1, Rect: Rect{X: 120, Y: 655, W: 200, H: 12},
			Text: "RIVERA", Font: "Helvetica", Size: 10, Align: "left"},
	})
	if err != nil {
		t.Fatalf("overlay: %v", err)
	}

	x, y := drawnAt(t, string(pageContent(t, out, 1)), "RIVERA")

	// Left-aligned text starts one point inside the box.
	if x < 120 || x > 122 {
		t.Errorf("expected the value to start just inside the box at x=121, got %.2f", x)
	}
	// The baseline sits inside the box, measured up from the page's bottom
	// edge. A top-left origin would put this near y=125 instead.
	if y < 655 || y > 667 {
		t.Errorf("expected a baseline inside the box between y=655 and y=667, got %.2f", y)
	}
}

func TestOverlayHonoursAlignment(t *testing.T) {
	rect := Rect{X: 100, Y: 400, W: 200, H: 12}
	positions := map[string]float64{}
	for _, align := range []string{"left", "center", "right"} {
		out, err := Overlay(bytes.NewReader(buildFlatFixture(t)), []Placement{
			{Ref: "v", Page: 1, Rect: rect, Text: "RIVERA", Font: "Helvetica", Size: 10, Align: align},
		})
		if err != nil {
			t.Fatalf("overlay %s: %v", align, err)
		}
		x, _ := drawnAt(t, string(pageContent(t, out, 1)), "RIVERA")
		positions[align] = x
	}

	if !(positions["left"] < positions["center"] && positions["center"] < positions["right"]) {
		t.Fatalf("alignment did not move the text across the box: %v", positions)
	}
	if positions["right"] > rect.X+rect.W {
		t.Fatalf("right-aligned text ran past the right edge of its box: %.2f", positions["right"])
	}
}

func TestOverlayWritesToTheRequestedPage(t *testing.T) {
	out, err := Overlay(bytes.NewReader(buildFlatFixture(t)), []Placement{
		{Ref: "p1", Page: 1, Rect: Rect{X: 100, Y: 600, W: 200, H: 12}, Text: "PAGEONE", Font: "Helvetica", Size: 10},
		{Ref: "p2", Page: 2, Rect: Rect{X: 100, Y: 600, W: 200, H: 12}, Text: "PAGETWO", Font: "Helvetica", Size: 10},
	})
	if err != nil {
		t.Fatalf("overlay: %v", err)
	}

	page1, page2 := string(pageContent(t, out, 1)), string(pageContent(t, out, 2))
	if !strings.Contains(page1, "(PAGEONE)") || strings.Contains(page1, "(PAGETWO)") {
		t.Error("page 1 has the wrong values on it")
	}
	if !strings.Contains(page2, "(PAGETWO)") || strings.Contains(page2, "(PAGEONE)") {
		t.Error("page 2 has the wrong values on it")
	}
}

func TestOverlayDrawsACheckmarkInItsBox(t *testing.T) {
	out, err := Overlay(bytes.NewReader(buildFlatFixture(t)), []Placement{
		{Ref: "heat", Page: 1, Rect: Rect{X: 200, Y: 500, W: 10, H: 10}, Glyph: CheckGlyph},
	})
	if err != nil {
		t.Fatalf("overlay: %v", err)
	}
	x, y := drawnAt(t, string(pageContent(t, out, 1)), CheckGlyph)
	if x < 200 || x > 210 || y < 500 || y > 510 {
		t.Fatalf("the tick landed outside its box at (%.2f, %.2f)", x, y)
	}
}

func TestOverlayRefusesToOverflowABoxWithoutShrinkToFit(t *testing.T) {
	_, err := Overlay(bytes.NewReader(buildFlatFixture(t)), []Placement{
		{Ref: "long", Page: 1, Rect: Rect{X: 100, Y: 600, W: 30, H: 12},
			Text: "A VERY LONG HOUSEHOLD MEMBER NAME", Font: "Helvetica", Size: 10},
	})
	// Silently running text off the edge of a government form is worse than
	// refusing to draw it, so this is an error the reviewer sees.
	if err == nil || !strings.Contains(err.Error(), "shrinkToFit") {
		t.Fatalf("expected an overflowing value to be refused, got %v", err)
	}
}

func TestOverlayShrinksToFitWhenAsked(t *testing.T) {
	out, err := Overlay(bytes.NewReader(buildFlatFixture(t)), []Placement{
		{Ref: "long", Page: 1, Rect: Rect{X: 100, Y: 600, W: 90, H: 12},
			Text: "A LONG HOUSEHOLD NAME", Font: "Helvetica", Size: 10, ShrinkToFit: true},
	})
	if err != nil {
		t.Fatalf("overlay: %v", err)
	}
	content := string(pageContent(t, out, 1))
	if !strings.Contains(content, "(A LONG HOUSEHOLD NAME)") {
		t.Fatal("the whole value must still be drawn, just smaller")
	}
	if !strings.Contains(content, "/HTHF1 ") {
		t.Fatal("expected the overlay font to be used")
	}
}

func TestOverlayRefusesToDropCharactersItCannotWrite(t *testing.T) {
	// Mangling somebody's legal name on a benefits application is worse than
	// failing loudly, so an unrepresentable character is an error, not a
	// silently dropped letter.
	_, err := Overlay(bytes.NewReader(buildFlatFixture(t)), []Placement{
		{Ref: "name", Page: 1, Rect: Rect{X: 100, Y: 600, W: 200, H: 12},
			Text: "Nguyễn", Font: "Helvetica", Size: 10},
	})
	var unrepresentable *UnrepresentableError
	if err == nil || !errors.As(err, &unrepresentable) {
		t.Fatalf("expected an UnrepresentableError, got %v", err)
	}
	if unrepresentable.Char != 'ễ' {
		t.Errorf("expected the offending character reported, got %q", string(unrepresentable.Char))
	}
}

func TestOverlayKeepsAccentedLatinNames(t *testing.T) {
	// The common case still has to work: WinAnsi covers Latin-1.
	out, err := Overlay(bytes.NewReader(buildFlatFixture(t)), []Placement{
		{Ref: "name", Page: 1, Rect: Rect{X: 100, Y: 600, W: 200, H: 12},
			Text: "José Muñoz", Font: "Helvetica", Size: 10},
	})
	if err != nil {
		t.Fatalf("overlay: %v", err)
	}
	content := string(pageContent(t, out, 1))
	// é is 0xE9 and ñ is 0xF1 in WinAnsi, written as octal escapes.
	if !strings.Contains(content, fmt.Sprintf(`(Jos\%03o Mu\%03o oz)`, 0xE9, 0xF1)) &&
		!strings.Contains(content, `Jos\351 Mu\361oz`) {
		t.Fatalf("expected the accented name written as WinAnsi escapes, content was:\n%s", content)
	}
}

func TestOverlayRejectsAPageThatDoesNotExist(t *testing.T) {
	_, err := Overlay(bytes.NewReader(buildFlatFixture(t)), []Placement{
		{Ref: "x", Page: 9, Rect: Rect{X: 10, Y: 10, W: 50, H: 12}, Text: "X", Font: "Helvetica", Size: 10},
	})
	if err == nil || !strings.Contains(err.Error(), "outside the document") {
		t.Fatalf("expected a page beyond the document to be refused, got %v", err)
	}
}

func TestOverlayLeavesTheOriginalArtworkIntact(t *testing.T) {
	before := string(pageContent(t, buildFlatFixture(t), 1))
	out, err := Overlay(bytes.NewReader(buildFlatFixture(t)), []Placement{
		{Ref: "last", Page: 1, Rect: Rect{X: 120, Y: 655, W: 200, H: 12}, Text: "RIVERA", Font: "Helvetica", Size: 10},
	})
	if err != nil {
		t.Fatalf("overlay: %v", err)
	}
	after := string(pageContent(t, out, 1))
	if !strings.Contains(before, "FLAT APPLICATION") {
		t.Skip("fixture does not expose its label text in the content stream")
	}
	if !strings.Contains(after, "FLAT APPLICATION") {
		t.Fatal("overlaying a value erased the form's own printed text")
	}
}
