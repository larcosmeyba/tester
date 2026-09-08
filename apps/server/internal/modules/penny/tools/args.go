// Package tools executes what Penny asks for.
//
// It is the boundary the whole design rests on. Above it, a model has produced
// a name and a bag of JSON. Below it, real services write to a real database on
// behalf of a real person. Nothing crosses that line without being looked at:
// the tool must exist, its scope must have been granted for this turn, its
// arguments must be ones it declared, and the identity it runs as comes from a
// verified token rather than from anything the model said.
package tools

import (
	"fmt"
	"math"
	"strconv"
	"strings"
	"time"
)

// Args is a tool call's arguments as they arrived: JSON, decoded loosely.
//
// A model does not produce Go types. It produces a number that may be a
// float64, an int that may have arrived as a string, and a boolean that may be
// the word "true". Every accessor here is written to be strict about what it
// returns and forgiving about what it accepts — but forgiving stops at
// guessing. A value that cannot be read as the requested type is an error the
// model is told about, never a zero quietly passed to a service.
type Args map[string]any

func (a Args) Has(name string) bool {
	value, ok := a[name]
	return ok && value != nil
}

// String reads a required string argument.
func (a Args) String(name string) (string, error) {
	value, ok := a[name]
	if !ok || value == nil {
		return "", fmt.Errorf("%s is required", name)
	}
	text, ok := value.(string)
	if !ok {
		return "", fmt.Errorf("%s must be text", name)
	}
	trimmed := strings.TrimSpace(text)
	if trimmed == "" {
		return "", fmt.Errorf("%s must not be empty", name)
	}
	return trimmed, nil
}

// OptionalString reads a string argument, returning the fallback when absent.
func (a Args) OptionalString(name, fallback string) string {
	text, err := a.String(name)
	if err != nil {
		return fallback
	}
	return text
}

// Int reads a required whole number. A fractional value is rejected rather than
// truncated: a model asking for 2.5 days meant something, and neither 2 nor 3
// is safe to assume.
func (a Args) Int(name string) (int, error) {
	number, err := a.Float(name)
	if err != nil {
		return 0, err
	}
	if number != math.Trunc(number) {
		return 0, fmt.Errorf("%s must be a whole number", name)
	}
	return int(number), nil
}

func (a Args) OptionalInt(name string, fallback int) int {
	number, err := a.Int(name)
	if err != nil {
		return fallback
	}
	return number
}

func (a Args) Float(name string) (float64, error) {
	value, ok := a[name]
	if !ok || value == nil {
		return 0, fmt.Errorf("%s is required", name)
	}
	switch typed := value.(type) {
	case float64:
		return typed, nil
	case float32:
		return float64(typed), nil
	case int:
		return float64(typed), nil
	case int64:
		return float64(typed), nil
	case string:
		// Models write "$120" and "120.00" about as often as 120.
		cleaned := strings.TrimSpace(strings.NewReplacer("$", "", ",", "").Replace(typed))
		number, err := strconv.ParseFloat(cleaned, 64)
		if err != nil {
			return 0, fmt.Errorf("%s must be a number", name)
		}
		return number, nil
	default:
		return 0, fmt.Errorf("%s must be a number", name)
	}
}

func (a Args) OptionalFloat(name string) *float64 {
	number, err := a.Float(name)
	if err != nil {
		return nil
	}
	return &number
}

func (a Args) Bool(name string) (bool, error) {
	value, ok := a[name]
	if !ok || value == nil {
		return false, fmt.Errorf("%s is required", name)
	}
	switch typed := value.(type) {
	case bool:
		return typed, nil
	case string:
		parsed, err := strconv.ParseBool(strings.TrimSpace(typed))
		if err != nil {
			return false, fmt.Errorf("%s must be true or false", name)
		}
		return parsed, nil
	default:
		return false, fmt.Errorf("%s must be true or false", name)
	}
}

func (a Args) OptionalBool(name string, fallback bool) bool {
	value, err := a.Bool(name)
	if err != nil {
		return fallback
	}
	return value
}

// Date reads a YYYY-MM-DD argument. Only that layout is accepted. A date is the
// one field where a helpful parser is dangerous: 03/04 is March the fourth in
// one country and the fourth of March in another, and a pantry item that
// expires on the wrong one of those is food someone throws away or food someone
// eats when they should not.
func (a Args) Date(name string) (time.Time, error) {
	text, err := a.String(name)
	if err != nil {
		return time.Time{}, err
	}
	parsed, err := time.Parse("2006-01-02", text)
	if err != nil {
		return time.Time{}, fmt.Errorf("%s must be a date as YYYY-MM-DD", name)
	}
	return parsed, nil
}

// Enum reads a string argument constrained to a known set, case-insensitively.
func (a Args) Enum(name string, allowed ...string) (string, error) {
	text, err := a.String(name)
	if err != nil {
		return "", err
	}
	for _, candidate := range allowed {
		if strings.EqualFold(text, candidate) {
			return candidate, nil
		}
	}
	return "", fmt.Errorf("%s must be one of %s", name, strings.Join(allowed, ", "))
}
