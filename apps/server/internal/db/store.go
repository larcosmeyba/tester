package db

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"errors"
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Store struct {
	pool *pgxpool.Pool
	now  func() time.Time
}

func NewStore(pool *pgxpool.Pool) *Store {
	return &Store{pool: pool, now: time.Now}
}

func Connect(ctx context.Context, databaseURL string) (*pgxpool.Pool, error) {
	pool, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		return nil, err
	}
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, err
	}
	return pool, nil
}

func (s *Store) Ping(ctx context.Context) error {
	return s.pool.Ping(ctx)
}

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
	CreatedAt                            time.Time
	UpdatedAt                            time.Time
}

type OnboardingState struct {
	UserID                 string
	HasCompletedOnboarding bool
	CompletedAt            *time.Time
	CreatedAt              time.Time
	UpdatedAt              time.Time
}

type PantryItem struct {
	ID             string
	UserID         string
	Name           string
	Quantity       string
	Location       string
	ExpirationDate time.Time
	Category       string
	Status         string
	DateAdded      time.Time
	DateUsed       *time.Time
	CreatedAt      time.Time
	UpdatedAt      time.Time
}

type PushToken struct {
	ID         string
	UserID     string
	Token      string
	Platform   string
	DeviceID   *string
	CreatedAt  time.Time
	UpdatedAt  time.Time
	LastSeenAt time.Time
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
}

type PantryFilter struct {
	Status   *string
	Location *string
}

type CreatePantryItemParams struct {
	UserID         string
	Name           string
	Quantity       string
	Location       string
	ExpirationDate time.Time
	Category       string
}

