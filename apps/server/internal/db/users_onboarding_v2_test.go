package db

import (
	"context"
	"encoding/hex"
	"errors"
	"os"
	"testing"
	"time"
)

// --- Pure unit tests (no database) ---

func TestRandomVerificationCodeFormat(t *testing.T) {
	for i := 0; i < 50; i++ {
		code, err := randomVerificationCode()
		if err != nil {
			t.Fatalf("randomVerificationCode() error = %v", err)
		}
		if len(code) != 6 {
			t.Fatalf("randomVerificationCode() = %q, want 6 digits", code)
		}
		for _, r := range code {
			if r < '0' || r > '9' {
				t.Fatalf("randomVerificationCode() = %q, want numeric", code)
			}
		}
	}
}

func TestCompareVerificationCodeRoundTrip(t *testing.T) {
	salt := []byte("0123456789abcdef")
	code := "482913"
	stored := hex.EncodeToString(salt) + "$" + hex.EncodeToString(hashVerificationCode(salt, code))
	if !compareVerificationCode(stored, code) {
		t.Fatal("compareVerificationCode() = false for the correct code")
	}
	if compareVerificationCode(stored, "482914") {
		t.Fatal("compareVerificationCode() = true for a wrong code")
	}
	if compareVerificationCode(stored, "") {
		t.Fatal("compareVerificationCode() = true for an empty code")
	}
}

func TestCompareVerificationCodeMalformed(t *testing.T) {
	for _, stored := range []string{"", "nosaltseparator", "$onlyhash", "nothex$zzzz", "aa$bb"} {
		if compareVerificationCode(stored, "123456") {
			t.Fatalf("compareVerificationCode(%q) = true, want false for malformed hash", stored)
		}
	}
}

// --- Integration tests (need TEST_DATABASE_URL) ---

func testOnboardingStore(t *testing.T) *Store {
	t.Helper()
	databaseURL := os.Getenv("TEST_DATABASE_URL")
	if databaseURL == "" {
		t.Skip("TEST_DATABASE_URL is not set")
	}
	ctx := context.Background()
	runMigrations(t, databaseURL)
	pool, err := Connect(ctx, databaseURL)
	if err != nil {
		t.Fatalf("Connect() error = %v", err)
	}
	t.Cleanup(pool.Close)
	return NewStore(pool)
}

func testOnboardingViewer(t *testing.T, store *Store) Viewer {
	t.Helper()
	viewer, err := store.EnsureViewer(context.Background(), "onboarding-v2-"+time.Now().Format("150405.000000000"), stringPtr("v2@example.com"))
	if err != nil {
		t.Fatalf("EnsureViewer() error = %v", err)
	}
	return viewer
}

func TestVerificationCodeSuccess(t *testing.T) {
	store := testOnboardingStore(t)
	ctx := context.Background()
	viewer := testOnboardingViewer(t, store)

	code, err := store.CreateVerificationCode(ctx, viewer.User.ID, VerificationMethodEmail, VerificationPurposeSignup, nil, nil)
	if err != nil {
		t.Fatalf("CreateVerificationCode() error = %v", err)
	}
	if len(code) != 6 {
		t.Fatalf("CreateVerificationCode() code = %q, want 6 digits", code)
	}

	result, err := store.VerifyCode(ctx, viewer.User.ID, code)
	if err != nil {
		t.Fatalf("VerifyCode() error = %v", err)
	}
	if result.Method != VerificationMethodEmail || result.Purpose != VerificationPurposeSignup {
		t.Fatalf("VerifyCode() result = %+v, want email/signup", result)
	}
	if result.User.AccountVerifiedAt == nil {
		t.Fatal("VerifyCode() did not stamp account_verified_at")
	}
	if result.User.VerificationMethod == nil || *result.User.VerificationMethod != VerificationMethodEmail {
		t.Fatalf("VerifyCode() verification_method = %v, want email", result.User.VerificationMethod)
	}

	// Consumed codes cannot be reused.
	if _, err := store.VerifyCode(ctx, viewer.User.ID, code); !errors.Is(err, ErrVerificationCodeInvalid) {
		t.Fatalf("VerifyCode(reused) error = %v, want ErrVerificationCodeInvalid", err)
	}
}

