package users

import (
	"context"
	"errors"
	"regexp"
	"strings"
	"time"

	"github.com/helpthehive/server/internal/apperrors"
	"github.com/helpthehive/server/internal/auth"
	"github.com/helpthehive/server/internal/db"
)

const HandleRenameCooldown = 30 * 24 * time.Hour

var handlePattern = regexp.MustCompile(`^[a-z][a-z0-9_]{2,29}$`)

var reservedHandles = map[string]struct{}{
	"admin": {}, "api": {}, "auth": {}, "support": {}, "help": {}, "settings": {},
	"user": {}, "users": {}, "profile": {}, "profiles": {}, "share": {}, "helpthehive": {},
}

type HandleReason string

const (
	HandleAvailable     HandleReason = "AVAILABLE"
	HandleCurrent       HandleReason = "CURRENT"
	HandleInvalidFormat HandleReason = "INVALID_FORMAT"
	HandleReserved      HandleReason = "RESERVED"
	HandleUnavailable   HandleReason = "UNAVAILABLE"
	HandleCooldown      HandleReason = "COOLDOWN"
)

type HandleAvailability struct {
	Handle     string
	Available  bool
	Reason     HandleReason
	RetryAfter *time.Time
}

type HandleError struct {
	Reason     HandleReason
	Handle     string
	RetryAfter *time.Time
}

func (e *HandleError) Error() string {
	switch e.Reason {
	case HandleInvalidFormat:
		return "handle must start with a letter and contain 3 to 30 lowercase letters, numbers, or underscores"
	case HandleReserved:
		return "handle is reserved"
	case HandleUnavailable:
		return "handle is unavailable"
	case HandleCooldown:
		return "handle can only be changed once every 30 days"
	default:
		return "unable to update handle"
	}
}

type Service struct {
	store       *db.Store
	codeSenders map[string]CodeSender
}

func NewService(store *db.Store) *Service {
	return &Service{store: store, codeSenders: DefaultCodeSenders()}
}

// WithCodeSender overrides the sender used for the email verification
// channel. Tests use this to capture codes without sending them.
func (s *Service) WithCodeSender(method string, sender CodeSender) *Service {
	if s.codeSenders == nil {
		s.codeSenders = map[string]CodeSender{}
	}
	s.codeSenders[method] = sender
	return s
}

// Onboarding step keys the mobile client sends to saveOnboardingStep, in
// flow order. An interrupted onboarding resumes at the saved step.
const (
	StepQuestionnaire1      = "questionnaire:1"
	StepQuestionnaire2      = "questionnaire:2"
	StepQuestionnaire3      = "questionnaire:3"
	StepQuestionnaire4      = "questionnaire:4"
	StepQuestionnaire5      = "questionnaire:5"
	StepPermissionsPush     = "permissions:push"
	StepPermissionsLocation = "permissions:location"
	StepConsentEmail        = "consent:email"
	StepConsentPhone        = "consent:phone"
	StepAllSet              = "all-set"
)

// PrimaryGoal values accepted for the questionnaire's "what brings you here"
// step.
const (
	PrimaryGoalApplyBenefits = "APPLY_BENEFITS"
	PrimaryGoalBudgetMeals   = "BUDGET_MEALS"
)

func (s *Service) Viewer(ctx context.Context, identity auth.Identity) (db.Viewer, error) {
	if identity.Subject == "" {
		return db.Viewer{}, errors.New("auth subject is required")
	}
	return s.store.EnsureViewer(ctx, identity.Subject, optionalEmail(identity.Email))
}

func (s *Service) UpdateProfile(ctx context.Context, identity auth.Identity, patch db.ProfilePatch) (db.Profile, error) {
	trimProfilePatch(&patch)
	if err := validateProfilePatch(patch); err != nil {
		return db.Profile{}, err
	}
	viewer, err := s.Viewer(ctx, identity)
	if err != nil {
		return db.Profile{}, err
	}
	return s.store.UpdateProfile(ctx, viewer.User.ID, patch)
}

func (s *Service) DeleteViewer(ctx context.Context, identity auth.Identity) (bool, error) {
	viewer, err := s.Viewer(ctx, identity)
	if err != nil {
		return false, err
	}
	return s.store.DeleteUser(ctx, viewer.User.ID)
}

