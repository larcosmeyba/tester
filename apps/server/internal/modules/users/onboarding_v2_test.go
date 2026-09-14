package users

import (
	"testing"

	"github.com/helpthehive/server/internal/db"
)

func strPtr(value string) *string { return &value }

func TestVerificationDestinationEmail(t *testing.T) {
	viewer := db.Viewer{User: db.User{Email: strPtr("user@example.com")}}
	destination, err := verificationDestination(viewer, db.VerificationMethodEmail, db.VerificationPurposeSignup, nil, nil)
	if err != nil {
		t.Fatalf("verificationDestination() error = %v", err)
	}
	if destination != "user@example.com" {
		t.Fatalf("verificationDestination() = %q, want user@example.com", destination)
	}
}

func TestVerificationDestinationMissingEmail(t *testing.T) {
	viewer := db.Viewer{}
	if _, err := verificationDestination(viewer, db.VerificationMethodEmail, db.VerificationPurposeSignup, nil, nil); err == nil {
		t.Fatal("verificationDestination() = nil, want an error when the email is missing")
	}
}

// Verification is email-only: there is no text branch, so the profile and
// account phone numbers are never consulted.
func TestVerificationDestinationIgnoresPhones(t *testing.T) {
	viewer := db.Viewer{
		User:    db.User{Email: strPtr("user@example.com"), PhoneNumber: strPtr("+13105550001")},
		Profile: db.Profile{Phone: "+13105550142"},
	}
	destination, err := verificationDestination(viewer, db.VerificationMethodEmail, db.VerificationPurposeSignup, nil, nil)
	if err != nil {
		t.Fatalf("verificationDestination() error = %v", err)
	}
	if destination != "user@example.com" {
		t.Fatalf("verificationDestination() = %q, want the account email", destination)
	}
}

func TestVerificationDestinationPhoneChangeUsesAccountEmail(t *testing.T) {
	// A phone-number change is verified through the email channel: the code
	// goes to the account's email, and the new phone is applied only after
	// the code is confirmed.
	viewer := db.Viewer{User: db.User{Email: strPtr("user@example.com")}}
	destination, err := verificationDestination(viewer, db.VerificationMethodEmail, db.VerificationPurposePhoneChange, nil, strPtr("+13105550142"))
	if err != nil {
		t.Fatalf("verificationDestination() error = %v", err)
	}
	if destination != "user@example.com" {
		t.Fatalf("verificationDestination(phone_change) = %q, want the account email", destination)
	}
}

func TestVerificationDestinationChangePurposesUseNewAddress(t *testing.T) {
	viewer := db.Viewer{User: db.User{Email: strPtr("old@example.com"), PhoneNumber: strPtr("+10000000000")}}

	destination, err := verificationDestination(viewer, db.VerificationMethodEmail, db.VerificationPurposeEmailChange, strPtr("new@example.com"), nil)
	if err != nil || destination != "new@example.com" {
		t.Fatalf("verificationDestination(email_change) = %q, %v, want new@example.com, nil", destination, err)
	}
	if _, err := verificationDestination(viewer, db.VerificationMethodEmail, db.VerificationPurposeEmailChange, nil, nil); err == nil {
		t.Fatal("verificationDestination(email_change, no new email) = nil, want an error")
	}
}

func TestTrimQuestionnairePatch(t *testing.T) {
	patch := db.QuestionnairePatch{
		WeeklyBudget:  strPtr("  $100  "),
		FinanceTopics: []string{" budgeting ", "", "credit "},
		Resources:     nil,
		PrimaryGoal:   strPtr(" APPLY_BENEFITS "),
		HouseholdSize: strPtr("  2-3 people  "),
		IncomeBracket: strPtr("  $30k-$60k  "),
	}
	trimQuestionnairePatch(&patch)
	if patch.WeeklyBudget == nil || *patch.WeeklyBudget != "$100" {
		t.Fatalf("trimQuestionnairePatch() weekly_budget = %v", patch.WeeklyBudget)
	}
	if len(patch.FinanceTopics) != 2 || patch.FinanceTopics[0] != "budgeting" || patch.FinanceTopics[1] != "credit" {
		t.Fatalf("trimQuestionnairePatch() finance_topics = %v, want trimmed non-empty", patch.FinanceTopics)
	}
	if patch.Resources != nil {
		t.Fatalf("trimQuestionnairePatch() resources = %v, want nil (untouched)", patch.Resources)
	}
	if patch.PrimaryGoal == nil || *patch.PrimaryGoal != "APPLY_BENEFITS" {
		t.Fatalf("trimQuestionnairePatch() primary_goal = %v", patch.PrimaryGoal)
	}
	if patch.HouseholdSize == nil || *patch.HouseholdSize != "2-3 people" {
		t.Fatalf("trimQuestionnairePatch() household_size = %v", patch.HouseholdSize)
	}
	if patch.IncomeBracket == nil || *patch.IncomeBracket != "$30k-$60k" {
		t.Fatalf("trimQuestionnairePatch() income_bracket = %v", patch.IncomeBracket)
	}
}

func TestResendSenderRequiresAPIKey(t *testing.T) {
	t.Setenv("RESEND_API_KEY", "")
	sender := NewResendEmailSender()
	if err := sender.SendCode(nil, "user@example.com", "123456"); err == nil {
		t.Fatal("ResendEmailSender.SendCode() = nil without RESEND_API_KEY, want an error")
	}
}

func TestDefaultCodeSendersIsEmailOnly(t *testing.T) {
	senders := DefaultCodeSenders()
	if len(senders) != 1 {
		t.Fatalf("DefaultCodeSenders() has %d senders, want exactly 1", len(senders))
	}
	if _, ok := senders[db.VerificationMethodEmail]; !ok {
		t.Fatalf("DefaultCodeSenders() = %v, want the email sender", senders)
	}
}
