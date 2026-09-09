package db

// Users, profiles, handles, preferences and onboarding state — everything that
// describes the account itself.

import (
	"context"
	"database/sql"
	"errors"
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
	CreatedAt                           time.Time
	UpdatedAt                           time.Time
}

type OnboardingState struct {
	UserID                 string
	HasCompletedOnboarding bool
	CompletedAt            *time.Time
	CreatedAt              time.Time
	UpdatedAt              time.Time
}

type Viewer struct {
	User            User
	Profile         Profile
	Preferences     Preferences
	OnboardingState OnboardingState
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
}

func (s *Store) UpsertUserByAuthSubject(ctx context.Context, authSubject string, email *string) (User, error) {
	row := s.pool.QueryRow(ctx, `
		INSERT INTO users (id, auth_subject, email)
		VALUES ($1, $2, $3)
		ON CONFLICT (auth_subject) DO UPDATE
		SET email = COALESCE(EXCLUDED.email, users.email),
		    updated_at = now()
		RETURNING id, auth_subject, email, created_at, updated_at
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
		    updated_at = now()
		RETURNING id, auth_subject, email, created_at, updated_at
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
		          created_at, updated_at
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

	if err := tx.Commit(ctx); err != nil {
		return Viewer{}, err
	}

	return Viewer{
		User:            user,
		Profile:         profile,
		Preferences:     preferences,
		OnboardingState: onboarding,
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
		    updated_at = now()
		WHERE user_id = $1
		RETURNING user_id, weekly_budget, preferred_finance_topics, preferred_resources, wants_gov_assistance, last_meal_plan_date,
		          notifications_enabled, expiring_pantry_notifications_enabled, weekly_meal_plan_notifications_enabled,
		          resource_reminder_notifications_enabled,
		          benefits_renewal_notifications_enabled, benefits_renewal_discreet_lockscreen,
		          created_at, updated_at
	`, userID, patch.WeeklyBudget, nullableStringSlice(patch.PreferredFinanceTopics), nullableStringSlice(patch.PreferredResources), patch.WantsGovAssistance, patch.LastMealPlanDate, patch.NotificationsEnabled, patch.ExpiringPantryNotificationsEnabled, patch.WeeklyMealPlanNotificationsEnabled, patch.ResourceReminderNotificationsEnabled, patch.BenefitsRenewalNotificationsEnabled, patch.BenefitsRenewalDiscreetLockScreen)
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
	return scanOnboardingState(row)
}

func scanUser(row scanner) (User, error) {
	var user User
	var email sql.NullString
	if err := row.Scan(&user.ID, &user.AuthSubject, &email, &user.CreatedAt, &user.UpdatedAt); err != nil {
		return User{}, err
	}
	user.Email = nullStringPtr(email)
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
