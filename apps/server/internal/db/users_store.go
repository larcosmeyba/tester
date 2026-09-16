package db

// Users, profiles, handles, preferences and onboarding state — everything that
// describes the account itself.

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"database/sql"
	"encoding/hex"
	"errors"
	"fmt"
	"math/big"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

type User struct {
	ID          string
	AuthSubject string
	Email       *string
	CreatedAt   time.Time
	UpdatedAt   time.Time
	// Onboarding v2 fields.
	PhoneNumber                  *string
	AccountVerifiedAt            *time.Time
	VerificationMethod           *string
	EmailConsent                 *bool
	PhoneCallConsent             *bool
	NotificationPermissionStatus string
	LocationZipFallback          *string
	OnboardingCompletedAt        *time.Time
	OnboardingCurrentStep        *string
}

type Profile struct {
	UserID          string
	Handle          *string
	FirstName       string
	LastName        string
	Phone           string
	Zip             string
	HouseholdSize   int
	ProfileImageURI *string
	CreatedAt       time.Time
	UpdatedAt       time.Time
}

type Preferences struct {
	UserID                               string
	WeeklyBudget                         string
	PreferredFinanceTopics               []string
	PreferredResources                   []string
	WantsGovAssistance                   bool
	LastMealPlanDate                     *time.Time
	NotificationsEnabled                 bool
	ExpiringPantryNotificationsEnabled   bool
	WeeklyMealPlanNotificationsEnabled   bool
	ResourceReminderNotificationsEnabled bool
	// Benefits renewal alerts. Enabled by default; discreet lock-screen text
	// (no program names) is also the default.
	BenefitsRenewalNotificationsEnabled bool
	BenefitsRenewalDiscreetLockScreen   bool
	// Questionnaire answers. SelectedBenefitPrograms holds program keys like
	// SNAP/WIC/Medicaid chosen during onboarding. LocationPermissionStatus is
	// one of "unset", "granted" or "denied" (enforced by a CHECK constraint).
	SelectedBenefitPrograms  []string
	LocationPermissionStatus string
	CreatedAt                time.Time
	UpdatedAt                time.Time
}

// LocationPermissionStatus values accepted by the preferences table.
const (
	LocationPermissionUnset   = "unset"
	LocationPermissionGranted = "granted"
	LocationPermissionDenied  = "denied"
)

// Consent records a user's acceptance of the Terms of Service and Privacy
// Policy plus their email-marketing preference. The server stamps all
// timestamps; clients never supply them.
type Consent struct {
	UserID                  string
	TermsVersion            string
	TermsAcceptedAt         time.Time
	PrivacyVersion          string
	PrivacyAcceptedAt       time.Time
	EmailMarketingOptIn     bool
	EmailMarketingUpdatedAt time.Time
}

type OnboardingState struct {
	UserID                 string
	HasCompletedOnboarding bool
	CompletedAt            *time.Time
	// CurrentStep tracks where an interrupted onboarding should resume
	// (e.g. "questionnaire:3", "permissions:push", "all-set"). Sources from
	// users.onboarding_current_step; nil when onboarding was never started.
	CurrentStep *string
	CreatedAt   time.Time
	UpdatedAt   time.Time
}

type Viewer struct {
	User            User
	Profile         Profile
	Preferences     Preferences
	OnboardingState OnboardingState
	// Consent is nil until the user accepts the Terms/Privacy Policy.
	Consent *Consent
}

type ProfilePatch struct {
	FirstName       *string
	LastName        *string
	Phone           *string
	Zip             *string
	HouseholdSize   *int
	ProfileImageURI *string
}

type ProfileHandle struct {
	Handle    string
	UserID    string
	IsCurrent bool
	CreatedAt time.Time
	RetiredAt *time.Time
}

var ErrHandleUnavailable = errors.New("handle is unavailable")

type HandleCooldownError struct {
	RetryAfter time.Time
}

func (e *HandleCooldownError) Error() string { return "handle rename cooldown is active" }

type PreferencesPatch struct {
	WeeklyBudget                         *string
	PreferredFinanceTopics               []string
	PreferredResources                   []string
	WantsGovAssistance                   *bool
	LastMealPlanDate                     *time.Time
	NotificationsEnabled                 *bool
	ExpiringPantryNotificationsEnabled   *bool
	WeeklyMealPlanNotificationsEnabled   *bool
	ResourceReminderNotificationsEnabled *bool
	BenefitsRenewalNotificationsEnabled  *bool
	BenefitsRenewalDiscreetLockScreen    *bool
	SelectedBenefitPrograms              []string
	LocationPermissionStatus             *string
}

func (s *Store) UpsertUserByAuthSubject(ctx context.Context, authSubject string, email *string) (User, error) {
	row := s.pool.QueryRow(ctx, `
		INSERT INTO users (id, auth_subject, email)
		VALUES ($1, $2, $3)
		ON CONFLICT (auth_subject) DO UPDATE
		SET email = COALESCE(EXCLUDED.email, users.email),
		    -- An email change coming from the identity provider forces
		    -- re-verification; verification is email-only and happens once
		    -- at signup otherwise.
		    account_verified_at = CASE
		        WHEN COALESCE(EXCLUDED.email, users.email) IS DISTINCT FROM users.email
		        THEN NULL
		        ELSE users.account_verified_at
		    END,
		    updated_at = now()
		RETURNING id, auth_subject, email, created_at, updated_at,
		          phone_number, account_verified_at, verification_method,
		          email_consent, phone_call_consent, notification_permission_status,
		          location_zip_fallback, onboarding_completed_at, onboarding_current_step
	`, NewID(), authSubject, email)
	return scanUser(row)
}

func (s *Store) DeleteUser(ctx context.Context, userID string) (bool, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return false, err
	}
	defer rollback(ctx, tx)
	if _, err := tx.Exec(ctx, `DELETE FROM profile_handles WHERE user_id = $1`, userID); err != nil {
		return false, err
	}
	tag, err := tx.Exec(ctx, `DELETE FROM users WHERE id = $1`, userID)
	if err != nil {
		return false, err
	}
	if err := tx.Commit(ctx); err != nil {
		return false, err
	}
	return tag.RowsAffected() > 0, nil
}

