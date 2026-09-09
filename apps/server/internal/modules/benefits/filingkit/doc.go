// Package filingkit builds a "filing kit" for a government benefits form that
// Help The Hive cannot auto-fill: the flat print-and-fill forms whose only
// machine path would be per-box coordinates — fragile, and broken by every
// agency revision. Hand-mapping 743 pages of them is not a plan, so the kit
// takes a different one.
//
// A filing kit is an answer sheet, not a form. Given the applicant's stored
// profile and the identity of a target flat form, Generate produces a Kit —
// the applicant's answered questions grouped in the A–J section order every
// verified state combined application uses (National Autofill Question Set
// v1.0) — and Render turns it into a printable PDF: one row per answered
// question (question label + the applicant's answer), ruled blank lines marked
// "fill in by hand" for questions the form likely needs that have no answer
// yet. The applicant, or someone helping them, transcribes from the sheet onto
// the official paper form.
//
// The hard rules of the benefits module apply here unchanged:
//
//   - The app prepares documents; it never submits them. The kit says so on
//     every page, and it never claims to be a submission.
//   - Nothing is invented. A blank line is a blank line; no answer is guessed
//     into one, and a question nobody asked is never reported as answered.
//   - Values are never logged. Generate takes no logger, and the audit record
//     (Kit.Audit) carries section codes, field paths and counts — never
//     values — following the benefits_application_fields no-values pattern.
//   - A kit is a draft document. It holds the applicant's values, so when it
//     is stored it must carry a draft-style purge date and fall under the
//     existing 30-day retention sweep.
package filingkit
