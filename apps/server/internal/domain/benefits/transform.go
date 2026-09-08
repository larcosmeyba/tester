package benefits

import (
	"fmt"
	"strconv"
	"strings"
	"time"
	"unicode"
)

// Transform reshapes an answer into what a particular form's box expects —
// upper case, a two-digit month, a bare string of digits.
//
// The set is closed and every op is pure: the same answer and the same mapping
// always produce the same characters. There is deliberately no "default" op. A
// default is an invented answer, and inventing answers is the one thing this
// system must never do. A mapping may declare a constant instead, which is
// authored by a person, reviewed, and recorded in the audit trail as a constant
// rather than as something the applicant said.
type Transform struct {
	Op string `json:"op"`

	Max    int       `json:"max,omitempty"`
	Layout string    `json:"layout,omitempty"`
	Style  string    `json:"style,omitempty"`
	Sep    string    `json:"sep,omitempty"`
	With   FieldPath `json:"with,omitempty"`
	Index  int       `json:"index,omitempty"`
	Yes    string    `json:"yes,omitempty"`
	No     string    `json:"no,omitempty"`
	Length int       `json:"length,omitempty"`
	Char   string    `json:"char,omitempty"`
}

const (
	OpTrim      = "trim"
	OpUpper     = "upper"
	OpLower     = "lower"
	OpTitle     = "title"
	OpTruncate  = "truncate"
	OpDate      = "date"
	OpMoney     = "money"
	OpDigits    = "digits"
	OpPhone     = "phone"
	OpSSN       = "ssn"
	OpJoin      = "join"
	OpSplit     = "split"
	OpBoolYesNo = "boolYesNo"
	OpPad       = "pad"
)

func (t Transform) Validate() error {
	switch t.Op {
	case OpTrim, OpUpper, OpLower, OpTitle, OpDigits:
		return nil
	case OpTruncate:
		if t.Max <= 0 {
			return fmt.Errorf("transform %q needs a positive max", t.Op)
		}
	case OpDate:
		if strings.TrimSpace(t.Layout) == "" {
			return fmt.Errorf("transform %q needs a layout", t.Op)
		}
	case OpMoney:
		if !containsString([]string{"plain", "grouped", "with_symbol", "dollars", "cents"}, t.Style) {
			return fmt.Errorf("transform %q: unknown style %q", t.Op, t.Style)
		}
	case OpPhone:
		if !containsString([]string{"digits", "dashed", "parens", "area", "local"}, t.Style) {
			return fmt.Errorf("transform %q: unknown style %q", t.Op, t.Style)
		}
	case OpSSN:
		if !containsString([]string{"full", "digits", "last4", "masked"}, t.Style) {
			return fmt.Errorf("transform %q: unknown style %q", t.Op, t.Style)
		}
	case OpJoin:
		if t.With == "" {
			return fmt.Errorf("transform %q needs a with path", t.Op)
		}
		if err := ValidatePath(t.With); err != nil {
			return fmt.Errorf("transform %q: %v", t.Op, err)
		}
	case OpSplit:
		if t.Sep == "" {
			return fmt.Errorf("transform %q needs a separator", t.Op)
		}
		if t.Index < 0 {
			return fmt.Errorf("transform %q needs a non-negative index", t.Op)
		}
	case OpBoolYesNo:
		if t.Yes == "" || t.No == "" {
			return fmt.Errorf("transform %q needs both yes and no", t.Op)
		}
	case OpPad:
		if t.Length <= 0 || len([]rune(t.Char)) != 1 {
			return fmt.Errorf("transform %q needs a positive length and a single pad character", t.Op)
		}
	default:
		return fmt.Errorf("unknown transform %q", t.Op)
	}
	return nil
}

// PathLookup resolves another field path during a transform. It is passed in
// rather than reached for, so this file stays pure.
type PathLookup func(FieldPath) Value

// Apply runs one transform. It returns an error rather than a best guess: a
// value that will not fit its box is a problem for the reviewer to see, not
// something to quietly mangle.
func (t Transform) Apply(in string, lookup PathLookup) (string, error) {
	switch t.Op {
	case OpTrim:
		return strings.TrimSpace(in), nil
	case OpUpper:
		return strings.ToUpper(in), nil
	case OpLower:
		return strings.ToLower(in), nil
	case OpTitle:
		return titleCase(in), nil
	case OpTruncate:
		runes := []rune(in)
		if len(runes) <= t.Max {
			return in, nil
		}
		return string(runes[:t.Max]), nil
	case OpDigits:
		return digitsOnly(in), nil
	case OpDate:
		parsed, err := time.Parse(time.DateOnly, in)
		if err != nil {
			return "", fmt.Errorf("date transform: %q is not a YYYY-MM-DD date", in)
		}
		return parsed.Format(t.Layout), nil
	case OpMoney:
		return formatMoney(in, t.Style)
	case OpPhone:
		return formatPhone(in, t.Style)
	case OpSSN:
		return formatSSN(in, t.Style)
	case OpJoin:
		if lookup == nil {
			return "", fmt.Errorf("join transform: no lookup available")
		}
		other, err := renderValue(lookup(t.With))
		if err != nil {
			return "", fmt.Errorf("join transform: %v", err)
		}
		if other == "" {
			return in, nil
		}
		if in == "" {
			return other, nil
		}
		return in + t.Sep + other, nil
	case OpSplit:
		parts := strings.Split(in, t.Sep)
		if t.Index >= len(parts) {
			return "", nil
		}
		return parts[t.Index], nil
	case OpBoolYesNo:
		switch in {
		case "true":
			return t.Yes, nil
		case "false":
			return t.No, nil
		}
		return "", fmt.Errorf("boolYesNo transform: %q is not a boolean", in)
	case OpPad:
		runes := []rune(in)
		if len(runes) >= t.Length {
			return in, nil
		}
		return strings.Repeat(t.Char, t.Length-len(runes)) + in, nil
	}
	return "", fmt.Errorf("unknown transform %q", t.Op)
}