type PantryItemPatch struct {
	Name           *string
	Quantity       *string
	Location       *string
	ExpirationDate *time.Time
	Category       *string
	Status         *string
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
		          resource_reminder_notifications_enabled, created_at, updated_at
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
		    updated_at = now()
		WHERE user_id = $1
		RETURNING user_id, weekly_budget, preferred_finance_topics, preferred_resources, wants_gov_assistance, last_meal_plan_date,
		          notifications_enabled, expiring_pantry_notifications_enabled, weekly_meal_plan_notifications_enabled,
		          resource_reminder_notifications_enabled, created_at, updated_at
	`, userID, patch.WeeklyBudget, nullableStringSlice(patch.PreferredFinanceTopics), nullableStringSlice(patch.PreferredResources), patch.WantsGovAssistance, patch.LastMealPlanDate, patch.NotificationsEnabled, patch.ExpiringPantryNotificationsEnabled, patch.WeeklyMealPlanNotificationsEnabled, patch.ResourceReminderNotificationsEnabled)
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

func (s *Store) ListPantryItems(ctx context.Context, userID string, filter PantryFilter) ([]PantryItem, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT id, user_id, name, quantity, location, expiration_date, category, status, date_added, date_used, created_at, updated_at
		FROM pantry_items
		WHERE user_id = $1
		  AND ($2::text IS NULL OR status = $2)
		  AND ($3::text IS NULL OR location = $3)
		ORDER BY expiration_date ASC, created_at ASC
	`, userID, filter.Status, filter.Location)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var items []PantryItem
	for rows.Next() {
		item, err := scanPantryItem(rows)
		if err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (s *Store) CreatePantryItem(ctx context.Context, params CreatePantryItemParams) (PantryItem, error) {
	row := s.pool.QueryRow(ctx, `
		INSERT INTO pantry_items (id, user_id, name, quantity, location, expiration_date, category, status, date_added)
		VALUES ($1, $2, $3, $4, $5, $6, $7, 'ACTIVE', $8)
		RETURNING id, user_id, name, quantity, location, expiration_date, category, status, date_added, date_used, created_at, updated_at
	`, NewID(), params.UserID, params.Name, params.Quantity, params.Location, params.ExpirationDate, params.Category, s.now().UTC())
	return scanPantryItem(row)
}

func (s *Store) UpdatePantryItem(ctx context.Context, userID string, id string, patch PantryItemPatch) (PantryItem, error) {
	row := s.pool.QueryRow(ctx, `
		UPDATE pantry_items
		SET name = COALESCE($3, name),
		    quantity = COALESCE($4, quantity),
		    location = COALESCE($5, location),
		    expiration_date = COALESCE($6::date, expiration_date),
		    category = COALESCE($7, category),
		    status = COALESCE($8, status),
		    date_used = CASE
		      WHEN $8::text = 'USED' AND date_used IS NULL THEN CURRENT_DATE
		      WHEN $8::text IS NOT NULL AND $8::text <> 'USED' THEN NULL
		      ELSE date_used
		    END,
		    updated_at = now()
		WHERE user_id = $1 AND id = $2
		RETURNING id, user_id, name, quantity, location, expiration_date, category, status, date_added, date_used, created_at, updated_at
	`, userID, id, patch.Name, patch.Quantity, patch.Location, patch.ExpirationDate, patch.Category, patch.Status)
	return scanPantryItem(row)
}

func (s *Store) MarkPantryItemUsed(ctx context.Context, userID string, id string) (PantryItem, error) {
	row := s.pool.QueryRow(ctx, `
		UPDATE pantry_items
		SET status = 'USED',
		    date_used = COALESCE(date_used, CURRENT_DATE),
		    updated_at = now()
		WHERE user_id = $1 AND id = $2
		RETURNING id, user_id, name, quantity, location, expiration_date, category, status, date_added, date_used, created_at, updated_at
	`, userID, id)
	return scanPantryItem(row)
}

func (s *Store) DeletePantryItem(ctx context.Context, userID string, id string) (bool, error) {
	tag, err := s.pool.Exec(ctx, `DELETE FROM pantry_items WHERE user_id = $1 AND id = $2`, userID, id)
	if err != nil {
		return false, err
	}
	return tag.RowsAffected() > 0, nil
}

type WasteStatRow struct {
	Category string
	Status   string
	Count    int
}

func (s *Store) PantryWasteStats(ctx context.Context, userID string) ([]WasteStatRow, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT category, status, count(*)::int
		FROM pantry_items
		WHERE user_id = $1
		GROUP BY category, status
	`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var stats []WasteStatRow
	for rows.Next() {
		var stat WasteStatRow
		if err := rows.Scan(&stat.Category, &stat.Status, &stat.Count); err != nil {
			return nil, err
		}
		stats = append(stats, stat)
	}
	return stats, rows.Err()
}

func (s *Store) UpsertPushToken(ctx context.Context, userID string, token string, platform string, deviceID *string) (PushToken, error) {
	row := s.pool.QueryRow(ctx, `
		INSERT INTO push_tokens (id, user_id, token, platform, device_id)
		VALUES ($1, $2, $3, $4, $5)
		ON CONFLICT (token) DO UPDATE
		SET user_id = EXCLUDED.user_id,
		    platform = EXCLUDED.platform,
		    device_id = EXCLUDED.device_id,
		    updated_at = now(),
		    last_seen_at = now()
		RETURNING id, user_id, token, platform, device_id, created_at, updated_at, last_seen_at
	`, NewID(), userID, token, platform, deviceID)
	return scanPushToken(row)
}

func (s *Store) DeletePushToken(ctx context.Context, userID string, token string) (bool, error) {
	tag, err := s.pool.Exec(ctx, `DELETE FROM push_tokens WHERE user_id = $1 AND token = $2`, userID, token)
	if err != nil {
		return false, err
	}
	return tag.RowsAffected() > 0, nil
}

func NewID() string {
	var b [16]byte
	if _, err := rand.Read(b[:]); err != nil {
		panic(fmt.Errorf("generate id: %w", err))
	}
	b[6] = (b[6] & 0x0f) | 0x40
	b[8] = (b[8] & 0x3f) | 0x80

	encoded := hex.EncodeToString(b[:])
	return strings.Join([]string{
		encoded[0:8],
		encoded[8:12],
		encoded[12:16],
		encoded[16:20],
		encoded[20:32],
	}, "-")
}

func FormatDate(t time.Time) string {
	return t.UTC().Format(time.DateOnly)
}

func FormatTime(t time.Time) string {
	return t.UTC().Format(time.RFC3339)
}

func ParseDate(value string) (time.Time, error) {
	parsed, err := time.Parse(time.DateOnly, strings.TrimSpace(value))
	if err != nil {
		return time.Time{}, fmt.Errorf("expected YYYY-MM-DD date")
	}
	return parsed, nil
}

func EffectiveStatus(item PantryItem, now time.Time) string {
	if item.Status == "ACTIVE" && item.ExpirationDate.Before(truncateDate(now)) {
		return "EXPIRED"
	}
	return item.Status
}

func ComputeWasteStats(items []PantryItem, now time.Time) WasteStats {
	stats := WasteStats{TotalAdded: len(items)}
	expiredByCategory := map[string]int{}

	for _, item := range items {
		switch EffectiveStatus(item, now) {
		case "USED":
			stats.TotalUsed++
		case "EXPIRED":
			stats.TotalExpired++
			expiredByCategory[item.Category]++
		}
	}

	stats.EstimatedWasteValue = float64(stats.TotalExpired) * 2.5
	stats.MostWastedCategories = topCategories(expiredByCategory, 3)
	return stats
}

type WasteStats struct {
	TotalAdded           int
	TotalUsed            int
	TotalExpired         int
	EstimatedWasteValue  float64
	MostWastedCategories []string
}

func topCategories(counts map[string]int, limit int) []string {
	type categoryCount struct {
		category string
		count    int
	}
	values := make([]categoryCount, 0, len(counts))
	for category, count := range counts {
		values = append(values, categoryCount{category: category, count: count})
	}
	sort.Slice(values, func(i, j int) bool {
		if values[i].count == values[j].count {
			return values[i].category < values[j].category
		}
		return values[i].count > values[j].count
	})

	out := make([]string, 0, min(limit, len(values)))
	for i := 0; i < len(values) && i < limit; i++ {
		out = append(out, values[i].category)
	}
	return out
}

func truncateDate(t time.Time) time.Time {
	year, month, day := t.UTC().Date()
	return time.Date(year, month, day, 0, 0, 0, 0, time.UTC)
}

func nullableStringSlice(values []string) any {
	if values == nil {
		return nil
	}
	return values
}

func rollback(ctx context.Context, tx pgx.Tx) {
	_ = tx.Rollback(ctx)
}

type scanner interface {
	Scan(dest ...any) error
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

type rowQuerier interface {
	QueryRow(context.Context, string, ...any) pgx.Row
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

func scanPantryItem(row scanner) (PantryItem, error) {
	var item PantryItem
	var dateUsed sql.NullTime
	if err := row.Scan(
		&item.ID,
		&item.UserID,
		&item.Name,
		&item.Quantity,
		&item.Location,
		&item.ExpirationDate,
		&item.Category,
		&item.Status,
		&item.DateAdded,
		&dateUsed,
		&item.CreatedAt,
		&item.UpdatedAt,
	); err != nil {
		return PantryItem{}, err
	}
	item.DateUsed = nullTimePtr(dateUsed)
	return item, nil
}

func scanPushToken(row scanner) (PushToken, error) {
	var token PushToken
	var deviceID sql.NullString
	if err := row.Scan(
		&token.ID,
		&token.UserID,
		&token.Token,
		&token.Platform,
		&deviceID,
		&token.CreatedAt,
		&token.UpdatedAt,
		&token.LastSeenAt,
	); err != nil {
		return PushToken{}, err
	}
	token.DeviceID = nullStringPtr(deviceID)
	return token, nil
}

func nullStringPtr(value sql.NullString) *string {
	if !value.Valid {
		return nil
	}
	return &value.String
}

func nullTimePtr(value sql.NullTime) *time.Time {
	if !value.Valid {
		return nil
	}
	return &value.Time
}

func IsNotFound(err error) bool {
	return errors.Is(err, pgx.ErrNoRows)
}