func (s *Store) EnsureViewer(ctx context.Context, authSubject string, email *string) (Viewer, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return Viewer{}, err
	}
	defer rollback(ctx, tx)

	user, err := scanUser(tx.QueryRow(ctx, `
		INSERT INTO users (id, auth_subject, email)
		VALUES ($1, $2, $3)
		ON CONFLICT (auth_subject) DO UPDATE
		SET email = COALESCE(EXCLUDED.email, users.email),
		    -- An email change coming from the identity provider forces
		    -- re-verification; verification is email-only and happens once
		    -- at signup otherwise.
		    account_verified_at = CASE
		        WHEN COALESCE(EXCLUDED.email, users.email) IS DISTINCT FROM users.email
		        THEN NULL
		        ELSE users.account_verified_at
		    END,
		    updated_at = now()
		RETURNING id, auth_subject, email, created_at, updated_at,
		          phone_number, account_verified_at, verification_method,
		          email_consent, phone_call_consent, notification_permission_status,
		          location_zip_fallback, onboarding_completed_at, onboarding_current_step
	`, NewID(), authSubject, email))
	if err != nil {
		return Viewer{}, err
	}

	profile, err := scanProfile(tx.QueryRow(ctx, `
		INSERT INTO profiles (user_id)
		VALUES ($1)
		ON CONFLICT (user_id) DO UPDATE SET user_id = EXCLUDED.user_id
		RETURNING user_id, first_name, last_name, phone, zip, household_size, profile_image_uri, created_at, updated_at
	`, user.ID))
	if err != nil {
		return Viewer{}, err
	}
	if err := loadCurrentHandle(ctx, tx, &profile); err != nil {
		return Viewer{}, err
	}

	preferences, err := scanPreferences(tx.QueryRow(ctx, `
		INSERT INTO preferences (user_id)
		VALUES ($1)
		ON CONFLICT (user_id) DO UPDATE SET user_id = EXCLUDED.user_id
		RETURNING user_id, weekly_budget, preferred_finance_topics, preferred_resources, wants_gov_assistance, last_meal_plan_date,
		          notifications_enabled, expiring_pantry_notifications_enabled, weekly_meal_plan_notifications_enabled,
		          resource_reminder_notifications_enabled,
		          benefits_renewal_notifications_enabled, benefits_renewal_discreet_lockscreen,
		          selected_benefit_programs, location_permission_status,
		          created_at, updated_at
	`, user.ID))
	if err != nil {
		return Viewer{}, err
	}

	consent, err := scanOptionalConsent(tx.QueryRow(ctx, `
		SELECT user_id, terms_version, terms_accepted_at, privacy_version, privacy_accepted_at,
		       email_marketing_opt_in, email_marketing_updated_at
		FROM consents
		WHERE user_id = $1
	`, user.ID))
	if err != nil {
		return Viewer{}, err
	}

	onboarding, err := scanOnboardingState(tx.QueryRow(ctx, `
		INSERT INTO onboarding_state (user_id)
		VALUES ($1)
		ON CONFLICT (user_id) DO UPDATE SET user_id = EXCLUDED.user_id
		RETURNING user_id, has_completed_onboarding, completed_at, created_at, updated_at
	`, user.ID))
	if err != nil {
		return Viewer{}, err
	}
	// Progress fields live on the users row: when the user completed
	// onboarding (mirror of onboarding_state.completed_at) and the step an
	// interrupted onboarding should resume at.
	var usersCompletedAt sql.NullTime
	var currentStep sql.NullString
	if err := tx.QueryRow(ctx, `
		SELECT onboarding_completed_at, onboarding_current_step
		FROM users
		WHERE id = $1
	`, user.ID).Scan(&usersCompletedAt, &currentStep); err != nil {
		return Viewer{}, err
	}
	onboarding.CurrentStep = nullStringPtr(currentStep)
	if usersCompletedAt.Valid {
		completedAt := usersCompletedAt.Time
		onboarding.CompletedAt = &completedAt
	}

	if err := tx.Commit(ctx); err != nil {
		return Viewer{}, err
	}

	return Viewer{
		User:            user,
		Profile:         profile,
		Preferences:     preferences,
		OnboardingState: onboarding,
		Consent:         consent,
	}, nil
}

func (s *Store) UpdateProfile(ctx context.Context, userID string, patch ProfilePatch) (Profile, error) {
	row := s.pool.QueryRow(ctx, `
		UPDATE profiles
		SET first_name = COALESCE($2, first_name),
		    last_name = COALESCE($3, last_name),
		    phone = COALESCE($4, phone),
		    zip = COALESCE($5, zip),
		    household_size = COALESCE($6, household_size),
		    profile_image_uri = COALESCE($7, profile_image_uri),
		    updated_at = now()
		WHERE user_id = $1
		RETURNING user_id, first_name, last_name, phone, zip, household_size, profile_image_uri, created_at, updated_at
	`, userID, patch.FirstName, patch.LastName, patch.Phone, patch.Zip, patch.HouseholdSize, patch.ProfileImageURI)
	profile, err := scanProfile(row)
	if err != nil {
		return Profile{}, err
	}
	if err := loadCurrentHandle(ctx, s.pool, &profile); err != nil {
		return Profile{}, err
	}
	return profile, nil
}

func (s *Store) CurrentHandle(ctx context.Context, userID string) (*ProfileHandle, error) {
	return scanOptionalHandle(s.pool.QueryRow(ctx, `
		SELECT handle, user_id, is_current, created_at, retired_at
		FROM profile_handles
		WHERE user_id = $1 AND is_current
	`, userID))
}

func (s *Store) FindHandle(ctx context.Context, handle string) (*ProfileHandle, error) {
	return scanOptionalHandle(s.pool.QueryRow(ctx, `
		SELECT handle, user_id, is_current, created_at, retired_at
		FROM profile_handles
		WHERE handle = $1
	`, handle))
}

