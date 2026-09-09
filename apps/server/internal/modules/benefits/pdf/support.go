package pdf

import (
	"errors"
	"fmt"

	"github.com/pdfcpu/pdfcpu/pkg/pdfcpu/model"
)

// Refusing documents this engine cannot fill correctly.
//
// The dangerous failure is not an error, it is a document that looks fillable
// and is not. An XFA form is the clearest case: its fields live in an XML
// payload that pdfcpu does not read, so the AcroForm looks empty and the
// inspector would report "no fields, treat it as a flat form". A mapping author
// would then be invited to write coordinates for a form whose real fields are
// somewhere else entirely, and whichever viewer the caseworker opens it in
// decides what the applicant appears to have said.
//
// So a document that cannot be filled correctly is rejected by name, with the
// reason, rather than quietly passed through.

// ErrUnsupportedPDF means the template cannot be filled by this engine. It is
// always returned with an explanation naming the specific structure.
var ErrUnsupportedPDF = errors.New("unsupported PDF")

// UnsupportedError says what is wrong and what to do about it.
type UnsupportedError struct {
	// Kind is the structure that is not supported: "xfa", "encrypted",
	// "no-pages", "damaged".
	Kind string
	// Detail is written to be read by whoever is onboarding the form.
	Detail string
}

func (e *UnsupportedError) Error() string { return e.Detail }
func (e *UnsupportedError) Unwrap() error { return ErrUnsupportedPDF }

func unsupported(kind, format string, args ...any) *UnsupportedError {
	return &UnsupportedError{Kind: kind, Detail: fmt.Sprintf(format, args...)}
}

// checkStructureSupported inspects a freshly parsed document, before pdfcpu has
// validated and optimised it.
//
// The timing is not incidental. Optimisation removes an AcroForm whose /Fields
// array is empty — and an empty /Fields beside an /XFA payload is precisely
// what a pure XFA form looks like, so by the time the document is optimised the
// evidence is gone and the form reads as an ordinary one with no fields.
func checkStructureSupported(ctx *model.Context) error {
	xRefTable := ctx.XRefTable

	// XFA. A form whose fields live in an XFA payload cannot be filled through
	// its AcroForm, and different viewers disagree about what such a file even
	// says. Some are "hybrid" — an AcroForm that mirrors the XFA — and those
	// are usable, so the check is for XFA *without* usable AcroForm fields.
	if hasXFA(xRefTable) {
		if !hasAcroFormFields(xRefTable) {
			return unsupported("xfa",
				"this is an XFA (LiveCycle) form: its fields live in an XML payload rather than in the PDF, "+
					"so nothing here can fill it reliably. Ask the agency for a standard PDF, or open it in "+
					"Acrobat and save a flattened copy to map by coordinates")
		}
		// A hybrid file is filled through its AcroForm, which is what every
		// viewer falls back to. Worth knowing about, not worth refusing.
	}

	if ctx.Encrypt != nil && ctx.EncKey == nil {
		return unsupported("encrypted",
			"this document is encrypted and could not be opened; ask the agency for an unprotected copy")
	}

	return nil
}

// checkUsable runs once the document is validated, when the page tree has been
// resolved and a page count means something.
func checkUsable(ctx *model.Context) error {
	if ctx.XRefTable.PageCount == 0 {
		return unsupported("no-pages",
			"this document has no pages, so there is nothing to fill; it may be a partial download")
	}
	return nil
}

// hasXFA looks for an /XFA entry on the AcroForm dictionary.
func hasXFA(xRefTable *model.XRefTable) bool {
	if xRefTable.Form == nil {
		// A pure-XFA file can still declare its payload on the catalogue.
		return catalogHasXFA(xRefTable)
	}
	if _, found := xRefTable.Form.Find("XFA"); found {
		return true
	}
	return catalogHasXFA(xRefTable)
}

func catalogHasXFA(xRefTable *model.XRefTable) bool {
	root, err := xRefTable.Catalog()
	if err != nil {
		return false
	}
	acroForm, err := xRefTable.DereferenceDict(root["AcroForm"])
	if err != nil || acroForm == nil {
		return false
	}
	_, found := acroForm.Find("XFA")
	return found
}

// hasAcroFormFields reports whether the AcroForm carries a non-empty /Fields
// array — the thing a hybrid XFA document can still be filled through.
func hasAcroFormFields(xRefTable *model.XRefTable) bool {
	if xRefTable.Form == nil {
		return false
	}
	object, found := xRefTable.Form.Find("Fields")
	if !found {
		return false
	}
	fields, err := xRefTable.DereferenceArray(object)
	if err != nil {
		return false
	}
	return len(fields) > 0
}

// IsUnsupported reports whether an error is a refusal to handle a document,
// as opposed to a failure while handling one.
func IsUnsupported(err error) bool { return errors.Is(err, ErrUnsupportedPDF) }

// UnsupportedKind returns the structure that caused a refusal, or "".
func UnsupportedKind(err error) string {
	var unsupported *UnsupportedError
	if errors.As(err, &unsupported) {
		return unsupported.Kind
	}
	return ""
}
