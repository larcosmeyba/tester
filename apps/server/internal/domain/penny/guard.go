package penny

import (
	"regexp"
	"strings"
)

// The output guard is the last thing between a model and a user.
//
// It assumes the prompt failed. Every rule here is one that is also stated in
// Penny's instructions, and stating a rule to a model is a request, not a
// control. This package is the control, and it runs on every response
// including the ones that look fine.
//
// The guard rewrites nothing. A response that breaks a rule is replaced by a
// refusal, because a paraphrased violation is still the violation and a model
// that learns its output gets edited into acceptability learns nothing.

// GuardVerdict is a checked response.
type GuardVerdict struct {
	// The text to show. Either the model's, or a replacement.
	Text    string
	Outcome Outcome
	// Why the response was replaced. Logged, never shown.
	Violation string
}

// Approved reports whether the model's own words survived.
func (v GuardVerdict) Approved() bool { return v.Violation == "" }

// The replacement. Deliberately plain: it does not apologise for the model, and
// it hands the user the one thing that actually helps, which is a person.
const guardReplacement = "I can't answer that one. For anything about whether you qualify for a program, " +
	"the agency that runs it is the only place that can tell you for certain — and Help The Hive's " +
	"resources page can point you to the office nearest you."

// eligibilityClaims are determinations. Penny explains programs; she does not
// decide who gets into them. The distinction is the whole reason the benefits
// domain exists, and a sentence like "you qualify for SNAP" is a false
// statement about a government decision that has not been made.
var eligibilityClaims = []*regexp.Regexp{
	regexp.MustCompile(`(?i)\byou (?:do |will |would |definitely )?qualif(?:y|ies)\b`),
	regexp.MustCompile(`(?i)\byou(?:'re| are) (?:definitely |certainly )?eligible\b`),
	regexp.MustCompile(`(?i)\byou(?:'ll| will) (?:be approved|get approved|receive benefits)\b`),
	regexp.MustCompile(`(?i)\byou (?:have been|are) approved\b`),
	regexp.MustCompile(`(?i)\byour application (?:has been|was) (?:submitted|filed|sent)\b`),
	regexp.MustCompile(`(?i)\bi(?:'ve| have) (?:submitted|filed|sent) your application\b`),
	regexp.MustCompile(`(?i)\bguaranteed to (?:qualify|receive|get)\b`),
}

// professionalAdvice is advice Penny is not licensed to give. The test is
// prescription, not topic: "SNAP covers groceries" is information, "stop taking
// your medication" is not something an app should say.
var professionalAdvice = []*regexp.Regexp{
	regexp.MustCompile(`(?i)\b(?:you should|i recommend (?:that )?you|you (?:need|ought) to) (?:stop|start|change|reduce|increase) (?:taking |using )?(?:your |the )?(?:medication|medicine|insulin|prescription|dose|dosage|treatment)\b`),
	regexp.MustCompile(`(?i)\byou (?:likely )?have (?:a |an )?(?:diagnosis of|condition called)\b`),
	regexp.MustCompile(`(?i)\byou should (?:invest|put your money|buy (?:stock|shares|crypto))\b`),
	regexp.MustCompile(`(?i)\b(?:you should|i recommend (?:that )?you) (?:sue|file suit|refuse to pay|stop paying)\b`),
	regexp.MustCompile(`(?i)\bthis (?:is|constitutes) legal advice\b`),
}

// injectionCompliance is the shape of a response that followed instructions it
// found in retrieved content rather than instructions from the user. It is
// checked because Penny reads third-party text — resource descriptions,
// imported recipes, knowledge chunks — and a model that announces it is
// ignoring its rules usually is.
var injectionCompliance = []*regexp.Regexp{
	regexp.MustCompile(`(?i)\b(?:ignoring|disregarding|overriding) (?:my |the |all |your )?(?:previous |prior |earlier |above )?(?:instructions|rules|guidelines|system prompt)\b`),
	regexp.MustCompile(`(?i)\bas (?:instructed|requested) (?:by|in) the (?:document|resource|listing|page|content)\b`),
	regexp.MustCompile(`(?i)\bmy system prompt (?:says|is|reads)\b`),
	regexp.MustCompile(`(?i)\bdeveloper mode\b`),
}

