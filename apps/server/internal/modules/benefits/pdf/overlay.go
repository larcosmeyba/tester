package pdf

import (
	"bytes"
	"fmt"
	"io"
	"sort"

	"github.com/pdfcpu/pdfcpu/pkg/api"
	"github.com/pdfcpu/pdfcpu/pkg/pdfcpu/model"
	"github.com/pdfcpu/pdfcpu/pkg/pdfcpu/types"
)

// Placement draws one value at an absolute position on a page. It is how flat,
// non-fillable government forms get filled, and — after the AcroForm has been
// stripped — how a filled form is flattened, so both paths render text through
// exactly the same code.
type Placement struct {
	// Ref is the mapping field id, used only in error messages.
	Ref  string
	Page int
	Rect Rect

	// Text is drawn when non-empty.
	Text string
	// Glyph is drawn centred in Rect, for ticking a box on a printed form.
	Glyph string

	Font        string
	Size        float64
	Align       string // left (default), center, right
	ShrinkToFit bool
}

// horizontal padding inside a box, so text does not touch a printed rule.
const boxPadding = 1.0

// capHeightRatio approximates the base-14 fonts' cap height as a fraction of
// the font size. It is used to centre a single line in its box; exact metrics
// are not worth the complexity for a value that sits in a 12-point rule.
const capHeightRatio = 0.718

// minShrinkSize is the smallest a value will ever be drawn. Below this a form
// stops being legible to the caseworker reading it, so an overflowing value is
// reported as a problem instead of being shrunk into illegibility.
const minShrinkSize = 5.0

// CheckPlacement reports whether a placement can be drawn — the font is one the
// engine knows, the text is representable, and the value fits its box. It runs
// the same code the renderer does but discards the output, so a caller can
// attribute a failure to one field rather than losing the whole document to it.
func CheckPlacement(placement Placement) error {
	fontName := placement.Font
	if fontName == "" {
		fontName = DefaultFont
	}
	if !SupportedFont(fontName) {
		return fmt.Errorf("field %q: %q is not one of the fonts this engine can draw with", placement.Ref, fontName)
	}
	_, err := drawPlacement(placement, fontName, "HTHF1")
	return err
}

// Overlay draws placements onto a PDF and returns the new document.
func Overlay(rs io.ReadSeeker, placements []Placement) ([]byte, error) {
	ctx, err := readContext(rs)
	if err != nil {
		return nil, err
	}
	if err := overlayContext(ctx, placements); err != nil {
		return nil, err
	}
	return writeContext(ctx)
}

func writeContext(ctx *model.Context) ([]byte, error) {
	var out bytes.Buffer
	if err := api.Write(ctx, &out, configuration()); err != nil {
		return nil, fmt.Errorf("write pdf: %w", err)
	}
	return out.Bytes(), nil
}

func overlayContext(ctx *model.Context, placements []Placement) error {
	byPage := map[int][]Placement{}
	for _, placement := range placements {
		if placement.Text == "" && placement.Glyph == "" {
			continue
		}
		byPage[placement.Page] = append(byPage[placement.Page], placement)
	}

	pages := make([]int, 0, len(byPage))
	for page := range byPage {
		pages = append(pages, page)
	}
	sort.Ints(pages)

	for _, page := range pages {
		if page < 1 || page > ctx.XRefTable.PageCount {
			return fmt.Errorf("page %d is outside the document's %d pages", page, ctx.XRefTable.PageCount)
		}
		if err := overlayPage(ctx, page, byPage[page]); err != nil {
			return err
		}
	}
	return nil
}

func overlayPage(ctx *model.Context, pageNr int, placements []Placement) error {
	xRefTable := ctx.XRefTable
	pageDict, _, attrs, err := xRefTable.PageDict(pageNr, true)
	if err != nil {
		return fmt.Errorf("page %d: %w", pageNr, err)
	}

	usedFonts := map[string]string{}
	var content bytes.Buffer
	// The page's own content stream may leave the graphics state anywhere it
	// likes. Restoring first means a value is drawn against a known state
	// regardless of what the form's artwork did.
	content.WriteString("Q\n")

	for _, placement := range placements {
		fontName := placement.Font
		if fontName == "" {
			fontName = DefaultFont
		}
		if !SupportedFont(fontName) {
			return fmt.Errorf("field %q: %q is not one of the fonts this engine can draw with", placement.Ref, fontName)
		}
		resourceName, ok := usedFonts[fontName]
		if !ok {
			resourceName = fmt.Sprintf("HTHF%d", len(usedFonts)+1)
			usedFonts[fontName] = resourceName
		}
		fragment, err := drawPlacement(placement, fontName, resourceName)
		if err != nil {
			return err
		}
		content.WriteString(fragment)
	}

	if err := addFontResources(ctx, pageDict, attrs, usedFonts); err != nil {
		return fmt.Errorf("page %d: %w", pageNr, err)
	}
	return appendContentStream(ctx, pageDict, content.Bytes())
}

