package pdf

import (
	"fmt"
	"io"
	"sort"
	"strings"

	"github.com/pdfcpu/pdfcpu/pkg/api"
	"github.com/pdfcpu/pdfcpu/pkg/pdfcpu/model"
	"github.com/pdfcpu/pdfcpu/pkg/pdfcpu/types"
)

// FieldType is the AcroForm field type, reduced to the five shapes a benefits
// form actually uses.
type FieldType string

const (
	FieldText     FieldType = "text"
	FieldCheckbox FieldType = "checkbox"
	FieldRadio    FieldType = "radio"
	FieldDropdown FieldType = "dropdown"
	FieldListbox  FieldType = "listbox"
	// FieldSignature is a signature field. Every fillable state form in the
	// collection has them — Alaska has ten — and they are named rather than
	// lumped in with "unknown" because no mapping may ever target one: Help The
	// Hive does not sign an application on anyone's behalf.
	FieldSignature FieldType = "signature"
	FieldUnknown   FieldType = "unknown"
)

// Fillable reports whether a field is one this engine may write a value into.
func (t FieldType) Fillable() bool {
	switch t {
	case FieldText, FieldCheckbox, FieldRadio, FieldDropdown, FieldListbox:
		return true
	}
	return false
}

// Rect is a rectangle in PDF user space, origin bottom-left.
type Rect struct {
	X, Y, W, H float64
}

// Widget is one on-page appearance of a field. A field can have several — the
// same "signature" field repeated on every page — which is why a Field holds a
// list of them and flattening walks widgets rather than fields.
type Widget struct {
	Page int
	Rect Rect
	// OnState is the appearance state that turns this widget on — "Yes", "1",
	// "Choice2", whatever the form's author chose. For a radio group it is the
	// only way to tell which of the group's boxes a given answer ticks, which
	// flattening needs and cannot infer from geometry.
	OnState string
}

// Field is one AcroForm field of a template.
type Field struct {
	Name    string
	Type    FieldType
	Options []string
	MaxLen  int
	Widgets []Widget
	// Label is the text printed beside the field's first widget, when the page
	// prints one close enough to be sure about. It is what makes a form
	// mappable whose fields are named "Text1 PG 1" — and most government forms
	// are named exactly that badly.
	Label string
	// LabelPlacement records whether the label was found to the left of the box
	// or above it, so a reviewer can judge the guess.
	LabelPlacement string
	// Attestation is set when this box is the applicant's own to complete — a
	// signature, initials, the date beside a signature, or a certification.
	// A mapping that targets one is refused unless it declares fillPolicy
	// "never".
	Attestation AttestationKind
}

// IsAttestation reports whether this field must be left for the applicant.
func (f Field) IsAttestation() bool { return f.Attestation != AttestationNone }

// Pages lists the pages this field appears on, in order.
func (f Field) Pages() []int {
	seen := map[int]bool{}
	var pages []int
	for _, widget := range f.Widgets {
		if !seen[widget.Page] {
			seen[widget.Page] = true
			pages = append(pages, widget.Page)
		}
	}
	sort.Ints(pages)
	return pages
}

// Inventory is everything the engine can learn about a template without being
// told: how many pages, how big they are, and every field with its type,
// options and on-page rectangles.
//
// It is what a mapping is validated against, what the mapping-authoring tool
// works from, and — because it contains only the blank form's own structure and
// no applicant data — the only thing the AI assistant is ever shown.
type Inventory struct {
	PageCount   int
	PageSizes   []Rect
	HasAcroForm bool
	Fields      []Field
}

// FieldByName finds a field by its fully qualified name.
func (i Inventory) FieldByName(name string) (Field, bool) {
	for _, field := range i.Fields {
		if field.Name == name {
			return field, true
		}
	}
	return Field{}, false
}

func configuration() *model.Configuration {
	conf := model.NewDefaultConfiguration()
	conf.ValidationMode = model.ValidationRelaxed
	// Government PDFs are produced by a wide range of tools over many years.
	// Relaxed validation reads the ones a strict parser rejects; nothing is
	// written back into the template, so a lenient read costs nothing.
	return conf
}