func TestVerificationCodeWrongCode(t *testing.T) {
	store := testOnboardingStore(t)
	ctx := context.Background()
	viewer := testOnboardingViewer(t, store)

	code, err := store.CreateVerificationCode(ctx, viewer.User.ID, VerificationMethodEmail, VerificationPurposeSignup, nil, nil)
	if err != nil {
		t.Fatalf("CreateVerificationCode() error = %v", err)
	}
	wrong := "000000"
	if wrong == code {
		wrong = "000001"
	}
	if _, err := store.VerifyCode(ctx, viewer.User.ID, wrong); !errors.Is(err, ErrVerificationCodeInvalid) {
		t.Fatalf("VerifyCode(wrong) error = %v, want ErrVerificationCodeInvalid", err)
	}
}

func TestVerificationCodeExpired(t *testing.T) {
	store := testOnboardingStore(t)
	ctx := context.Background()
	viewer := testOnboardingViewer(t, store)

	code, err := store.CreateVerificationCode(ctx, viewer.User.ID, VerificationMethodEmail, VerificationPurposeSignup, nil, nil)
	if err != nil {
		t.Fatalf("CreateVerificationCode() error = %v", err)
	}
	if _, err := store.pool.Exec(ctx, `UPDATE verification_codes SET expires_at = now() - interval '1 minute' WHERE user_id = $1`, viewer.User.ID); err != nil {
		t.Fatalf("expire code: %v", err)
	}
	if _, err := store.VerifyCode(ctx, viewer.User.ID, code); !errors.Is(err, ErrVerificationCodeExpired) {
		t.Fatalf("VerifyCode(expired) error = %v, want ErrVerificationCodeExpired", err)
	}
}

func TestVerificationCodeAttemptLimit(t *testing.T) {
	store := testOnboardingStore(t)
	ctx := context.Background()
	viewer := testOnboardingViewer(t, store)

	code, err := store.CreateVerificationCode(ctx, viewer.User.ID, VerificationMethodEmail, VerificationPurposeSignup, nil, nil)
	if err != nil {
		t.Fatalf("CreateVerificationCode() error = %v", err)
	}
	wrong := "000000"
	if wrong == code {
		wrong = "000001"
	}
	for i := 0; i < VerificationCodeMaxAttempts-1; i++ {
		if _, err := store.VerifyCode(ctx, viewer.User.ID, wrong); !errors.Is(err, ErrVerificationCodeInvalid) {
			t.Fatalf("VerifyCode(wrong %d) error = %v, want ErrVerificationCodeInvalid", i+1, err)
		}
	}
	if _, err := store.VerifyCode(ctx, viewer.User.ID, wrong); !errors.Is(err, ErrVerificationCodeAttempts) {
		t.Fatalf("VerifyCode(5th wrong) error = %v, want ErrVerificationCodeAttempts", err)
	}
	// Burned codes stay burned even with the right code.
	if _, err := store.VerifyCode(ctx, viewer.User.ID, code); !errors.Is(err, ErrVerificationCodeInvalid) {
		t.Fatalf("VerifyCode(burned, correct) error = %v, want ErrVerificationCodeInvalid", err)
	}
}

func TestVerificationCodeRateLimit(t *testing.T) {
	store := testOnboardingStore(t)
	ctx := context.Background()
	viewer := testOnboardingViewer(t, store)

	if _, err := store.CreateVerificationCode(ctx, viewer.User.ID, VerificationMethodEmail, VerificationPurposeSignup, nil, nil); err != nil {
		t.Fatalf("CreateVerificationCode() error = %v", err)
	}
	if _, err := store.CreateVerificationCode(ctx, viewer.User.ID, VerificationMethodEmail, VerificationPurposeSignup, nil, nil); !errors.Is(err, ErrVerificationRateLimited) {
		t.Fatalf("CreateVerificationCode(immediate retry) error = %v, want ErrVerificationRateLimited", err)
	}
}

