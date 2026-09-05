-- name: UpsertUserByAuthSubject :one
INSERT INTO users (id, auth_subject, email)
VALUES ($1, $2, $3)
ON CONFLICT (auth_subject) DO UPDATE
SET email = COALESCE(EXCLUDED.email, users.email),
    updated_at = now()
RETURNING id, auth_subject, email, created_at, updated_at;

-- name: GetUserByID :one
SELECT id, auth_subject, email, created_at, updated_at
FROM users
WHERE id = $1;

-- name: EnsureProfile :one
INSERT INTO profiles (user_id)
VALUES ($1)
ON CONFLICT (user_id) DO UPDATE
SET user_id = EXCLUDED.user_id
RETURNING user_id, first_name, last_name, phone, zip, household_size, profile_image_uri, created_at, updated_at;

-- name: EnsurePreferences :one
INSERT INTO preferences (user_id)
VALUES ($1)
ON CONFLICT (user_id) DO UPDATE
SET user_id = EXCLUDED.user_id
RETURNING user_id, weekly_budget, preferred_finance_topics, preferred_resources, wants_gov_assistance, last_meal_plan_date,
  notifications_enabled, expiring_pantry_notifications_enabled, weekly_meal_plan_notifications_enabled,
  resource_reminder_notifications_enabled, created_at, updated_at;

-- name: EnsureOnboardingState :one
INSERT INTO onboarding_state (user_id)
VALUES ($1)
ON CONFLICT (user_id) DO UPDATE
SET user_id = EXCLUDED.user_id
RETURNING user_id, has_completed_onboarding, completed_at, created_at, updated_at;

-- name: UpdateProfile :one
UPDATE profiles
SET first_name = COALESCE(sqlc.narg('first_name'), first_name),
    last_name = COALESCE(sqlc.narg('last_name'), last_name),
    phone = COALESCE(sqlc.narg('phone'), phone),
    zip = COALESCE(sqlc.narg('zip'), zip),
    household_size = COALESCE(sqlc.narg('household_size'), household_size),
    profile_image_uri = COALESCE(sqlc.narg('profile_image_uri'), profile_image_uri),
    updated_at = now()
WHERE user_id = sqlc.arg('user_id')
RETURNING user_id, first_name, last_name, phone, zip, household_size, profile_image_uri, created_at, updated_at;

-- name: UpdatePreferences :one
UPDATE preferences
SET weekly_budget = COALESCE(sqlc.narg('weekly_budget'), weekly_budget),
    preferred_finance_topics = COALESCE(sqlc.narg('preferred_finance_topics'), preferred_finance_topics),
    preferred_resources = COALESCE(sqlc.narg('preferred_resources'), preferred_resources),
    wants_gov_assistance = COALESCE(sqlc.narg('wants_gov_assistance'), wants_gov_assistance),
    last_meal_plan_date = COALESCE(sqlc.narg('last_meal_plan_date'), last_meal_plan_date),
    notifications_enabled = COALESCE(sqlc.narg('notifications_enabled'), notifications_enabled),
    expiring_pantry_notifications_enabled = COALESCE(sqlc.narg('expiring_pantry_notifications_enabled'), expiring_pantry_notifications_enabled),
    weekly_meal_plan_notifications_enabled = COALESCE(sqlc.narg('weekly_meal_plan_notifications_enabled'), weekly_meal_plan_notifications_enabled),
    resource_reminder_notifications_enabled = COALESCE(sqlc.narg('resource_reminder_notifications_enabled'), resource_reminder_notifications_enabled),
    updated_at = now()
WHERE user_id = sqlc.arg('user_id')
RETURNING user_id, weekly_budget, preferred_finance_topics, preferred_resources, wants_gov_assistance, last_meal_plan_date,
  notifications_enabled, expiring_pantry_notifications_enabled, weekly_meal_plan_notifications_enabled,
  resource_reminder_notifications_enabled, created_at, updated_at;

-- name: CompleteOnboarding :one
UPDATE onboarding_state
SET has_completed_onboarding = true,
    completed_at = now(),
    updated_at = now()
WHERE user_id = $1
RETURNING user_id, has_completed_onboarding, completed_at, created_at, updated_at;
