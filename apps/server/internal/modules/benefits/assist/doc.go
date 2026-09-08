// Package assist is where AI is allowed to help with government forms, and it
// is deliberately the only place.
//
// What it does: given a *blank* official PDF's own field inventory — names,
// types, page numbers, the options a dropdown offers — it proposes which Help
// The Hive field path each form field probably corresponds to. Government form
// fields are named things like "form1[0].P1[0].TxtFld12[0]", and working out
// that TxtFld12 is the applicant's last name is exactly the kind of tedious
// pattern-matching a model is good at.
//
// What it does not do, and cannot:
//
//   - It never runs during a fill. The engine that puts values on a form
//     (internal/modules/benefits/pdf and internal/domain/benefits) does not
//     import this package, and a test asserts that.
//   - It never sees applicant data. Its only input is a blank form's structure.
//     There is no code path from a profile to here.
//   - It never decides an answer. Its output is a *draft mapping file* for a
//     person to read, correct and commit. Nothing it produces reaches a running
//     server until a human has put it in the repository.
//   - Every suggestion is checked against the field vocabulary and dropped if
//     it names a path that does not exist, so a hallucinated field cannot even
//     make it into the draft.
//
// The division is the point: a model helps a person write the mapping once, and
// the mapping — reviewed, versioned, deterministic — fills every application
// after that.
package assist