func TestVerificationCodeEmailChange(t *testing.T) {
	store := testOnboardingStore(t)
	ctx := context.Background()
	viewer := testOnboardingViewer(t, store)

	newEmail := "changed@example.com"
	code, err := store.CreateVerificationCode(ctx, viewer.User.ID, VerificationMethodEmail, VerificationPurposeEmailChange, &newEmail, nil)
	if err != nil {
		t.Fatalf("CreateVerificationCode() error = %v", err)
	}
	result, err := store.VerifyCode(ctx, viewer.User.ID, code)
	if err != nil {
		t.Fatalf("VerifyCode() error = %v", err)
	}
	if result.User.Email == nil || *result.User.Email != newEmail {
		t.Fatalf("VerifyCode() email = %v, want %q", result.User.Email, newEmail)
	}
}

func TestQuestionnaireUpsertRoundTrip(t *testing.T) {
	store := testOnboardingStore(t)
	ctx := context.Background()
	viewer := testOnboardingViewer(t, store)

	budget := "$100"
	topics := []string{"budgeting", "credit"}
	goal := "APPLY_BENEFITS"
	householdSize := "2-3 people"
	incomeBracket := "$30k-$60k"
	saved, err := store.SaveQuestionnaire(ctx, viewer.User.ID, QuestionnairePatch{
		WeeklyBudget:  &budget,
		FinanceTopics: topics,
		PrimaryGoal:   &goal,
		HouseholdSize: &householdSize,
		IncomeBracket: &incomeBracket,
	})
	if err != nil {
		t.Fatalf("SaveQuestionnaire() error = %v", err)
	}
	if saved.WeeklyBudget == nil || *saved.WeeklyBudget != budget {
		t.Fatalf("SaveQuestionnaire() weekly_budget = %v, want %q", saved.WeeklyBudget, budget)
	}
	if saved.HouseholdSize == nil || *saved.HouseholdSize != householdSize {
		t.Fatalf("SaveQuestionnaire() household_size = %v, want %q", saved.HouseholdSize, householdSize)
	}
	if saved.IncomeBracket == nil || *saved.IncomeBracket != incomeBracket {
		t.Fatalf("SaveQuestionnaire() income_bracket = %v, want %q", saved.IncomeBracket, incomeBracket)
	}
	if len(saved.FinanceTopics) != 2 || len(saved.Resources) != 0 {
		t.Fatalf("SaveQuestionnaire() topics/resources = %v/%v, want 2 topics and empty resources", saved.FinanceTopics, saved.Resources)
	}

	// Partial update leaves the other answers untouched.
	resources := []string{"food-banks"}
	saved, err = store.SaveQuestionnaire(ctx, viewer.User.ID, QuestionnairePatch{Resources: resources})
	if err != nil {
		t.Fatalf("SaveQuestionnaire(partial) error = %v", err)
	}
	if saved.WeeklyBudget == nil || *saved.WeeklyBudget != budget {
		t.Fatalf("SaveQuestionnaire(partial) lost weekly_budget = %v", saved.WeeklyBudget)
	}
	if saved.HouseholdSize == nil || *saved.HouseholdSize != householdSize {
		t.Fatalf("SaveQuestionnaire(partial) lost household_size = %v", saved.HouseholdSize)
	}
	if saved.IncomeBracket == nil || *saved.IncomeBracket != incomeBracket {
		t.Fatalf("SaveQuestionnaire(partial) lost income_bracket = %v", saved.IncomeBracket)
	}
	if len(saved.Resources) != 1 || saved.Resources[0] != "food-banks" {
		t.Fatalf("SaveQuestionnaire(partial) resources = %v, want [food-banks]", saved.Resources)
	}
	if saved.PrimaryGoal == nil || *saved.PrimaryGoal != goal {
		t.Fatalf("SaveQuestionnaire(partial) lost primary_goal = %v", saved.PrimaryGoal)
	}

	loaded, err := store.GetQuestionnaireAnswers(ctx, viewer.User.ID)
	if err != nil {
		t.Fatalf("GetQuestionnaireAnswers() error = %v", err)
	}
	if loaded.WeeklyBudget == nil || *loaded.WeeklyBudget != budget || len(loaded.FinanceTopics) != 2 {
		t.Fatalf("GetQuestionnaireAnswers() = %+v, want persisted answers", loaded)
	}
}