func (s *Store) UpdateHandle(ctx context.Context, userID string, handle string, cooldown time.Duration) (Profile, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return Profile{}, err
	}
	defer rollback(ctx, tx)

	if _, err := tx.Exec(ctx, `SELECT pg_advisory_xact_lock(hashtext($1))`, userID); err != nil {
		return Profile{}, err
	}

	current, err := scanOptionalHandle(tx.QueryRow(ctx, `
		SELECT handle, user_id, is_current, created_at, retired_at
		FROM profile_handles
		WHERE user_id = $1 AND is_current
		FOR UPDATE
	`, userID))
	if err != nil {
		return Profile{}, err
	}
	if current != nil && current.Handle == handle {
		if err := tx.Commit(ctx); err != nil {
			return Profile{}, err
		}
		return s.ProfileByUserID(ctx, userID)
	}
	if current != nil {
		retryAfter := current.CreatedAt.Add(cooldown)
		if s.now().Before(retryAfter) {
			return Profile{}, &HandleCooldownError{RetryAfter: retryAfter}
		}
		if _, err := tx.Exec(ctx, `
			UPDATE profile_handles
			SET is_current = false, retired_at = $2
			WHERE handle = $1
		`, current.Handle, s.now()); err != nil {
			return Profile{}, err
		}
	}

	if _, err := tx.Exec(ctx, `
		INSERT INTO profile_handles (handle, user_id)
		VALUES ($1, $2)
	`, handle, userID); err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			return Profile{}, ErrHandleUnavailable
		}
		return Profile{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return Profile{}, err
	}
	return s.ProfileByUserID(ctx, userID)
}

func (s *Store) ProfileByUserID(ctx context.Context, userID string) (Profile, error) {
	profile, err := scanProfile(s.pool.QueryRow(ctx, `
		SELECT user_id, first_name, last_name, phone, zip, household_size, profile_image_uri, created_at, updated_at
		FROM profiles
		WHERE user_id = $1
	`, userID))
	if err != nil {
		return Profile{}, err
	}
	if err := loadCurrentHandle(ctx, s.pool, &profile); err != nil {
		return Profile{}, err
	}
	return profile, nil
}

func (s *Store) UpdatePreferences(ctx context.Context, userID string, patch PreferencesPatch) (Preferences, error) {
	row := s.pool.QueryRow(ctx, `
		UPDATE preferences
		SET weekly_budget = COALESCE($2, weekly_budget),
		    preferred_finance_topics = COALESCE($3::text[], preferred_finance_topics),
		    preferred_resources = COALESCE($4::text[], preferred_resources),
		    wants_gov_assistance = COALESCE($5, wants_gov_assistance),
		    last_meal_plan_date = COALESCE($6::date, last_meal_plan_date),
		    notifications_enabled = COALESCE($7, notifications_enabled),
		    expiring_pantry_notifications_enabled = COALESCE($8, expiring_pantry_notifications_enabled),
		    weekly_meal_plan_notifications_enabled = COALESCE($9, weekly_meal_plan_notifications_enabled),
		    resource_reminder_notifications_enabled = COALESCE($10, resource_reminder_notifications_enabled),
		    benefits_renewal_notifications_enabled = COALESCE($11, benefits_renewal_notifications_enabled),
		    benefits_renewal_discreet_lockscreen = COALESCE($12, benefits_renewal_discreet_lockscreen),
		    selected_benefit_programs = COALESCE($13::text[], selected_benefit_programs),
		    location_permission_status = COALESCE($14, location_permission_status),
		    updated_at = now()
		WHERE user_id = $1
		RETURNING user_id, weekly_budget, preferred_finance_topics, preferred_resources, wants_gov_assistance, last_meal_plan_date,
		          notifications_enabled, expiring_pantry_notifications_enabled, weekly_meal_plan_notifications_enabled,
		          resource_reminder_notifications_enabled,
		          benefits_renewal_notifications_enabled, benefits_renewal_discreet_lockscreen,
		          selected_benefit_programs, location_permission_status,
		          created_at, updated_at
	`, userID, patch.WeeklyBudget, nullableStringSlice(patch.PreferredFinanceTopics), nullableStringSlice(patch.PreferredResources), patch.WantsGovAssistance, patch.LastMealPlanDate, patch.NotificationsEnabled, patch.ExpiringPantryNotificationsEnabled, patch.WeeklyMealPlanNotificationsEnabled, patch.ResourceReminderNotificationsEnabled, patch.BenefitsRenewalNotificationsEnabled, patch.BenefitsRenewalDiscreetLockScreen, nullableStringSlice(patch.SelectedBenefitPrograms), patch.LocationPermissionStatus)
	return scanPreferences(row)
}

// Preferences returns one user's preferences, for callers that already know
// the user id (the renewal sweep) rather than resolving a viewer from a token.
func (s *Store) Preferences(ctx context.Context, userID string) (Preferences, error) {
	row := s.pool.QueryRow(ctx, `
		SELECT user_id, weekly_budget, preferred_finance_topics, preferred_resources, wants_gov_assistance, last_meal_plan_date,
		       notifications_enabled, expiring_pantry_notifications_enabled, weekly_meal_plan_notifications_enabled,
		       resource_reminder_notifications_enabled,
		       benefits_renewal_notifications_enabled, benefits_renewal_discreet_lockscreen,
		       selected_benefit_programs, location_permission_status,
		       created_at, updated_at
		FROM preferences
		WHERE user_id = $1
	`, userID)
	return scanPreferences(row)
}

func (s *Store) CompleteOnboarding(ctx context.Context, userID string) (OnboardingState, error) {
	row := s.pool.QueryRow(ctx, `
		UPDATE onboarding_state
		SET has_completed_onboarding = true,
		    completed_at = now(),
		    updated_at = now()
		WHERE user_id = $1
		RETURNING user_id, has_completed_onboarding, completed_at, created_at, updated_at
	`, userID)
	onboarding, err := scanOnboardingState(row)
	if err != nil {
		return OnboardingState{}, err
	}
	// Mirror completion onto the users row so the v2 progress columns stay in
	// sync; onboarding_state.has_completed_onboarding remains the authority.
	var currentStep sql.NullString
	if err := s.pool.QueryRow(ctx, `
		UPDATE users
		SET onboarding_completed_at = COALESCE(onboarding_completed_at, now()),
		    updated_at = now()
		WHERE id = $1
		RETURNING onboarding_current_step
	`, userID).Scan(&currentStep); err != nil {
		return OnboardingState{}, err
	}
	onboarding.CurrentStep = nullStringPtr(currentStep)
	return onboarding, nil
}