func (s *Service) UpdatePreferences(ctx context.Context, identity auth.Identity, patch db.PreferencesPatch, emailMarketingOptIn *bool) (db.Preferences, error) {
	viewer, err := s.Viewer(ctx, identity)
	if err != nil {
		return db.Preferences{}, err
	}
	trimPreferencesPatch(&patch)
	if err := validatePreferencesPatch(patch); err != nil {
		return db.Preferences{}, err
	}
	preferences, err := s.store.UpdatePreferences(ctx, viewer.User.ID, patch)
	if err != nil {
		return db.Preferences{}, err
	}
	if emailMarketingOptIn != nil {
		if _, err := s.store.UpdateEmailMarketingOptIn(ctx, viewer.User.ID, *emailMarketingOptIn); err != nil {
			return db.Preferences{}, err
		}
	}
	return preferences, nil
}

func (s *Service) HandleAvailability(ctx context.Context, identity auth.Identity, candidate string) (HandleAvailability, error) {
	handle, reason := normalizeAndValidateHandle(candidate)
	if reason != HandleAvailable {
		return HandleAvailability{Handle: handle, Reason: reason}, nil
	}
	viewer, err := s.Viewer(ctx, identity)
	if err != nil {
		return HandleAvailability{}, err
	}
	existing, err := s.store.FindHandle(ctx, handle)
	if err != nil {
		return HandleAvailability{}, err
	}
	if existing != nil {
		if existing.UserID == viewer.User.ID && existing.IsCurrent {
			return HandleAvailability{Handle: handle, Available: true, Reason: HandleCurrent}, nil
		}
		return HandleAvailability{Handle: handle, Reason: HandleUnavailable}, nil
	}
	current, err := s.store.CurrentHandle(ctx, viewer.User.ID)
	if err != nil {
		return HandleAvailability{}, err
	}
	if current != nil {
		retryAfter := current.CreatedAt.Add(HandleRenameCooldown)
		if time.Now().Before(retryAfter) {
			return HandleAvailability{Handle: handle, Reason: HandleCooldown, RetryAfter: &retryAfter}, nil
		}
	}
	return HandleAvailability{Handle: handle, Available: true, Reason: HandleAvailable}, nil
}

func (s *Service) UpdateHandle(ctx context.Context, identity auth.Identity, candidate string) (db.Profile, error) {
	handle, reason := normalizeAndValidateHandle(candidate)
	if reason != HandleAvailable {
		return db.Profile{}, &HandleError{Reason: reason, Handle: handle}
	}
	viewer, err := s.Viewer(ctx, identity)
	if err != nil {
		return db.Profile{}, err
	}
	profile, err := s.store.UpdateHandle(ctx, viewer.User.ID, handle, HandleRenameCooldown)
	if errors.Is(err, db.ErrHandleUnavailable) {
		return db.Profile{}, &HandleError{Reason: HandleUnavailable, Handle: handle}
	}
	var cooldown *db.HandleCooldownError
	if errors.As(err, &cooldown) {
		return db.Profile{}, &HandleError{Reason: HandleCooldown, Handle: handle, RetryAfter: &cooldown.RetryAfter}
	}
	return profile, err
}

func (s *Service) CompleteOnboarding(ctx context.Context, identity auth.Identity, profile db.ProfilePatch, preferences db.PreferencesPatch, hasProfile bool, hasPreferences bool, emailMarketingOptIn *bool) (db.Viewer, error) {
	viewer, err := s.Viewer(ctx, identity)
	if err != nil {
		return db.Viewer{}, err
	}
	if hasProfile {
		trimProfilePatch(&profile)
		if err := validateProfilePatch(profile); err != nil {
			return db.Viewer{}, err
		}
		if _, err := s.store.UpdateProfile(ctx, viewer.User.ID, profile); err != nil {
			return db.Viewer{}, err
		}
	}
	if hasPreferences {
		trimPreferencesPatch(&preferences)
		if err := validatePreferencesPatch(preferences); err != nil {
			return db.Viewer{}, err
		}
		if _, err := s.store.UpdatePreferences(ctx, viewer.User.ID, preferences); err != nil {
			return db.Viewer{}, err
		}
	}
	if emailMarketingOptIn != nil {
		if _, err := s.store.UpdateEmailMarketingOptIn(ctx, viewer.User.ID, *emailMarketingOptIn); err != nil {
			return db.Viewer{}, err
		}
	}
	if _, err := s.store.CompleteOnboarding(ctx, viewer.User.ID); err != nil {
		return db.Viewer{}, err
	}
	return s.Viewer(ctx, identity)
}

