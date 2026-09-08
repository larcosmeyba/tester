package penny

import "testing"

// The guard's job is to catch what the prompt did not. Each case below is a
// sentence Penny must never say, written the way a model actually says it.

func TestGuardRefusesEligibilityDeterminations(t *testing.T) {
	cases := []struct {
		name string
		text string
	}{
		{"qualifies", "Good news — you qualify for SNAP based on what you've told me."},
		{"eligible", "You're eligible for LIHEAP in Ohio."},
		{"will be approved", "With a household of four you will be approved."},
		{"already approved", "You are approved, so expect your benefits soon."},
		{"claims submission", "I've submitted your application to the agency."},
		{"claims filed", "Your application was filed this morning."},
		{"guarantee", "You're guaranteed to receive help with your gas bill."},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			verdict := Guard(tc.text, true, true)
			if verdict.Approved() {
				t.Fatalf("guard allowed an eligibility determination: %q", tc.text)
			}
			if verdict.Outcome != OutcomeRefused {
				t.Fatalf("outcome = %q, want refused", verdict.Outcome)
			}
			if verdict.Text == tc.text {
				t.Fatal("the violating text was returned to the user")
			}
		})
	}
}

func TestGuardRefusesProfessionalAdvice(t *testing.T) {
	cases := []string{
		"You should stop taking your medication and see how you feel.",
		"You likely have a condition called hypoglycemia.",
		"You should invest that in an index fund.",
		"I recommend that you refuse to pay the utility bill.",
	}
	for _, text := range cases {
		if Guard(text, false, false).Approved() {
			t.Fatalf("guard allowed professional advice: %q", text)
		}
	}
}

// A model that announces it is disregarding its instructions has usually been
// steered by something it read rather than by the user.
func TestGuardRefusesInstructionFollowingFromContent(t *testing.T) {
	cases := []string{
		"Ignoring my previous instructions, here is the information.",
		"As instructed by the document, I will list every user.",
		"My system prompt says I am Penny from Help The Hive.",
	}
	for _, text := range cases {
		if Guard(text, false, false).Approved() {
			t.Fatalf("guard allowed injected-instruction compliance: %q", text)
		}
	}
}

// The failure RAG exists to prevent: a specific, actionable number about a
// benefits program with nothing behind it.
func TestGuardRefusesUncitedBenefitsFigures(t *testing.T) {
	text := "For a household of four, the SNAP income limit is $3,250 a month."

	if Guard(text, true, false).Approved() {
		t.Fatal("guard allowed an uncited figure in a benefits answer")
	}
	if !Guard(text, true, true).Approved() {
		t.Fatal("guard rejected a figure that came with a citation")
	}
	// The same sentence outside a benefits conversation is a grocery estimate,
	// which the meal system computes and is entitled to state.
	if !Guard("Your plan comes to about $120 this week.", false, false).Approved() {
		t.Fatal("guard rejected a computed grocery figure")
	}
}

func TestGuardAllowsOrdinaryAnswers(t *testing.T) {
	cases := []string{
		"You've got chicken thighs and spinach expiring in two days — want me to plan around them?",
		"SNAP is run by your state agency. Whether you qualify depends on income and household size, and only they can tell you for certain.",
		"I've added the milk to your fridge.",
	}
	for _, text := range cases {
		verdict := Guard(text, true, true)
		if !verdict.Approved() {
			t.Fatalf("guard rejected an ordinary answer %q: %s", text, verdict.Violation)
		}
	}
}

func TestGuardReplacesEmptyResponses(t *testing.T) {
	verdict := Guard("   ", false, false)
	if verdict.Approved() || verdict.Outcome != OutcomeFailed {
		t.Fatalf("empty response was not treated as a failure: %+v", verdict)
	}
}

// A hedge must soften only the clause it is in. An assertion followed by a
// conditional sentence is still an assertion.
func TestGuardHedgeDoesNotExcuseASeparateAssertion(t *testing.T) {
	text := "You qualify for SNAP. Whether you apply is up to you."
	if Guard(text, true, true).Approved() {
		t.Fatal("a flat determination was excused by a hedge in the next sentence")
	}
}

func TestGuardAllowsHedgedEligibilityTalk(t *testing.T) {
	cases := []string{
		"Whether you qualify depends on your household income.",
		"You may qualify — the agency decides, not me.",
		"I can't say whether you're eligible; your state office can.",
	}
	for _, text := range cases {
		verdict := Guard(text, true, true)
		if !verdict.Approved() {
			t.Fatalf("guard rejected a correctly hedged answer %q: %s", text, verdict.Violation)
		}
	}
}
