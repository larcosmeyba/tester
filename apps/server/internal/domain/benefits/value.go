package benefits

import (
	"time"
)

// AnswerStatus separates the three things a blank field can mean. Collapsing
// them is the bug this whole package exists to prevent: "$0 of income" and
// "income not asked yet" are different facts, and only one of them may be
// written onto a government form.
type AnswerStatus string

const (
	// StatusUnknown: never asked, or skipped. Never reaches a PDF.
	StatusUnknown AnswerStatus = "unknown"
	// StatusProvided: the user gave a value.
	StatusProvided AnswerStatus = "provided"
	// StatusNone: the user said they have none of this. A real answer, and it
	// does reach a PDF — an unticked "do you pay for heating" box is a claim.
	StatusNone AnswerStatus = "none"
	// StatusRefused: asked, declined to say. Never reaches a PDF, and is not
	// re-asked on every run.
	StatusRefused AnswerStatus = "refused"
)

// Answerable reports whether a status carries something a form may state.
func (s AnswerStatus) Answerable() bool {
	return s == StatusProvided || s == StatusNone
}

func (s AnswerStatus) Valid() bool {
	switch s {
	case StatusUnknown, StatusProvided, StatusNone, StatusRefused:
		return true
	}
	return false
}

// ValueKind is the shape of an answer. It decides which transforms may apply
// and which control the app shows when it asks.
type ValueKind string

const (
	KindText    ValueKind = "text"
	KindNumber  ValueKind = "number"
	KindMoney   ValueKind = "money" // always minor units (cents), never a float
	KindDate    ValueKind = "date"
	KindBoolean ValueKind = "boolean"
	KindChoice  ValueKind = "choice"
	KindList    ValueKind = "list"
)

// Source records where an answer came from. It is kept beside the answer so a
// completed application can always be explained: a constant written by a
// reviewed mapping file is not the same as something the applicant told us.
type Source string

const (
	SourceUser            Source = "user"             // the applicant answered
	SourceProfile         Source = "profile"          // carried over from the saved profile
	SourceDerived         Source = "derived"          // computed from provided answers only
	SourceMappingConstant Source = "mapping_constant" // authored in a reviewed mapping file
)

// Value is one answer. Its payload is unexported and reachable only through the
// typed accessors, so a caller cannot read a money field as text by accident —
// and, deliberately, Value has no String method. Nothing should be able to
// spill an SSN into a log line by interpolating a struct.
type Value struct {
	status AnswerStatus
	kind   ValueKind
	source Source

	text   string
	number float64
	cents  int64
	date   time.Time
	truth  bool
	list   []string
}

// Unknown is the zero value on purpose: a Value nobody has set is one nobody
// has answered, and it can never be written to a form.
func Unknown() Value { return Value{status: StatusUnknown} }

func None(kind ValueKind, source Source) Value {
	return Value{status: StatusNone, kind: kind, source: source}
}

func Refused(kind ValueKind) Value {
	return Value{status: StatusRefused, kind: kind, source: SourceUser}
}

func Text(s string, source Source) Value {
	return Value{status: StatusProvided, kind: KindText, source: source, text: s}
}

func Choice(s string, source Source) Value {
	return Value{status: StatusProvided, kind: KindChoice, source: source, text: s}
}

func Number(n float64, source Source) Value {
	return Value{status: StatusProvided, kind: KindNumber, source: source, number: n}
}

// Money takes minor units. Benefits arithmetic is done in cents so that a
// household's income never drifts by a rounding error.
func Money(cents int64, source Source) Value {
	return Value{status: StatusProvided, kind: KindMoney, source: source, cents: cents}
}

func Date(t time.Time, source Source) Value {
	return Value{status: StatusProvided, kind: KindDate, source: source, date: t.UTC().Truncate(24 * time.Hour)}
}

func Bool(b bool, source Source) Value {
	return Value{status: StatusProvided, kind: KindBoolean, source: source, truth: b}
}

func List(items []string, source Source) Value {
	copied := make([]string, len(items))
	copy(copied, items)
	return Value{status: StatusProvided, kind: KindList, source: source, list: copied}
}

func (v Value) Status() AnswerStatus { return v.status }
func (v Value) Kind() ValueKind      { return v.kind }
func (v Value) Source() Source       { return v.source }

// Answerable reports whether this value may be written onto a form.
func (v Value) Answerable() bool { return v.status.Answerable() }

// Provided reports whether there is an actual payload to render. A StatusNone
// value is answerable but has nothing to write in a text box; it matters to
// checkboxes and to requirement checks.
func (v Value) Provided() bool { return v.status == StatusProvided }

func (v Value) TextValue() (string, bool) {
	if !v.Provided() || (v.kind != KindText && v.kind != KindChoice) {
		return "", false
	}
	return v.text, true
}

func (v Value) NumberValue() (float64, bool) {
	if !v.Provided() || v.kind != KindNumber {
		return 0, false
	}
	return v.number, true
}

func (v Value) MoneyValue() (int64, bool) {
	if !v.Provided() || v.kind != KindMoney {
		return 0, false
	}
	return v.cents, true
}

func (v Value) DateValue() (time.Time, bool) {
	if !v.Provided() || v.kind != KindDate {
		return time.Time{}, false
	}
	return v.date, true
}

// BoolValue reports a boolean answer. StatusNone on a boolean field reads as
// false — "I have none of these" is a no — which is why it is returned as
// answered rather than as missing.
func (v Value) BoolValue() (bool, bool) {
	if v.kind != KindBoolean {
		return false, false
	}
	switch v.status {
	case StatusProvided:
		return v.truth, true
	case StatusNone:
		return false, true
	}
	return false, false
}

func (v Value) ListValue() ([]string, bool) {
	if v.kind != KindList {
		return nil, false
	}
	switch v.status {
	case StatusProvided:
		copied := make([]string, len(v.list))
		copy(copied, v.list)
		return copied, true
	case StatusNone:
		return []string{}, true
	}
	return nil, false
}

// Redacted is what logs and error messages are allowed to see: the shape of an
// answer, never the answer.
func (v Value) Redacted() string {
	if v.status != StatusProvided {
		return string(v.status)
	}
	return "provided:" + string(v.kind)
}