// RecordConsent stores the user's Terms of Service / Privacy Policy
// acceptance. The client must pass the document versions it displayed; the
// server stamps the acceptance timestamps.
func (s *Service) RecordConsent(ctx context.Context, identity auth.Identity, termsVersion, privacyVersion string, emailMarketingOptIn bool) (db.Consent, error) {
	viewer, err := s.Viewer(ctx, identity)
	if err != nil {
		return db.Consent{}, err
	}
	termsVersion = strings.TrimSpace(termsVersion)
	privacyVersion = strings.TrimSpace(privacyVersion)
	if termsVersion == "" {
		return db.Consent{}, apperrors.Public("terms version is required")
	}
	if privacyVersion == "" {
		return db.Consent{}, apperrors.Public("privacy policy version is required")
	}
	return s.store.RecordConsent(ctx, viewer.User.ID, termsVersion, privacyVersion, emailMarketingOptIn)
}

// Consent returns the user's recorded consent, or nil when they have not
// accepted yet.
func (s *Service) Consent(ctx context.Context, identity auth.Identity) (*db.Consent, error) {
	viewer, err := s.Viewer(ctx, identity)
	if err != nil {
		return nil, err
	}
	return viewer.Consent, nil
}

func (s *Service) RegisterPushToken(ctx context.Context, identity auth.Identity, token string, platform string, deviceID *string) (db.PushToken, error) {
	token = strings.TrimSpace(token)
	if token == "" {
		return db.PushToken{}, apperrors.Public("push token is required")
	}
	if deviceID != nil {
		trimmed := strings.TrimSpace(*deviceID)
		deviceID = &trimmed
	}
	viewer, err := s.Viewer(ctx, identity)
	if err != nil {
		return db.PushToken{}, err
	}
	return s.store.UpsertPushToken(ctx, viewer.User.ID, token, platform, deviceID)
}

func (s *Service) DeletePushToken(ctx context.Context, identity auth.Identity, token string) (bool, error) {
	token = strings.TrimSpace(token)
	if token == "" {
		return false, apperrors.Public("push token is required")
	}
	viewer, err := s.Viewer(ctx, identity)
	if err != nil {
		return false, err
	}
	return s.store.DeletePushToken(ctx, viewer.User.ID, token)
}

// RequestVerificationCode creates a 6-digit code and delivers it by email —
// verification is email-only (text was removed as a channel in September
// 2026). For EMAIL_CHANGE the code goes to the new address; for
// SIGNUP/RECOVERY/PHONE_CHANGE it goes to the account's email. Verify once
// at signup; re-verify only on account recovery, email change, or
// phone-number change. Never re-verified on normal login.
func (s *Service) RequestVerificationCode(ctx context.Context, identity auth.Identity, method, purpose string, newEmail, newPhone *string) error {
	viewer, err := s.Viewer(ctx, identity)
	if err != nil {
		return err
	}

	method = strings.ToLower(strings.TrimSpace(method))
	if method != db.VerificationMethodEmail {
		return apperrors.Public("verification is by email")
	}
	purpose = strings.ToLower(strings.TrimSpace(purpose))
	switch purpose {
	case db.VerificationPurposeSignup, db.VerificationPurposeRecovery,
		db.VerificationPurposeEmailChange, db.VerificationPurposePhoneChange:
	default:
		return apperrors.Public("unknown verification purpose")
	}

	destination, err := verificationDestination(viewer, method, purpose, newEmail, newPhone)
	if err != nil {
		return err
	}

	code, err := s.store.CreateVerificationCode(ctx, viewer.User.ID, method, purpose, newEmail, newPhone)
	if err != nil {
		if errors.Is(err, db.ErrVerificationRateLimited) {
			return apperrors.Public("a code was just sent — please wait a minute before requesting another")
		}
		return err
	}

	sender := s.codeSenders[method]
	if sender == nil {
		return apperrors.Public("that verification method is not available")
	}
	if err := sender.SendCode(ctx, destination, code); err != nil {
		// The code never reached the user: delete it so the 60s rate limit
		// does not block an immediate retry.
		_ = s.store.DeleteVerificationCodesForUser(ctx, viewer.User.ID)
		return err
	}
	return nil
}