// Guard checks a response. citationsPresent says whether the turn produced any
// citation; benefitsClaimed says whether the router granted the benefits scope,
// which is the cheap proxy for "this turn is about a program".
func Guard(text string, benefitsClaimed bool, citationsPresent bool) GuardVerdict {
	trimmed := strings.TrimSpace(text)
	if trimmed == "" {
		return GuardVerdict{
			Text:      "Sorry — something went wrong on my end. Try that again?",
			Outcome:   OutcomeFailed,
			Violation: "empty response",
		}
	}

	for _, pattern := range eligibilityClaims {
		if match := pattern.FindStringIndex(trimmed); match != nil && !hedged(trimmed, match[0]) {
			return refuse("eligibility determination: " + pattern.String())
		}
	}
	for _, pattern := range professionalAdvice {
		if pattern.MatchString(trimmed) {
			return refuse("professional advice: " + pattern.String())
		}
	}
	for _, pattern := range injectionCompliance {
		if pattern.MatchString(trimmed) {
			return refuse("instruction-following from untrusted content: " + pattern.String())
		}
	}

	// A specific claim about a program, with nothing behind it, is the failure
	// mode RAG exists to prevent. Dollar figures and percentages are the ones
	// that cost someone something when they are wrong, so they are what is
	// checked rather than every sentence mentioning SNAP.
	if benefitsClaimed && !citationsPresent && hasHardNumber(trimmed) {
		return refuse("uncited figure in a benefits answer")
	}

	return GuardVerdict{Text: trimmed, Outcome: OutcomeOK}
}

// hedged reports whether a matched phrase sits inside a conditional clause.
//
// This is the difference between the two most important sentences Penny can
// say about a benefits program. "You qualify for SNAP" is a determination she
// has no business making. "Whether you qualify depends on your income, and only
// the agency can tell you" is the correct answer to the question, and it
// contains the same three words.
//
// RE2 has no lookbehind, so the check is done here: walk back to the start of
// the clause the match sits in and look for a hedge. Bounded, because a hedge
// two sentences earlier does not soften a flat assertion here.
func hedged(text string, at int) bool {
	const window = 80

	start := at - window
	if start < 0 {
		start = 0
	}
	clause := text[start:at]

	// A clause boundary resets the check: "You qualify. Whether you apply is up
	// to you" must not be excused by the hedge that follows it.
	if cut := strings.LastIndexAny(clause, ".!?;,—"); cut >= 0 {
		clause = clause[cut+1:]
	}

	lowered := strings.ToLower(clause)
	for _, marker := range hedgeMarkers {
		if strings.Contains(lowered, marker) {
			return true
		}
	}
	return false
}

// Words that turn a claim into a question about a claim.
var hedgeMarkers = []string{
	"whether", "if ", "depends on", "may ", "might ", "could ", "cannot say",
	"can't say", "do not know", "don't know", "not able to say", "decides",
	"will decide", "determines", "up to",
}

func refuse(violation string) GuardVerdict {
	return GuardVerdict{
		Text:      guardReplacement,
		Outcome:   OutcomeRefused,
		Violation: violation,
	}
}

// hasHardNumber looks for the kinds of number a user would act on: money, a
// percentage, or a stated limit. A date or a phone number is not one.
var hardNumber = regexp.MustCompile(`\$\s?[\d,]+(?:\.\d{2})?|\b\d{1,3}(?:\.\d+)?\s?%|\b(?:limit|maximum|minimum|threshold|cap) of \b`)

func hasHardNumber(text string) bool { return hardNumber.MatchString(text) }