// RecordConsent upserts the user's Terms/Privacy acceptance. The server
// stamps terms_accepted_at, privacy_accepted_at and email_marketing_updated_at
// from now(); callers supply only the versions they showed the user and the
// marketing preference. Re-accepting overwrites the previous record.
func (s *Store) RecordConsent(ctx context.Context, userID, termsVersion, privacyVersion string, emailMarketingOptIn bool) (Consent, error) {
	row := s.pool.QueryRow(ctx, `
		INSERT INTO consents (user_id, terms_version, terms_accepted_at, privacy_version, privacy_accepted_at,
		                      email_marketing_opt_in, email_marketing_updated_at)
		VALUES ($1, $2, now(), $3, now(), $4, now())
		ON CONFLICT (user_id) DO UPDATE SET
		    terms_version = EXCLUDED.terms_version,
		    terms_accepted_at = EXCLUDED.terms_accepted_at,
		    privacy_version = EXCLUDED.privacy_version,
		    privacy_accepted_at = EXCLUDED.privacy_accepted_at,
		    email_marketing_opt_in = EXCLUDED.email_marketing_opt_in,
		    email_marketing_updated_at = EXCLUDED.email_marketing_updated_at
		RETURNING user_id, terms_version, terms_accepted_at, privacy_version, privacy_accepted_at,
		          email_marketing_opt_in, email_marketing_updated_at
	`, userID, termsVersion, privacyVersion, emailMarketingOptIn)
	return scanConsent(row)
}

// GetConsent returns the user's consent record, or nil when they have not
// accepted yet.
func (s *Store) GetConsent(ctx context.Context, userID string) (*Consent, error) {
	return scanOptionalConsent(s.pool.QueryRow(ctx, `
		SELECT user_id, terms_version, terms_accepted_at, privacy_version, privacy_accepted_at,
		       email_marketing_opt_in, email_marketing_updated_at
		FROM consents
		WHERE user_id = $1
	`, userID))
}

// UpdateEmailMarketingOptIn flips the marketing preference on an existing
// consent record. It reports whether a row was updated; when the user has
// never recorded consent there is nothing to update and no row is created,
// so consent can never be fabricated by this path.
func (s *Store) UpdateEmailMarketingOptIn(ctx context.Context, userID string, optIn bool) (bool, error) {
	tag, err := s.pool.Exec(ctx, `
		UPDATE consents
		SET email_marketing_opt_in = $2,
		    email_marketing_updated_at = now()
		WHERE user_id = $1
	`, userID, optIn)
	if err != nil {
		return false, err
	}
	return tag.RowsAffected() > 0, nil
}

func scanConsent(row scanner) (Consent, error) {
	var consent Consent
	if err := row.Scan(
		&consent.UserID,
		&consent.TermsVersion,
		&consent.TermsAcceptedAt,
		&consent.PrivacyVersion,
		&consent.PrivacyAcceptedAt,
		&consent.EmailMarketingOptIn,
		&consent.EmailMarketingUpdatedAt,
	); err != nil {
		return Consent{}, err
	}
	return consent, nil
}

func scanOptionalConsent(row scanner) (*Consent, error) {
	consent, err := scanConsent(row)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	return &consent, nil
}

func scanUser(row scanner) (User, error) {
	var user User
	var email sql.NullString
	var phoneNumber sql.NullString
	var accountVerifiedAt sql.NullTime
	var verificationMethod sql.NullString
	var emailConsent sql.NullBool
	var phoneCallConsent sql.NullBool
	var locationZipFallback sql.NullString
	var onboardingCompletedAt sql.NullTime
	var onboardingCurrentStep sql.NullString
	if err := row.Scan(
		&user.ID, &user.AuthSubject, &email, &user.CreatedAt, &user.UpdatedAt,
		&phoneNumber, &accountVerifiedAt, &verificationMethod,
		&emailConsent, &phoneCallConsent, &user.NotificationPermissionStatus,
		&locationZipFallback, &onboardingCompletedAt, &onboardingCurrentStep,
	); err != nil {
		return User{}, err
	}
	user.Email = nullStringPtr(email)
	user.PhoneNumber = nullStringPtr(phoneNumber)
	user.AccountVerifiedAt = nullTimePtr(accountVerifiedAt)
	user.VerificationMethod = nullStringPtr(verificationMethod)
	user.EmailConsent = nullBoolPtr(emailConsent)
	user.PhoneCallConsent = nullBoolPtr(phoneCallConsent)
	user.LocationZipFallback = nullStringPtr(locationZipFallback)
	user.OnboardingCompletedAt = nullTimePtr(onboardingCompletedAt)
	user.OnboardingCurrentStep = nullStringPtr(onboardingCurrentStep)
	return user, nil
}

func scanProfile(row scanner) (Profile, error) {
	var profile Profile
	var profileImageURI sql.NullString
	if err := row.Scan(
		&profile.UserID,
		&profile.FirstName,
		&profile.LastName,
		&profile.Phone,
		&profile.Zip,
		&profile.HouseholdSize,
		&profileImageURI,
		&profile.CreatedAt,
		&profile.UpdatedAt,
	); err != nil {
		return Profile{}, err
	}
	profile.ProfileImageURI = nullStringPtr(profileImageURI)
	return profile, nil
}

func loadCurrentHandle(ctx context.Context, querier rowQuerier, profile *Profile) error {
	handle, err := scanOptionalHandle(querier.QueryRow(ctx, `
		SELECT handle, user_id, is_current, created_at, retired_at
		FROM profile_handles
		WHERE user_id = $1 AND is_current
	`, profile.UserID))
	if err != nil {
		return err
	}
	if handle != nil {
		profile.Handle = &handle.Handle
	}
	return nil
}

