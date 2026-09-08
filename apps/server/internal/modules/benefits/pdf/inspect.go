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
	FieldUnknown  FieldType = "unknown"
)

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
}

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

// readContext parses a PDF into pdfcpu's object model. It validates and
// optimises on the way in, which is what pdfcpu's own form operations expect;
// skipping it leaves form edits working on an under-resolved object graph.
func readContext(rs io.ReadSeeker) (*model.Context, error) {
	ctx, err := api.ReadValidateAndOptimize(rs, configuration())
	if err != nil {
		return nil, fmt.Errorf("read pdf: %w", err)
	}
	return ctx, nil
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

	for _, name := range order {
		inventory.Fields = append(inventory.Fields, *byName[name])
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