// readContext parses a PDF into pdfcpu's object model, refusing anything this
// engine cannot fill and repairing the one thing that is worth repairing.
//
// The steps are spelled out rather than left to pdfcpu's combined helper
// because two of them need something interposed.
//
// Structure is checked straight after parsing, before optimisation, because
// optimisation removes an AcroForm with an empty /Fields array — which is
// exactly the shape of a pure XFA form, whose fields live in an XML payload
// this engine cannot read. Check it afterwards and such a form looks like an
// ordinary one with no fields, which would invite somebody to map coordinates
// onto boxes that are not where they appear to be.
//
// Validation is retried with the document information dictionary dropped,
// because several states publish forms produced through Microsoft Office, which
// stamps custom SharePoint keys into it with escapes a strict reader rejects.
// That dictionary holds a title and an author and affects no field: New York's
// 28-page SNAP application and North Carolina's 575-field one both read
// perfectly once it is out of the way.
func readContext(rs io.ReadSeeker) (*model.Context, error) {
	ctx, err := api.ReadContext(rs, configuration())
	if err != nil {
		return nil, fmt.Errorf("read pdf: %w", err)
	}
	if err := checkStructureSupported(ctx); err != nil {
		return nil, err
	}

	if err := api.ValidateContext(ctx); err != nil {
		validationErr := err
		dropDocumentInfo(ctx)
		if retryErr := api.ValidateContext(ctx); retryErr != nil {
			// The first error is the useful one: the retry exists only to get
			// past broken metadata, so its failure says less about the document.
			return nil, fmt.Errorf("read pdf: %w", validationErr)
		}
	}

	if err := api.OptimizeContext(ctx); err != nil {
		return nil, fmt.Errorf("read pdf: %w", err)
	}
	if err := checkUsable(ctx); err != nil {
		return nil, err
	}
	return ctx, nil
}

// dropDocumentInfo empties a document's information dictionary, leaving only a
// producer.
func dropDocumentInfo(ctx *model.Context) int {
	xRefTable := ctx.XRefTable
	if xRefTable.Info == nil {
		return 0
	}
	dict, err := xRefTable.DereferenceDict(*xRefTable.Info)
	if err != nil || dict == nil {
		return 0
	}
	dropped := len(dict)
	for key := range dict {
		delete(dict, key)
	}
	dict["Producer"] = types.StringLiteral("Help The Hive")
	return dropped
}

// Inspect reads a template and reports its structure.
func Inspect(rs io.ReadSeeker) (Inventory, error) {
	ctx, err := readContext(rs)
	if err != nil {
		return Inventory{}, err
	}
	return inventoryFromContext(ctx)
}

func inventoryFromContext(ctx *model.Context) (Inventory, error) {
	xRefTable := ctx.XRefTable
	pageCount := xRefTable.PageCount

	inventory := Inventory{
		PageCount:   pageCount,
		HasAcroForm: xRefTable.Form != nil,
	}

	byName := map[string]*Field{}
	var order []string

	for pageNr := 1; pageNr <= pageCount; pageNr++ {
		pageDict, _, attrs, err := xRefTable.PageDict(pageNr, false)
		if err != nil {
			return Inventory{}, fmt.Errorf("page %d: %w", pageNr, err)
		}
		inventory.PageSizes = append(inventory.PageSizes, mediaBox(attrs))

		annots, err := dereferenceArray(xRefTable, pageDict["Annots"])
		if err != nil || annots == nil {
			continue
		}
		for _, entry := range annots {
			annot, err := xRefTable.DereferenceDict(entry)
			if err != nil || annot == nil {
				continue
			}
			if subtype := annot.NameEntry("Subtype"); subtype == nil || *subtype != "Widget" {
				continue
			}
			name, fieldDict := qualifiedFieldName(xRefTable, annot)
			if name == "" {
				continue
			}
			field, ok := byName[name]
			if !ok {
				field = &Field{
					Name:    name,
					Type:    fieldType(xRefTable, fieldDict),
					Options: fieldOptions(xRefTable, fieldDict),
					MaxLen:  intEntry(xRefTable, fieldDict, "MaxLen"),
				}
				byName[name] = field
				order = append(order, name)
			}
			field.Widgets = append(field.Widgets, Widget{
				Page:    pageNr,
				Rect:    rectOf(xRefTable, annot),
				OnState: widgetOnState(xRefTable, annot),
			})
		}
	}

	// Labels come from the page's printed text, read once per page rather than
	// per field: a 1,444-field form would otherwise re-parse its content stream
	// 1,444 times.
	runsByPage := map[int][]TextRun{}
	for _, name := range order {
		field := byName[name]
		if len(field.Widgets) == 0 {
			field.Attestation = classifyAttestation(field.Type, field.Name, "")
			inventory.Fields = append(inventory.Fields, *field)
			continue
		}
		widget := field.Widgets[0]
		runs, loaded := runsByPage[widget.Page]
		if !loaded {
			runs, _ = PageText(ctx, widget.Page)
			runsByPage[widget.Page] = runs
		}
		field.Label, field.LabelPlacement = LabelFor(runs, widget.Rect)
		field.Attestation = classifyAttestation(field.Type, field.Name, field.Label)
		inventory.Fields = append(inventory.Fields, *field)
	}
	return inventory, nil
}