func TestQuestionnaireDefaultAnswers(t *testing.T) {
	store := testOnboardingStore(t)
	ctx := context.Background()
	viewer := testOnboardingViewer(t, store)

	loaded, err := store.GetQuestionnaireAnswers(ctx, viewer.User.ID)
	if err != nil {
		t.Fatalf("GetQuestionnaireAnswers() error = %v", err)
	}
	if loaded.WeeklyBudget != nil || loaded.PrimaryGoal != nil || loaded.HouseholdSize != nil || loaded.IncomeBracket != nil {
		t.Fatalf("GetQuestionnaireAnswers() fresh = %+v, want nil answers", loaded)
	}
	if loaded.FinanceTopics == nil || loaded.Resources == nil {
		t.Fatalf("GetQuestionnaireAnswers() fresh lists = %v/%v, want empty non-nil", loaded.FinanceTopics, loaded.Resources)
	}
}

func TestCommunicationConsentsPartialUpdate(t *testing.T) {
	store := testOnboardingStore(t)
	ctx := context.Background()
	viewer := testOnboardingViewer(t, store)

	emailConsent := true
	if err := store.UpdateCommunicationConsents(ctx, viewer.User.ID, &emailConsent, nil); err != nil {
		t.Fatalf("UpdateCommunicationConsents(email) error = %v", err)
	}
	updated, err := scanUser(store.pool.QueryRow(ctx, `SELECT id, auth_subject, email, created_at, updated_at,
		phone_number, account_verified_at, verification_method,
		email_consent, phone_call_consent, notification_permission_status,
		location_zip_fallback, onboarding_completed_at, onboarding_current_step
		FROM users WHERE id = $1`, viewer.User.ID))
	if err != nil {
		t.Fatalf("load user: %v", err)
	}
	if updated.EmailConsent == nil || !*updated.EmailConsent {
		t.Fatalf("email_consent = %v, want true", updated.EmailConsent)
	}
	if updated.PhoneCallConsent != nil {
		t.Fatalf("phone_call_consent = %v, want nil (untouched)", updated.PhoneCallConsent)
	}

	// No-op when both are nil.
	if err := store.UpdateCommunicationConsents(ctx, viewer.User.ID, nil, nil); err != nil {
		t.Fatalf("UpdateCommunicationConsents(nil, nil) error = %v", err)
	}
}

func TestSaveOnboardingStepAndLocationFallback(t *testing.T) {
	store := testOnboardingStore(t)
	ctx := context.Background()
	viewer := testOnboardingViewer(t, store)

	if err := store.SaveOnboardingStep(ctx, viewer.User.ID, "questionnaire:3"); err != nil {
		t.Fatalf("SaveOnboardingStep() error = %v", err)
	}
	if err := store.SaveLocationFallback(ctx, viewer.User.ID, "90210"); err != nil {
		t.Fatalf("SaveLocationFallback() error = %v", err)
	}
	refreshed, err := store.EnsureViewer(ctx, viewer.User.AuthSubject, viewer.User.Email)
	if err != nil {
		t.Fatalf("EnsureViewer() error = %v", err)
	}
	if refreshed.OnboardingState.CurrentStep == nil || *refreshed.OnboardingState.CurrentStep != "questionnaire:3" {
		t.Fatalf("onboarding current_step = %v, want questionnaire:3", refreshed.OnboardingState.CurrentStep)
	}
	if refreshed.User.LocationZipFallback == nil || *refreshed.User.LocationZipFallback != "90210" {
		t.Fatalf("location_zip_fallback = %v, want 90210", refreshed.User.LocationZipFallback)
	}
	if refreshed.User.NotificationPermissionStatus != "unset" {
		t.Fatalf("notification_permission_status = %q, want unset default", refreshed.User.NotificationPermissionStatus)
	}
}

func TestVerifyPhoneChangeAppliesNewPhone(t *testing.T) {
	store := testOnboardingStore(t)
	ctx := context.Background()
	viewer := testOnboardingViewer(t, store)

	// Verification is email-only: the phone-change code is emailed to the
	// account's email, and the new phone is applied on confirmation.
	newPhone := "+13105550142"
	code, err := store.CreateVerificationCode(ctx, viewer.User.ID, VerificationMethodEmail, VerificationPurposePhoneChange, nil, &newPhone)
	if err != nil {
		t.Fatalf("CreateVerificationCode() error = %v", err)
	}
	result, err := store.VerifyCode(ctx, viewer.User.ID, code)
	if err != nil {
		t.Fatalf("VerifyCode() error = %v", err)
	}
	if result.User.PhoneNumber == nil || *result.User.PhoneNumber != newPhone {
		t.Fatalf("VerifyCode() phone_number = %v, want %q", result.User.PhoneNumber, newPhone)
	}
	if result.User.VerificationMethod == nil || *result.User.VerificationMethod != VerificationMethodEmail {
		t.Fatalf("VerifyCode() verification_method = %v, want email", result.User.VerificationMethod)
	}
}

