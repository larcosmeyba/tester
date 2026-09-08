package benefits

// The result of resolving a profile against a form mapping. Every mapped field
// lands in exactly one of these buckets, and the buckets are the contract the
// mobile app is built on: Filled is what the review screen shows, Missing is
// what the questionnaire asks for next, Problems are what a human has to look
// at, and Skipped is what Help The Hive deliberately leaves blank.

type SkipReason string

const (
	// SkipPolicy: the mapping says Help The Hive must not fill this — a
	// signature, the date beside one, an office-use box.
	SkipPolicy SkipReason = "policy"
	// SkipNotApplicable: a slot on the form for a row the household does not
	// have. A form with six household-member lines and a two-person household
	// leaves four blank, and that is correct, not missing.
	SkipNotApplicable SkipReason = "not_applicable"
)

// FilledField is one value that will appear on the PDF. It carries where the
// value came from so the review screen can show the applicant not just what
// will be written but why.
type FilledField struct {
	FieldID   string
	Target    Target
	Page      int
	Label     string
	FieldPath FieldPath
	Source    Source
	// Text is what gets written for text, dropdown, listbox and radio targets.
	Text string
	// Checked is the state of a checkbox or checkmark target.
	Checked bool
	// Sensitive marks a value that must be masked in any listing and never
	// logged. The PDF still receives the real value.
	Sensitive bool
}

// MissingField is one question the app must put to the user. Several form
// fields can wait on the same answer, so they are aggregated: the applicant is
// asked for their last name once, not once per box on the form.
type MissingField struct {
	FieldPath  FieldPath
	Label      string
	Question   string
	Group      string
	AnswerKind ValueKind
	Choices    []string
	Strength   Strength
	Sensitive  bool
	// Derived marks a value the profile computes rather than collects — a
	// household's monthly income total, say. It is still reported when a form
	// needs it and it cannot be worked out, because the box will be blank; but
	// the app must not put it to the user as a question, because there is no
	// answer they could give. Answering its inputs is what fills it.
	Derived      bool
	FormFieldIDs []string
}

// FieldProblem is a value that exists but cannot be written — too long for the
// box, not a date, not one of the options the PDF offers. It is surfaced rather
// than silently truncated, because a mangled answer on a government form is
// worse than a blank one.
type FieldProblem struct {
	FieldID   string
	FieldPath FieldPath
	Reason    string
}

type SkippedField struct {
	FieldID string
	Reason  SkipReason
	Note    string
}

type Resolution struct {
	Filled   []FilledField
	Missing  []MissingField
	Problems []FieldProblem
	Skipped  []SkippedField
}

// NeedsInput reports whether the application is waiting on the user. A form is
// never filled past a required unknown.
func (r Resolution) NeedsInput() bool {
	for _, missing := range r.Missing {
		if missing.Strength == Required {
			return true
		}
	}
	return false
}

// Ready reports whether the application can be approved: nothing required is
// missing and nothing is broken.
func (r Resolution) Ready() bool {
	return !r.NeedsInput() && len(r.Problems) == 0
}