// verificationDestination resolves where the code goes. The email-change
// purpose uses the new address; everything else uses the account's email.
// The method argument is validated in RequestVerificationCode (email-only)
// and kept here for the call signature.
func verificationDestination(viewer db.Viewer, method, purpose string, newEmail, newPhone *string) (string, error) {
	_ = method
	if purpose == db.VerificationPurposeEmailChange {
		email := strings.TrimSpace(derefString(newEmail))
		if email == "" {
			return "", apperrors.Public("the new email address is required")
		}
		return email, nil
	}
	email := derefString(viewer.User.Email)
	if strings.TrimSpace(email) == "" {
		return "", apperrors.Public("add an email address before verifying by email")
	}
	return strings.TrimSpace(email), nil
}

// VerifyCode checks the code and marks the account verified on success. It
// never re-verifies on normal login — only signup, recovery and
// email/phone changes route here.
func (s *Service) VerifyCode(ctx context.Context, identity auth.Identity, code string) error {
	viewer, err := s.Viewer(ctx, identity)
	if err != nil {
		return err
	}
	code = strings.TrimSpace(code)
	if code == "" {
		return apperrors.Public("verification code is required")
	}
	if _, err := s.store.VerifyCode(ctx, viewer.User.ID, code); err != nil {
		switch {
		case errors.Is(err, db.ErrVerificationCodeExpired):
			return apperrors.Public("that code has expired — request a new one")
		case errors.Is(err, db.ErrVerificationCodeAttempts):
			return apperrors.Public("too many wrong attempts — request a new code")
		case errors.Is(err, db.ErrVerificationCodeInvalid):
			return apperrors.Public("that code is not correct — please try again")
		}
		return err
	}
	return nil
}

// SaveQuestionnaire persists the onboarding questionnaire answers. Writes
// are partial: only the fields the client sends are touched.
func (s *Service) SaveQuestionnaire(ctx context.Context, identity auth.Identity, patch db.QuestionnairePatch) (db.QuestionnaireAnswers, error) {
	viewer, err := s.Viewer(ctx, identity)
	if err != nil {
		return db.QuestionnaireAnswers{}, err
	}
	trimQuestionnairePatch(&patch)
	if patch.PrimaryGoal != nil {
		switch *patch.PrimaryGoal {
		case PrimaryGoalApplyBenefits, PrimaryGoalBudgetMeals:
		default:
			return db.QuestionnaireAnswers{}, apperrors.Public("primary goal must be APPLY_BENEFITS or BUDGET_MEALS")
		}
	}
	return s.store.SaveQuestionnaire(ctx, viewer.User.ID, patch)
}

// QuestionnaireAnswers returns the viewer's saved questionnaire answers (or
// empty answers when they have not answered yet).
func (s *Service) QuestionnaireAnswers(ctx context.Context, identity auth.Identity) (db.QuestionnaireAnswers, error) {
	viewer, err := s.Viewer(ctx, identity)
	if err != nil {
		return db.QuestionnaireAnswers{}, err
	}
	return s.store.GetQuestionnaireAnswers(ctx, viewer.User.ID)
}

// VerificationStatus reports whether the viewer has completed one-time
// verification, and how.
func (s *Service) VerificationStatus(ctx context.Context, identity auth.Identity) (db.VerificationStatus, error) {
	viewer, err := s.Viewer(ctx, identity)
	if err != nil {
		return db.VerificationStatus{}, err
	}
	return db.VerificationStatus{
		Verified:   viewer.User.AccountVerifiedAt != nil,
		VerifiedAt: viewer.User.AccountVerifiedAt,
		Method:     viewer.User.VerificationMethod,
	}, nil
}

// SaveOnboardingStep records the onboarding step the user reached so an
// interrupted onboarding can resume there.
func (s *Service) SaveOnboardingStep(ctx context.Context, identity auth.Identity, step string) error {
	viewer, err := s.Viewer(ctx, identity)
	if err != nil {
		return err
	}
	step = strings.TrimSpace(step)
	if step == "" {
		return apperrors.Public("onboarding step is required")
	}
	if len(step) > 64 {
		return apperrors.Public("onboarding step is too long")
	}
	return s.store.SaveOnboardingStep(ctx, viewer.User.ID, step)
}

// UpdateCommunicationConsents saves the email/phone-call communication
// consents. Only non-nil values are written; nil leaves the column untouched.
func (s *Service) UpdateCommunicationConsents(ctx context.Context, identity auth.Identity, emailConsent, phoneCallConsent *bool) error {
	viewer, err := s.Viewer(ctx, identity)
	if err != nil {
		return err
	}
	return s.store.UpdateCommunicationConsents(ctx, viewer.User.ID, emailConsent, phoneCallConsent)
}