func TestSavePhoneNumberChangeClearsVerification(t *testing.T) {
	store := testOnboardingStore(t)
	ctx := context.Background()
	viewer := testOnboardingViewer(t, store)

	if err := store.SavePhoneNumber(ctx, viewer.User.ID, "+13105550001"); err != nil {
		t.Fatalf("SavePhoneNumber() error = %v", err)
	}
	code, err := store.CreateVerificationCode(ctx, viewer.User.ID, VerificationMethodEmail, VerificationPurposeSignup, nil, nil)
	if err != nil {
		t.Fatalf("CreateVerificationCode() error = %v", err)
	}
	if _, err := store.VerifyCode(ctx, viewer.User.ID, code); err != nil {
		t.Fatalf("VerifyCode() error = %v", err)
	}

	// Re-saving the unchanged number keeps the verified stamp.
	if err := store.SavePhoneNumber(ctx, viewer.User.ID, "+13105550001"); err != nil {
		t.Fatalf("SavePhoneNumber(same) error = %v", err)
	}
	refreshed, err := store.EnsureViewer(ctx, viewer.User.AuthSubject, viewer.User.Email)
	if err != nil {
		t.Fatalf("EnsureViewer() error = %v", err)
	}
	if refreshed.User.AccountVerifiedAt == nil {
		t.Fatal("SavePhoneNumber(same) cleared account_verified_at, want it kept")
	}

	// An actual phone change forces re-verification.
	if err := store.SavePhoneNumber(ctx, viewer.User.ID, "+13105550142"); err != nil {
		t.Fatalf("SavePhoneNumber(changed) error = %v", err)
	}
	refreshed, err = store.EnsureViewer(ctx, viewer.User.AuthSubject, viewer.User.Email)
	if err != nil {
		t.Fatalf("EnsureViewer() error = %v", err)
	}
	if refreshed.User.AccountVerifiedAt != nil {
		t.Fatal("SavePhoneNumber(changed) kept account_verified_at, want it cleared for re-verification")
	}
}

func TestEnsureViewerEmailChangeClearsVerification(t *testing.T) {
	store := testOnboardingStore(t)
	ctx := context.Background()
	subject := "onboarding-v2-email-change-" + time.Now().Format("150405.000000000")
	viewer, err := store.EnsureViewer(ctx, subject, stringPtr("before@example.com"))
	if err != nil {
		t.Fatalf("EnsureViewer() error = %v", err)
	}
	code, err := store.CreateVerificationCode(ctx, viewer.User.ID, VerificationMethodEmail, VerificationPurposeSignup, nil, nil)
	if err != nil {
		t.Fatalf("CreateVerificationCode() error = %v", err)
	}
	if _, err := store.VerifyCode(ctx, viewer.User.ID, code); err != nil {
		t.Fatalf("VerifyCode() error = %v", err)
	}

	// Same email on the next login keeps the verified stamp.
	refreshed, err := store.EnsureViewer(ctx, subject, stringPtr("before@example.com"))
	if err != nil {
		t.Fatalf("EnsureViewer(same email) error = %v", err)
	}
	if refreshed.User.AccountVerifiedAt == nil {
		t.Fatal("EnsureViewer(same email) cleared account_verified_at, want it kept")
	}

	// An email change (e.g. via better-auth changeEmail) forces re-verification.
	refreshed, err = store.EnsureViewer(ctx, subject, stringPtr("after@example.com"))
	if err != nil {
		t.Fatalf("EnsureViewer(new email) error = %v", err)
	}
	if refreshed.User.AccountVerifiedAt != nil {
		t.Fatal("EnsureViewer(new email) kept account_verified_at, want it cleared for re-verification")
	}
	if refreshed.User.Email == nil || *refreshed.User.Email != "after@example.com" {
		t.Fatalf("EnsureViewer(new email) email = %v, want after@example.com", refreshed.User.Email)
	}
}