func scanOptionalHandle(row scanner) (*ProfileHandle, error) {
	var handle ProfileHandle
	var retiredAt sql.NullTime
	if err := row.Scan(&handle.Handle, &handle.UserID, &handle.IsCurrent, &handle.CreatedAt, &retiredAt); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	handle.RetiredAt = nullTimePtr(retiredAt)
	return &handle, nil
}

func scanPreferences(row scanner) (Preferences, error) {
	var preferences Preferences
	var lastMealPlanDate sql.NullTime
	if err := row.Scan(
		&preferences.UserID,
		&preferences.WeeklyBudget,
		&preferences.PreferredFinanceTopics,
		&preferences.PreferredResources,
		&preferences.WantsGovAssistance,
		&lastMealPlanDate,
		&preferences.NotificationsEnabled,
		&preferences.ExpiringPantryNotificationsEnabled,
		&preferences.WeeklyMealPlanNotificationsEnabled,
		&preferences.ResourceReminderNotificationsEnabled,
		&preferences.BenefitsRenewalNotificationsEnabled,
		&preferences.BenefitsRenewalDiscreetLockScreen,
		&preferences.SelectedBenefitPrograms,
		&preferences.LocationPermissionStatus,
		&preferences.CreatedAt,
		&preferences.UpdatedAt,
	); err != nil {
		return Preferences{}, err
	}
	preferences.LastMealPlanDate = nullTimePtr(lastMealPlanDate)
	return preferences, nil
}

func scanOnboardingState(row scanner) (OnboardingState, error) {
	var onboarding OnboardingState
	var completedAt sql.NullTime
	if err := row.Scan(
		&onboarding.UserID,
		&onboarding.HasCompletedOnboarding,
		&completedAt,
		&onboarding.CreatedAt,
		&onboarding.UpdatedAt,
	); err != nil {
		return OnboardingState{}, err
	}
	onboarding.CompletedAt = nullTimePtr(completedAt)
	return onboarding, nil
}

// ---------------------------------------------------------------------------
// Sign Up / Login / Onboarding v2
// ---------------------------------------------------------------------------

// VerificationMethod values accepted by verification_codes.method and
// users.verification_method. Verification is email-only (text was removed
// as a channel in September 2026).
const (
	VerificationMethodEmail = "email"
)

// VerificationPurpose values accepted by verification_codes.purpose.
const (
	VerificationPurposeSignup      = "signup"
	VerificationPurposeEmailChange = "email_change"
	VerificationPurposePhoneChange = "phone_change"
	VerificationPurposeRecovery    = "recovery"
)

const (
	// VerificationCodeTTL is how long a code stays valid after creation.
	VerificationCodeTTL = 10 * time.Minute
	// VerificationCodeMinInterval is the minimum gap between issuing new
	// unconsumed codes to one user (rate limiting).
	VerificationCodeMinInterval = time.Minute
	// VerificationCodeMaxAttempts is how many wrong guesses a code tolerates
	// before it is burned.
	VerificationCodeMaxAttempts = 5
)

// VerificationStatus describes whether a user completed one-time
// verification, and through which channel.
type VerificationStatus struct {
	Verified   bool
	VerifiedAt *time.Time
	Method     *string
}

// Verification errors returned by VerifyCode. The users module maps these to
// public client-facing messages.
var (
	ErrVerificationCodeInvalid   = errors.New("invalid verification code")
	ErrVerificationCodeExpired   = errors.New("verification code expired")
	ErrVerificationCodeAttempts  = errors.New("too many verification attempts")
	ErrVerificationRateLimited   = errors.New("verification code requested too recently")
	ErrVerificationCodeUnchanged = errors.New("nothing to verify")
)

// VerificationResult describes a code that was successfully consumed.
type VerificationResult struct {
	Method  string
	Purpose string
	User    User
}

// VerificationCode is the latest issued-but-unconsumed code row, used by
// tests and admin tooling. It never carries the plain code.
type verificationCodeRow struct {
	ID        string
	CodeHash  string
	Method    string
	Purpose   string
	NewEmail  sql.NullString
	NewPhone  sql.NullString
	ExpiresAt time.Time
	Attempts  int
	CreatedAt time.Time
}

func nullBoolPtr(value sql.NullBool) *bool {
	if !value.Valid {
		return nil
	}
	result := value.Bool
	return &result
}

// CreateVerificationCode issues a new 6-digit numeric code for the user and
// returns the PLAIN code to the caller (the service sends it via the chosen
// channel). Only salt$sha256(salt || code) is persisted; the plain code is
// never logged. It rejects the request when an unconsumed code was created
// less than VerificationCodeMinInterval ago.
func (s *Store) CreateVerificationCode(ctx context.Context, userID, method, purpose string, newEmail, newPhone *string) (string, error) {
	var recent bool
	if err := s.pool.QueryRow(ctx, `
		SELECT EXISTS (
			SELECT 1 FROM verification_codes
			WHERE user_id = $1
			  AND consumed_at IS NULL
			  AND created_at > now() - ($2::text || ' seconds')::interval
		)
	`, userID, strconv.Itoa(int(VerificationCodeMinInterval.Seconds()))).Scan(&recent); err != nil {
		return "", err
	}
	if recent {
		return "", ErrVerificationRateLimited
	}

	code, err := randomVerificationCode()
	if err != nil {
		return "", err
	}
	salt := make([]byte, 16)
	if _, err := rand.Read(salt); err != nil {
		return "", err
	}
	codeHash := hex.EncodeToString(salt) + "$" + hex.EncodeToString(hashVerificationCode(salt, code))

	if _, err := s.pool.Exec(ctx, `
		INSERT INTO verification_codes (user_id, code_hash, method, purpose, new_email, new_phone, expires_at)
		VALUES ($1, $2, $3, $4, $5, $6, now() + ($7::text || ' seconds')::interval)
	`, userID, codeHash, method, purpose, newEmail, newPhone, strconv.Itoa(int(VerificationCodeTTL.Seconds()))); err != nil {
		return "", err
	}
	return code, nil
}