// renderValue turns an answer into its canonical string, before any transform.
// Only answers that may appear on a form get here; StatusUnknown never does.
func renderValue(v Value) (string, error) {
	switch v.Status() {
	case StatusNone:
		// "I have none of these" has no text to write. A checkbox reads it as
		// false; a text box stays empty.
		return "", nil
	case StatusProvided:
	default:
		return "", fmt.Errorf("value is %s and must not be rendered", v.Status())
	}

	switch v.Kind() {
	case KindText, KindChoice:
		text, _ := v.TextValue()
		return text, nil
	case KindNumber:
		number, _ := v.NumberValue()
		return strconv.FormatFloat(number, 'f', -1, 64), nil
	case KindMoney:
		cents, _ := v.MoneyValue()
		return centsToDecimal(cents), nil
	case KindDate:
		date, _ := v.DateValue()
		return date.Format(time.DateOnly), nil
	case KindBoolean:
		truth, _ := v.BoolValue()
		return strconv.FormatBool(truth), nil
	case KindList:
		items, _ := v.ListValue()
		return strings.Join(items, ", "), nil
	}
	return "", fmt.Errorf("value has no renderable kind")
}

func centsToDecimal(cents int64) string {
	negative := cents < 0
	if negative {
		cents = -cents
	}
	whole := cents / 100
	fraction := cents % 100
	out := fmt.Sprintf("%d.%02d", whole, fraction)
	if negative {
		return "-" + out
	}
	return out
}

func formatMoney(in, style string) (string, error) {
	parts := strings.SplitN(in, ".", 2)
	whole := parts[0]
	fraction := "00"
	if len(parts) == 2 {
		fraction = parts[1]
	}
	switch style {
	case "plain":
		return in, nil
	case "dollars":
		return whole, nil
	case "cents":
		return fraction, nil
	case "grouped":
		return groupThousands(whole) + "." + fraction, nil
	case "with_symbol":
		return "$" + groupThousands(whole) + "." + fraction, nil
	}
	return "", fmt.Errorf("money transform: unknown style %q", style)
}

func groupThousands(whole string) string {
	negative := strings.HasPrefix(whole, "-")
	whole = strings.TrimPrefix(whole, "-")

	var out []byte
	for i, digit := range []byte(whole) {
		if i > 0 && (len(whole)-i)%3 == 0 {
			out = append(out, ',')
		}
		out = append(out, digit)
	}
	if negative {
		return "-" + string(out)
	}
	return string(out)
}

func formatPhone(in, style string) (string, error) {
	digits := digitsOnly(in)
	digits = strings.TrimPrefix(digits, "1")
	if len(digits) != 10 {
		return "", fmt.Errorf("phone transform: expected 10 digits, got %d", len(digits))
	}
	switch style {
	case "digits":
		return digits, nil
	case "dashed":
		return digits[0:3] + "-" + digits[3:6] + "-" + digits[6:], nil
	case "parens":
		return "(" + digits[0:3] + ") " + digits[3:6] + "-" + digits[6:], nil
	case "area":
		return digits[0:3], nil
	case "local":
		return digits[3:], nil
	}
	return "", fmt.Errorf("phone transform: unknown style %q", style)
}

func formatSSN(in, style string) (string, error) {
	digits := digitsOnly(in)
	if len(digits) != 9 {
		return "", fmt.Errorf("ssn transform: expected 9 digits, got %d", len(digits))
	}
	switch style {
	case "digits":
		return digits, nil
	case "full":
		return digits[0:3] + "-" + digits[3:5] + "-" + digits[5:], nil
	case "last4":
		return digits[5:], nil
	case "masked":
		return "XXX-XX-" + digits[5:], nil
	}
	return "", fmt.Errorf("ssn transform: unknown style %q", style)
}

func digitsOnly(in string) string {
	var out strings.Builder
	for _, r := range in {
		if unicode.IsDigit(r) {
			out.WriteRune(r)
		}
	}
	return out.String()
}

// titleCase upper-cases the first letter of each word and lower-cases the rest.
// strings.Title is deprecated and Unicode-aware casing of names is a bigger
// problem than a form field needs; this is the plain, predictable version.
func titleCase(in string) string {
	var out strings.Builder
	newWord := true
	for _, r := range in {
		switch {
		case unicode.IsSpace(r) || r == '-' || r == '\'':
			newWord = true
			out.WriteRune(r)
		case newWord:
			out.WriteRune(unicode.ToUpper(r))
			newWord = false
		default:
			out.WriteRune(unicode.ToLower(r))
		}
	}
	return out.String()
}