func mediaBox(attrs *model.InheritedPageAttrs) Rect {
	if attrs == nil || attrs.MediaBox == nil {
		// US Letter, the default for essentially every US government form.
		return Rect{W: 612, H: 792}
	}
	box := attrs.MediaBox
	return Rect{X: box.LL.X, Y: box.LL.Y, W: box.Width(), H: box.Height()}
}

// qualifiedFieldName walks the widget's parent chain collecting /T entries, so
// a field nested in a form group comes back as "form1[0].P1[0].LastName[0]" —
// the same name a mapping file was written against. It also returns the dict
// that actually holds the field's type, which is the topmost ancestor with a
// /FT: a widget merged into its field carries both, a widget in a kid array
// carries neither.
func qualifiedFieldName(xRefTable *model.XRefTable, widget types.Dict) (string, types.Dict) {
	var parts []string
	fieldDict := widget
	current := widget

	for depth := 0; current != nil && depth < 32; depth++ {
		if name := stringEntry(xRefTable, current, "T"); name != "" {
			parts = append([]string{name}, parts...)
		}
		if _, hasType := current.Find("FT"); hasType {
			fieldDict = current
		}
		parent, err := xRefTable.DereferenceDict(current["Parent"])
		if err != nil || parent == nil {
			break
		}
		current = parent
	}

	return strings.Join(parts, "."), fieldDict
}

func fieldType(xRefTable *model.XRefTable, fieldDict types.Dict) FieldType {
	name := fieldDict.NameEntry("FT")
	if name == nil {
		return FieldUnknown
	}
	switch *name {
	case "Sig":
		return FieldSignature
	case "Tx":
		return FieldText
	case "Btn":
		// Bit 16 of /Ff is the radio flag. Push buttons (bit 17) hold no value
		// and are not fillable, so they read as unknown and no mapping may
		// target them.
		flags := intEntry(xRefTable, fieldDict, "Ff")
		if flags&(1<<16) != 0 {
			return FieldUnknown
		}
		if flags&(1<<15) != 0 {
			return FieldRadio
		}
		return FieldCheckbox
	case "Ch":
		// Bit 18 is the combo flag: set means a dropdown, clear means a list box.
		if intEntry(xRefTable, fieldDict, "Ff")&(1<<17) != 0 {
			return FieldDropdown
		}
		return FieldListbox
	}
	return FieldUnknown
}

// fieldOptions reads the values a choice or radio field will accept. A mapping
// that writes anything else is rejected before it ever reaches an applicant.
func fieldOptions(xRefTable *model.XRefTable, fieldDict types.Dict) []string {
	if options := choiceOptions(xRefTable, fieldDict); len(options) > 0 {
		return options
	}
	return radioOptions(xRefTable, fieldDict)
}

func choiceOptions(xRefTable *model.XRefTable, fieldDict types.Dict) []string {
	array, err := dereferenceArray(xRefTable, fieldDict["Opt"])
	if err != nil || array == nil {
		return nil
	}
	var options []string
	for _, entry := range array {
		resolved, err := xRefTable.Dereference(entry)
		if err != nil {
			continue
		}
		if array, ok := resolved.(types.Array); ok {
			// [export, display] pairs: the export value is what gets written.
			if len(array) > 0 {
				if text := pdfText(array[0]); text != "" {
					options = append(options, text)
				}
			}
			continue
		}
		if text := pdfText(resolved); text != "" {
			options = append(options, text)
		}
	}
	return options
}