// VerifyCode checks the code against the user's latest unconsumed code. On
// success it consumes the code, stamps users.account_verified_at (plus
// verification_method), and applies the pending email/phone change for the
// change purposes. Wrong guesses increment attempts; the fifth wrong guess
// burns the code.
func (s *Store) VerifyCode(ctx context.Context, userID, code string) (VerificationResult, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return VerificationResult{}, err
	}
	defer rollback(ctx, tx)

	var row verificationCodeRow
	err = tx.QueryRow(ctx, `
		SELECT id, code_hash, method, purpose, new_email, new_phone, expires_at, attempts, created_at
		FROM verification_codes
		WHERE user_id = $1 AND consumed_at IS NULL
		ORDER BY created_at DESC
		LIMIT 1
		FOR UPDATE
	`, userID).Scan(
		&row.ID, &row.CodeHash, &row.Method, &row.Purpose,
		&row.NewEmail, &row.NewPhone, &row.ExpiresAt, &row.Attempts, &row.CreatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return VerificationResult{}, ErrVerificationCodeInvalid
		}
		return VerificationResult{}, err
	}

	if s.now().After(row.ExpiresAt) {
		if _, err := tx.Exec(ctx, `UPDATE verification_codes SET consumed_at = now() WHERE id = $1`, row.ID); err != nil {
			return VerificationResult{}, err
		}
		if err := tx.Commit(ctx); err != nil {
			return VerificationResult{}, err
		}
		return VerificationResult{}, ErrVerificationCodeExpired
	}

	if !compareVerificationCode(row.CodeHash, code) {
		attempts := row.Attempts + 1
		if attempts >= VerificationCodeMaxAttempts {
			if _, err := tx.Exec(ctx, `
				UPDATE verification_codes SET attempts = $2, consumed_at = now() WHERE id = $1
			`, row.ID, attempts); err != nil {
				return VerificationResult{}, err
			}
			if err := tx.Commit(ctx); err != nil {
				return VerificationResult{}, err
			}
			return VerificationResult{}, ErrVerificationCodeAttempts
		}
		if _, err := tx.Exec(ctx, `UPDATE verification_codes SET attempts = $2 WHERE id = $1`, row.ID, attempts); err != nil {
			return VerificationResult{}, err
		}
		if err := tx.Commit(ctx); err != nil {
			return VerificationResult{}, err
		}
		return VerificationResult{}, ErrVerificationCodeInvalid
	}

	// Success: consume the code and mark the account verified.
	var newEmail *string
	var newPhone *string
	if row.Purpose == VerificationPurposeEmailChange && row.NewEmail.Valid {
		newEmail = &row.NewEmail.String
	}
	if row.Purpose == VerificationPurposePhoneChange && row.NewPhone.Valid {
		newPhone = &row.NewPhone.String
	}
	user, err := scanUser(tx.QueryRow(ctx, `
		UPDATE users
		SET account_verified_at = COALESCE(account_verified_at, now()),
		    verification_method = $2,
		    email = COALESCE($3, email),
		    phone_number = COALESCE($4, phone_number),
		    updated_at = now()
		WHERE id = $1
		RETURNING id, auth_subject, email, created_at, updated_at,
		          phone_number, account_verified_at, verification_method,
		          email_consent, phone_call_consent, notification_permission_status,
		          location_zip_fallback, onboarding_completed_at, onboarding_current_step
	`, userID, row.Method, newEmail, newPhone))
	if err != nil {
		return VerificationResult{}, err
	}
	if _, err := tx.Exec(ctx, `UPDATE verification_codes SET consumed_at = now() WHERE id = $1`, row.ID); err != nil {
		return VerificationResult{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return VerificationResult{}, err
	}
	return VerificationResult{Method: row.Method, Purpose: row.Purpose, User: user}, nil
}

// DeleteVerificationCodesForUser removes a user's pending codes. Used when a
// send fails so the user can retry immediately instead of hitting the rate
// limit with a code they never received.
func (s *Store) DeleteVerificationCodesForUser(ctx context.Context, userID string) error {
	_, err := s.pool.Exec(ctx, `
		DELETE FROM verification_codes WHERE user_id = $1 AND consumed_at IS NULL
	`, userID)
	return err
}

// VerificationLinkTTL is how long a magic link stays valid after creation.
// Links live much longer than codes: the user may not open the email for
// hours, and the link is single-use and unguessable (256 bits).
const VerificationLinkTTL = 24 * time.Hour

// verificationLinkPrefixLength is how many leading hex chars of the token are
// stored in plaintext for lookup. The verify handler is unauthenticated, so
// the full token hash cannot be the lookup key.
const verificationLinkPrefixLength = 8

// Verification errors returned by the magic-link flow. The users module maps
// these to public client-facing messages.
var (
	ErrVerificationLinkInvalid = errors.New("invalid verification link")
	ErrVerificationLinkExpired = errors.New("verification link expired")
)

// verificationLinkRow is an unconsumed magic-link row, used by
// ConsumeVerificationLink. It never carries the plain token.
type verificationLinkRow struct {
	ID        string
	UserID    string
	TokenHash string
	ExpiresAt time.Time
}

