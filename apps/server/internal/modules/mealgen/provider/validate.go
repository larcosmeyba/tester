package provider

import (
	"encoding/json"
	"errors"
	"regexp"
	"strings"
)

// A provider's reply is untrusted input. It is parsed, bounded, stripped of
// markup and checked against the facts it was given before it reaches a user.

const (
	// A Penny message is a short paragraph. Anything longer is a sign the model
	// ignored the instructions.
	maxMessageRunes = 600
	maxSentences    = 5
)

// Claims Penny is never allowed to make, whatever the prompt said. These cover
// eligibility, approval and guarantees — the three things a benefits app must
// never assert on a user's behalf.
var forbiddenPhrases = []string{
	"you qualify",
	"you are approved",
	"you're approved",
	"you have been approved",
	"guaranteed",
	"guarantee",
	"application was submitted",
	"application has been submitted",
	"you are eligible",
	"you're eligible",
	"i am a doctor",
	"medically",
	"diagnos",
	"prescri",
	"invest",
}

var (
	numberPattern    = regexp.MustCompile(`\d+(?:[.,]\d+)?`)
	markupPattern    = regexp.MustCompile(`[*_#` + "`" + `\[\]]`)
	whitespaceRunsRe = regexp.MustCompile(`\s+`)
)

// Message is the structured shape a provider must return.
type Message struct {
	Message string `json:"message"`
}

var (
	ErrNotStructured = errors.New("ai response was not the expected JSON object")
	ErrEmpty         = errors.New("ai response was empty")
	ErrTooLong       = errors.New("ai response was too long")
	ErrForbidden     = errors.New("ai response made a claim Penny is not allowed to make")
	ErrInventedValue = errors.New("ai response contained a number that was not in the fact sheet")
)

// ValidateMessage parses and checks a provider's reply. Any failure is a reason
// to discard the reply, not to fail the user's request: the caller falls back
// to text the server wrote itself.
func ValidateMessage(raw string, facts PlanFacts) (string, error) {
	decoded, err := decodeMessage(raw)
	if err != nil {
		return "", err
	}

	message := whitespaceRunsRe.ReplaceAllString(markupPattern.ReplaceAllString(decoded, " "), " ")
	message = strings.TrimSpace(message)
	if message == "" {
		return "", ErrEmpty
	}
	if len([]rune(message)) > maxMessageRunes || strings.Count(message, ".") > maxSentences {
		return "", ErrTooLong
	}

	lowered := strings.ToLower(message)
	for _, phrase := range forbiddenPhrases {
		if strings.Contains(lowered, phrase) {
			return "", ErrForbidden
		}
	}

	// Every figure in the message must be one the server computed. This is what
	// stops a model from quoting a price, a total or a date of its own.
	allowed := make(map[string]bool)
	for _, value := range facts.AllowedNumbers() {
		allowed[value] = true
	}
	for _, found := range numberPattern.FindAllString(message, -1) {
		if !allowed[normalizeNumber(found)] {
			return "", ErrInventedValue
		}
	}

	return message, nil
}

// decodeMessage accepts the JSON object the prompt asks for, tolerating a
// fenced code block around it. Anything else is rejected rather than guessed at.
func decodeMessage(raw string) (string, error) {
	trimmed := strings.TrimSpace(raw)
	trimmed = strings.TrimPrefix(trimmed, "```json")
	trimmed = strings.TrimPrefix(trimmed, "```")
	trimmed = strings.TrimSuffix(trimmed, "```")
	trimmed = strings.TrimSpace(trimmed)

	var message Message
	if err := json.Unmarshal([]byte(trimmed), &message); err != nil {
		return "", ErrNotStructured
	}
	if strings.TrimSpace(message.Message) == "" {
		return "", ErrEmpty
	}
	return message.Message, nil
}

// normalizeNumber makes "1,234.50", "1234.50" and "1234.5" comparable, so
// formatting differences are not mistaken for invented figures. Anything it
// cannot normalise stays unmatched, which rejects the reply — the safe way to
// be wrong.
func normalizeNumber(value string) string {
	value = strings.ReplaceAll(value, ",", "")
	if strings.Contains(value, ".") {
		value = strings.TrimRight(value, "0")
		value = strings.TrimRight(value, ".")
	}
	return value
}