func drawPlacement(placement Placement, fontName, resourceName string) (string, error) {
	text := placement.Text
	size := placement.Size
	align := placement.Align

	if placement.Glyph != "" {
		// A tick is centred in its box and sized to fill it, whatever the
		// mapping said about fonts.
		text = placement.Glyph
		align = "center"
		size = smallest(placement.Rect.H, placement.Rect.W) * 0.8
	}
	if size <= 0 {
		size = 10
	}

	encoded, err := encodeWinAnsi(text)
	if err != nil {
		return "", fmt.Errorf("field %q: %w", placement.Ref, err)
	}

	available := placement.Rect.W - 2*boxPadding
	width, err := textWidth(text, fontName, size)
	if err != nil {
		return "", fmt.Errorf("field %q: %w", placement.Ref, err)
	}
	if width > available {
		if !placement.ShrinkToFit {
			return "", fmt.Errorf("field %q: the value is %.1fpt wide and the box is %.1fpt; set shrinkToFit or shorten it with a truncate transform", placement.Ref, width, available)
		}
		for width > available && size > minShrinkSize {
			size -= 0.25
			if width, err = textWidth(text, fontName, size); err != nil {
				return "", fmt.Errorf("field %q: %w", placement.Ref, err)
			}
		}
		if width > available {
			return "", fmt.Errorf("field %q: the value does not fit its box even at %.2fpt", placement.Ref, minShrinkSize)
		}
	}

	x := placement.Rect.X + boxPadding
	switch align {
	case "center":
		x = placement.Rect.X + (placement.Rect.W-width)/2
	case "right":
		x = placement.Rect.X + placement.Rect.W - boxPadding - width
	}
	// Centre the cap-height box vertically inside the rectangle.
	y := placement.Rect.Y + (placement.Rect.H-size*capHeightRatio)/2

	return fmt.Sprintf("q\nBT\n/%s %.4f Tf\n0 0 0 rg\n1 0 0 1 %.4f %.4f Tm\n%s Tj\nET\nQ\n",
		resourceName, size, x, y, escapePDFString(encoded)), nil
}

func smallest(a, b float64) float64 {
	if a < b {
		return a
	}
	return b
}

func addFontResources(ctx *model.Context, pageDict types.Dict, attrs *model.InheritedPageAttrs, usedFonts map[string]string) error {
	if len(usedFonts) == 0 {
		return nil
	}
	xRefTable := ctx.XRefTable

	resources, err := xRefTable.DereferenceDict(pageDict["Resources"])
	if err != nil {
		return err
	}
	if resources == nil {
		// Resources are inherited from the page tree. Give this page its own
		// copy rather than adding a font to a dictionary its siblings share.
		resources = types.Dict{}
		if attrs != nil && attrs.Resources != nil {
			for key, value := range attrs.Resources {
				resources[key] = value
			}
		}
		pageDict["Resources"] = resources
	}

	fonts, err := xRefTable.DereferenceDict(resources["Font"])
	if err != nil {
		return err
	}
	if fonts == nil {
		fonts = types.Dict{}
		resources["Font"] = fonts
	}

	for fontName, resourceName := range usedFonts {
		fontDict := types.Dict{
			"Type":     types.Name("Font"),
			"Subtype":  types.Name("Type1"),
			"BaseFont": types.Name(fontName),
			"Encoding": types.Name("WinAnsiEncoding"),
		}
		indRef, err := xRefTable.IndRefForNewObject(fontDict)
		if err != nil {
			return err
		}
		fonts[resourceName] = *indRef
	}
	return nil
}

// appendContentStream adds a stream after the page's existing content. Content
// streams in an array are concatenated as one stream, so a leading "q" is
// pushed in front of the original and the overlay starts with the matching "Q":
// whatever graphics state the form's artwork leaves behind, the values are
// drawn against a clean one.
func appendContentStream(ctx *model.Context, pageDict types.Dict, content []byte) error {
	xRefTable := ctx.XRefTable

	saveState, err := newContentStream(xRefTable, []byte("q\n"))
	if err != nil {
		return err
	}
	overlay, err := newContentStream(xRefTable, content)
	if err != nil {
		return err
	}

	existing := pageDict["Contents"]
	var streams types.Array
	switch typed := existing.(type) {
	case nil:
		streams = types.Array{}
	case types.Array:
		streams = typed
	default:
		resolved, err := xRefTable.Dereference(existing)
		if err != nil {
			return err
		}
		if array, ok := resolved.(types.Array); ok {
			streams = array
		} else {
			streams = types.Array{existing}
		}
	}

	combined := types.Array{*saveState}
	combined = append(combined, streams...)
	combined = append(combined, *overlay)
	pageDict["Contents"] = combined
	return nil
}

func newContentStream(xRefTable *model.XRefTable, content []byte) (*types.IndirectRef, error) {
	streamDict, err := xRefTable.NewStreamDictForBuf(content)
	if err != nil {
		return nil, err
	}
	if err := streamDict.Encode(); err != nil {
		return nil, err
	}
	return xRefTable.IndRefForNewObject(*streamDict)
}