// CreateVerificationLink issues a magic-link token for the user and returns
// the PLAIN token to the caller (the service embeds it in the emailed URL).
// Only salt$sha256(salt || token) is persisted; the plain token is never
// logged. It rejects the request when an unconsumed link was created less
// than VerificationCodeMinInterval ago (same anti-spam cadence as codes).
func (s *Store) CreateVerificationLink(ctx context.Context, userID, purpose string) (string, error) {
	var recent bool
	if err := s.pool.QueryRow(ctx, `
		SELECT EXISTS (
			SELECT 1 FROM verification_links
			WHERE user_id = $1
			  AND consumed_at IS NULL
			  AND created_at > now() - ($2::text || ' seconds')::interval
		)
	`, userID, strconv.Itoa(int(VerificationCodeMinInterval.Seconds()))).Scan(&recent); err != nil {
		return "", err
	}
	if recent {
		return "", ErrVerificationRateLimited
	}

	tokenBytes := make([]byte, 32)
	if _, err := rand.Read(tokenBytes); err != nil {
		return "", err
	}
	token := hex.EncodeToString(tokenBytes)
	salt := make([]byte, 16)
	if _, err := rand.Read(salt); err != nil {
		return "", err
	}
	tokenHash := hex.EncodeToString(salt) + "$" + hex.EncodeToString(hashVerificationCode(salt, token))

	if _, err := s.pool.Exec(ctx, `
		INSERT INTO verification_links (user_id, token_hash, token_prefix, purpose, expires_at)
		VALUES ($1, $2, $3, $4, now() + ($5::text || ' seconds')::interval)
	`, userID, tokenHash, token[:verificationLinkPrefixLength], purpose, strconv.Itoa(int(VerificationLinkTTL.Seconds()))); err != nil {
		return "", err
	}
	return token, nil
}

// ConsumeVerificationLink validates a magic-link token, consumes the link,
// and stamps users.account_verified_at. Single-use: the first tap wins, and
// an expired link is consumed so it can never be retried. Returns the owning
// user ID. It never re-verifies on normal login — only this handler routes
// here.
func (s *Store) ConsumeVerificationLink(ctx context.Context, token string) (string, error) {
	token = strings.TrimSpace(token)
	if len(token) < verificationLinkPrefixLength {
		return "", ErrVerificationLinkInvalid
	}
	prefix := token[:verificationLinkPrefixLength]

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return "", err
	}
	defer rollback(ctx, tx)

	rows, err := tx.Query(ctx, `
		SELECT id, user_id, token_hash, expires_at
		FROM verification_links
		WHERE token_prefix = $1 AND consumed_at IS NULL
		ORDER BY created_at DESC
		FOR UPDATE
	`, prefix)
	if err != nil {
		return "", err
	}
	var candidates []verificationLinkRow
	for rows.Next() {
		var row verificationLinkRow
		if err := rows.Scan(&row.ID, &row.UserID, &row.TokenHash, &row.ExpiresAt); err != nil {
			rows.Close()
			return "", err
		}
		candidates = append(candidates, row)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return "", err
	}

	var match *verificationLinkRow
	for i := range candidates {
		if compareVerificationCode(candidates[i].TokenHash, token) {
			match = &candidates[i]
			break
		}
	}
	if match == nil {
		// No hash matched: either a forged/unknown token or one already
		// consumed (consumed rows are excluded from the lookup).
		return "", ErrVerificationLinkInvalid
	}

	if s.now().After(match.ExpiresAt) {
		if _, err := tx.Exec(ctx, `UPDATE verification_links SET consumed_at = now() WHERE id = $1`, match.ID); err != nil {
			return "", err
		}
		if err := tx.Commit(ctx); err != nil {
			return "", err
		}
		return "", ErrVerificationLinkExpired
	}

	// Success: consume the link and mark the account verified.
	user, err := scanUser(tx.QueryRow(ctx, `
		UPDATE users
		SET account_verified_at = COALESCE(account_verified_at, now()),
		    verification_method = 'email',
		    updated_at = now()
		WHERE id = $1
		RETURNING id, auth_subject, email, created_at, updated_at,
		          phone_number, account_verified_at, verification_method,
		          email_consent, phone_call_consent, notification_permission_status,
		          location_zip_fallback, onboarding_completed_at, onboarding_current_step
	`, match.UserID))
	if err != nil {
		return "", err
	}
	if _, err := tx.Exec(ctx, `UPDATE verification_links SET consumed_at = now() WHERE id = $1`, match.ID); err != nil {
		return "", err
	}
	if err := tx.Commit(ctx); err != nil {
		return "", err
	}
	return user.ID, nil
}

// DeleteVerificationLinksForUser removes a user's pending links. Used when a
// send fails so the user can retry immediately instead of hitting the rate
// limit with a link they never received.
func (s *Store) DeleteVerificationLinksForUser(ctx context.Context, userID string) error {
	_, err := s.pool.Exec(ctx, `
		DELETE FROM verification_links WHERE user_id = $1 AND consumed_at IS NULL
	`, userID)
	return err
}

func randomVerificationCode() (string, error) {
	maximum := new(big.Int).SetInt64(1000000)
	value, err := rand.Int(rand.Reader, maximum)
	if err != nil {
		return "", err
	}
	return fmt.Sprintf("%06d", value.Int64()), nil
}

func hashVerificationCode(salt []byte, code string) []byte {
	sum := sha256.Sum256(append(append([]byte{}, salt...), code...))
	return sum[:]
}

// compareVerificationCode checks a candidate code against a stored
// "salt$hash" value in constant time. Malformed hashes never match.
func compareVerificationCode(stored, candidate string) bool {
	parts := strings.SplitN(stored, "$", 2)
	if len(parts) != 2 {
		return false
	}
	salt, err := hex.DecodeString(parts[0])
	if err != nil {
		return false
	}
	expected, err := hex.DecodeString(parts[1])
	if err != nil {
		return false
	}
	actual := hashVerificationCode(salt, candidate)
	return subtle.ConstantTimeCompare(actual, expected) == 1
}

// QuestionnaireAnswers holds one user's onboarding questionnaire answers.
// PrimaryGoal is one of "APPLY_BENEFITS" | "BUDGET_MEALS".
type QuestionnaireAnswers struct {
	UserID        string
	WeeklyBudget  *string
	FinanceTopics []string
	Resources     []string
	PrimaryGoal   *string
	HouseholdSize *string
	IncomeBracket *string
	UpdatedAt     time.Time
}

// QuestionnairePatch is a partial questionnaire update: nil pointers and nil
// slices leave the existing value untouched.
type QuestionnairePatch struct {
	WeeklyBudget  *string
	FinanceTopics []string
	Resources     []string
	PrimaryGoal   *string
	HouseholdSize *string
	IncomeBracket *string
}