// SaveLocationFallback stores the ZIP the user typed after declining the
// location permission prompt.
func (s *Service) SaveLocationFallback(ctx context.Context, identity auth.Identity, zip string) error {
	viewer, err := s.Viewer(ctx, identity)
	if err != nil {
		return err
	}
	zip = strings.TrimSpace(zip)
	if zip == "" {
		return apperrors.Public("zip code is required")
	}
	if len(zip) > 16 {
		return apperrors.Public("zip code is too long")
	}
	return s.store.SaveLocationFallback(ctx, viewer.User.ID, zip)
}

// SavePhoneNumber stores the account phone number. The signup form collects
// it; changing it later goes through a phone_change verification flow, and
// the store clears the verified stamp so the user re-verifies.
func (s *Service) SavePhoneNumber(ctx context.Context, identity auth.Identity, phoneNumber string) error {
	viewer, err := s.Viewer(ctx, identity)
	if err != nil {
		return err
	}
	phoneNumber = strings.TrimSpace(phoneNumber)
	if phoneNumber == "" {
		return apperrors.Public("phone number is required")
	}
	return s.store.SavePhoneNumber(ctx, viewer.User.ID, phoneNumber)
}

func derefString(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}

func trimQuestionnairePatch(patch *db.QuestionnairePatch) {
	trimStringPtr(&patch.WeeklyBudget)
	trimStringPtr(&patch.PrimaryGoal)
	trimStringPtr(&patch.HouseholdSize)
	trimStringPtr(&patch.IncomeBracket)
	trimStringSlice(patch.FinanceTopics)
	trimStringSlice(patch.Resources)
	patch.FinanceTopics = dropEmptyStrings(patch.FinanceTopics)
	patch.Resources = dropEmptyStrings(patch.Resources)
}

func dropEmptyStrings(values []string) []string {
	if values == nil {
		return nil
	}
	kept := values[:0]
	for _, value := range values {
		if value != "" {
			kept = append(kept, value)
		}
	}
	return kept
}

func optionalEmail(email string) *string {
	trimmed := strings.TrimSpace(email)
	if trimmed == "" {
		return nil
	}
	return &trimmed
}

func normalizeAndValidateHandle(candidate string) (string, HandleReason) {
	handle := strings.ToLower(strings.TrimSpace(candidate))
	if !handlePattern.MatchString(handle) {
		return handle, HandleInvalidFormat
	}
	if _, reserved := reservedHandles[handle]; reserved {
		return handle, HandleReserved
	}
	return handle, HandleAvailable
}

func trimProfilePatch(patch *db.ProfilePatch) {
	trimStringPtr(&patch.FirstName)
	trimStringPtr(&patch.LastName)
	trimStringPtr(&patch.Phone)
	trimStringPtr(&patch.Zip)
	trimStringPtr(&patch.ProfileImageURI)
}

func validateProfilePatch(patch db.ProfilePatch) error {
	if patch.FirstName != nil && *patch.FirstName == "" {
		return apperrors.Public("first name is required")
	}
	if patch.LastName != nil && *patch.LastName == "" {
		return apperrors.Public("last name is required")
	}
	if patch.HouseholdSize != nil && *patch.HouseholdSize <= 0 {
		return apperrors.Public("household size must be greater than zero")
	}
	return nil
}

func trimPreferencesPatch(patch *db.PreferencesPatch) {
	trimStringPtr(&patch.WeeklyBudget)
	trimStringSlice(patch.PreferredFinanceTopics)
	trimStringSlice(patch.PreferredResources)
	trimStringSlice(patch.SelectedBenefitPrograms)
	trimStringPtr(&patch.LocationPermissionStatus)
}

func validatePreferencesPatch(patch db.PreferencesPatch) error {
	if patch.LocationPermissionStatus != nil {
		switch *patch.LocationPermissionStatus {
		case db.LocationPermissionUnset, db.LocationPermissionGranted, db.LocationPermissionDenied:
		default:
			return apperrors.Public("location permission status must be unset, granted, or denied")
		}
	}
	return nil
}

func trimStringPtr(value **string) {
	if *value == nil {
		return
	}
	trimmed := strings.TrimSpace(**value)
	*value = &trimmed
}

func trimStringSlice(values []string) {
	for index := range values {
		values[index] = strings.TrimSpace(values[index])
	}
}