// radioOptions reads a radio group's export values from its kids' appearance
// dictionaries. A radio button's "value" is the name of the on state in its
// /AP /N dictionary — "Yes", "1", "Choice2" — and only the PDF itself knows it.
func radioOptions(xRefTable *model.XRefTable, fieldDict types.Dict) []string {
	kids, err := dereferenceArray(xRefTable, fieldDict["Kids"])
	if err != nil || kids == nil {
		return nil
	}
	var options []string
	seen := map[string]bool{}
	for _, entry := range kids {
		kid, err := xRefTable.DereferenceDict(entry)
		if err != nil || kid == nil {
			continue
		}
		appearance, err := xRefTable.DereferenceDict(kid["AP"])
		if err != nil || appearance == nil {
			continue
		}
		normal, err := xRefTable.DereferenceDict(appearance["N"])
		if err != nil || normal == nil {
			continue
		}
		for state := range normal {
			if state == "Off" || seen[state] {
				continue
			}
			seen[state] = true
			options = append(options, state)
		}
	}
	sort.Strings(options)
	return options
}

// widgetOnState reads the widget's "on" appearance state from its /AP /N
// dictionary, which holds one entry per state — typically the on state and
// "Off".
func widgetOnState(xRefTable *model.XRefTable, widget types.Dict) string {
	appearance, err := xRefTable.DereferenceDict(widget["AP"])
	if err != nil || appearance == nil {
		return ""
	}
	normal, err := xRefTable.DereferenceDict(appearance["N"])
	if err != nil || normal == nil {
		return ""
	}
	for state := range normal {
		if state != "Off" {
			return state
		}
	}
	return ""
}

func rectOf(xRefTable *model.XRefTable, annot types.Dict) Rect {
	array, err := dereferenceArray(xRefTable, annot["Rect"])
	if err != nil || len(array) != 4 {
		return Rect{}
	}
	numbers := make([]float64, 4)
	for i, entry := range array {
		resolved, err := xRefTable.Dereference(entry)
		if err != nil {
			return Rect{}
		}
		switch typed := resolved.(type) {
		case types.Integer:
			numbers[i] = float64(typed.Value())
		case types.Float:
			numbers[i] = typed.Value()
		default:
			return Rect{}
		}
	}
	x0, y0 := min(numbers[0], numbers[2]), min(numbers[1], numbers[3])
	x1, y1 := max(numbers[0], numbers[2]), max(numbers[1], numbers[3])
	return Rect{X: x0, Y: y0, W: x1 - x0, H: y1 - y0}
}

func dereferenceArray(xRefTable *model.XRefTable, object types.Object) (types.Array, error) {
	if object == nil {
		return nil, nil
	}
	return xRefTable.DereferenceArray(object)
}

func stringEntry(xRefTable *model.XRefTable, dict types.Dict, key string) string {
	resolved, err := xRefTable.Dereference(dict[key])
	if err != nil || resolved == nil {
		return ""
	}
	return pdfText(resolved)
}

func intEntry(xRefTable *model.XRefTable, dict types.Dict, key string) int {
	resolved, err := xRefTable.Dereference(dict[key])
	if err != nil || resolved == nil {
		return 0
	}
	if number, ok := resolved.(types.Integer); ok {
		return number.Value()
	}
	return 0
}

// pdfText decodes a PDF text string. They come as literals or hex, and either
// may be UTF-16 with a byte-order mark — which is how form-field names from
// most authoring tools arrive. Reading the raw bytes instead gives names with a
// NUL between every letter, and every mapping lookup then misses.
func pdfText(object types.Object) string {
	switch typed := object.(type) {
	case types.StringLiteral:
		text, err := types.StringLiteralToString(typed)
		if err != nil {
			return typed.Value()
		}
		return text
	case types.HexLiteral:
		text, err := types.HexLiteralToString(typed)
		if err != nil {
			return typed.Value()
		}
		return text
	}
	return ""
}