// SaveQuestionnaire upserts the user's questionnaire answers, writing only
// the fields the patch carries. On first save the patch fields are part of
// the INSERT so the returned row reflects what was just written; later
// saves update only the supplied columns.
func (s *Store) SaveQuestionnaire(ctx context.Context, userID string, patch QuestionnairePatch) (QuestionnaireAnswers, error) {
	columns := []string{"user_id"}
	placeholders := []string{"$1"}
	args := []any{userID}
	sets := []string{"updated_at = now()"}
	add := func(column string, value any, isArray bool) {
		placeholder := fmt.Sprintf("$%d", len(args)+1)
		if isArray {
			placeholder += "::text[]"
		}
		columns = append(columns, column)
		placeholders = append(placeholders, placeholder)
		args = append(args, value)
		sets = append(sets, column+" = "+placeholder)
	}
	if patch.WeeklyBudget != nil {
		add("weekly_budget", *patch.WeeklyBudget, false)
	}
	if patch.FinanceTopics != nil {
		add("finance_topics", patch.FinanceTopics, true)
	}
	if patch.Resources != nil {
		add("resources", patch.Resources, true)
	}
	if patch.PrimaryGoal != nil {
		add("primary_goal", *patch.PrimaryGoal, false)
	}
	if patch.HouseholdSize != nil {
		add("household_size", *patch.HouseholdSize, false)
	}
	if patch.IncomeBracket != nil {
		add("income_bracket", *patch.IncomeBracket, false)
	}
	query := fmt.Sprintf(`
		INSERT INTO questionnaire_answers (%s)
		VALUES (%s)
		ON CONFLICT (user_id) DO UPDATE SET %s
		RETURNING user_id, weekly_budget, finance_topics, resources, primary_goal, household_size, income_bracket, updated_at
	`, strings.Join(columns, ", "), strings.Join(placeholders, ", "), strings.Join(sets, ", "))
	return scanQuestionnaireAnswers(s.pool.QueryRow(ctx, query, args...))
}

// GetQuestionnaireAnswers returns the user's saved answers, or zero-value
// answers with empty lists when they have not answered yet.
func (s *Store) GetQuestionnaireAnswers(ctx context.Context, userID string) (QuestionnaireAnswers, error) {
	row := s.pool.QueryRow(ctx, `
		SELECT user_id, weekly_budget, finance_topics, resources, primary_goal, household_size, income_bracket, updated_at
		FROM questionnaire_answers
		WHERE user_id = $1
	`, userID)
	answers, err := scanQuestionnaireAnswers(row)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return QuestionnaireAnswers{
				UserID:        userID,
				FinanceTopics: []string{},
				Resources:     []string{},
				UpdatedAt:     s.now(),
			}, nil
		}
		return QuestionnaireAnswers{}, err
	}
	return answers, nil
}

func scanQuestionnaireAnswers(row scanner) (QuestionnaireAnswers, error) {
	var answers QuestionnaireAnswers
	var weeklyBudget sql.NullString
	var primaryGoal sql.NullString
	var householdSize sql.NullString
	var incomeBracket sql.NullString
	if err := row.Scan(
		&answers.UserID,
		&weeklyBudget,
		&answers.FinanceTopics,
		&answers.Resources,
		&primaryGoal,
		&householdSize,
		&incomeBracket,
		&answers.UpdatedAt,
	); err != nil {
		return QuestionnaireAnswers{}, err
	}
	answers.WeeklyBudget = nullStringPtr(weeklyBudget)
	answers.PrimaryGoal = nullStringPtr(primaryGoal)
	answers.HouseholdSize = nullStringPtr(householdSize)
	answers.IncomeBracket = nullStringPtr(incomeBracket)
	if answers.FinanceTopics == nil {
		answers.FinanceTopics = []string{}
	}
	if answers.Resources == nil {
		answers.Resources = []string{}
	}
	return answers, nil
}

// SaveOnboardingStep records where an interrupted onboarding should resume
// (e.g. "questionnaire:3", "permissions:push", "all-set").
func (s *Store) SaveOnboardingStep(ctx context.Context, userID, step string) error {
	_, err := s.pool.Exec(ctx, `
		UPDATE users SET onboarding_current_step = $2, updated_at = now() WHERE id = $1
	`, userID, step)
	return err
}

// UpdateCommunicationConsents updates only the consent columns whose pointers
// are non-nil. NULL means "not answered yet", distinct from false.
func (s *Store) UpdateCommunicationConsents(ctx context.Context, userID string, emailConsent, phoneCallConsent *bool) error {
	if emailConsent == nil && phoneCallConsent == nil {
		return nil
	}
	sets := []string{"updated_at = now()"}
	args := []any{userID}
	next := 2
	if emailConsent != nil {
		sets = append(sets, fmt.Sprintf("email_consent = $%d", next))
		args = append(args, *emailConsent)
		next++
	}
	if phoneCallConsent != nil {
		sets = append(sets, fmt.Sprintf("phone_call_consent = $%d", next))
		args = append(args, *phoneCallConsent)
		next++
	}
	query := fmt.Sprintf(`UPDATE users SET %s WHERE id = $1`, strings.Join(sets, ", "))
	_, err := s.pool.Exec(ctx, query, args...)
	return err
}

// SaveLocationFallback stores the manual ZIP the user typed after declining
// the location permission prompt.
func (s *Store) SaveLocationFallback(ctx context.Context, userID, zip string) error {
	_, err := s.pool.Exec(ctx, `
		UPDATE users SET location_zip_fallback = $2, updated_at = now() WHERE id = $1
	`, userID, zip)
	return err
}

// SavePhoneNumber stores the account phone number. When the value actually
// changes, the verified stamp is cleared so the account re-verifies (email
// change, phone change and account recovery are the only re-verification
// triggers; verification itself is email-only).
func (s *Store) SavePhoneNumber(ctx context.Context, userID, phoneNumber string) error {
	_, err := s.pool.Exec(ctx, `
		UPDATE users
		SET phone_number = $2,
		    account_verified_at = CASE WHEN phone_number IS DISTINCT FROM $2 THEN NULL ELSE account_verified_at END,
		    updated_at = now()
		WHERE id = $1
	`, userID, phoneNumber)
	return err
}
