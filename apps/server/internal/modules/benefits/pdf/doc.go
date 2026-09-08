// Package pdf is the deterministic PDF engine behind benefits autofill.
//
// It does three things: read a blank official form and report what fields it
// has, write values into it, and flatten the result once the applicant has
// approved it. Given the same template and the same values it produces the same
// bytes, every time.
//
// It imports no AI package and makes no network call, and there are tests that
// assert both. What goes onto a government form is decided by the deterministic
// resolver in internal/domain/benefits and by mapping files a person reviewed
// and committed — never by a model.
//
// Coordinates are PDF user space: points, origin at the page's bottom-left
// corner, Y increasing upwards.
package pdf
