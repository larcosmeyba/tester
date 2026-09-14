-- +goose Up
-- Sign Up / Login / Onboarding v2: verification, communication consents,
-- notification permission status, location ZIP fallback and onboarding
-- progress tracking live on the users row. Terms/Privacy consents stay in
-- the consents table (00015); location_permission_status stays in
-- preferences (00015); the profile photo stays in profiles.profile_image_uri.
ALTER TABLE users
  ADD COLUMN phone_number TEXT,
  ADD COLUMN account_verified_at TIMESTAMPTZ NULL,
  ADD COLUMN verification_method TEXT NULL
    CHECK (verification_method IN ('email')),
  ADD COLUMN email_consent BOOLEAN NULL,
  ADD COLUMN phone_call_consent BOOLEAN NULL,
  ADD COLUMN notification_permission_status TEXT NOT NULL DEFAULT 'unset'
    CHECK (notification_permission_status IN ('unset', 'granted', 'denied')),
  ADD COLUMN location_zip_fallback TEXT NULL,
  ADD COLUMN onboarding_completed_at TIMESTAMPTZ NULL,
  ADD COLUMN onboarding_current_step TEXT NULL;

-- One-time verification codes (signup, account recovery, email/phone change).
-- The plain code is never stored: code_hash holds salt$sha256(salt || code).
-- Consumed/expired codes stay in the table so attempts and rate limits are
-- auditable; lookups only ever touch the newest unconsumed code.
CREATE TABLE verification_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL,
  method TEXT NOT NULL CHECK (method IN ('email')),
  purpose TEXT NOT NULL DEFAULT 'signup',
  new_email TEXT NULL,
  new_phone TEXT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ NULL,
  attempts INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_verification_codes_user_consumed
  ON verification_codes (user_id, consumed_at);

-- Onboarding questionnaire answers (7 steps): weekly grocery budget, finance
-- topics, needed resources, primary goal, household size, income bracket.
-- Partial writes upsert.
CREATE TABLE questionnaire_answers (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  weekly_budget TEXT NULL,
  finance_topics TEXT[] NOT NULL DEFAULT '{}',
  resources TEXT[] NOT NULL DEFAULT '{}',
  primary_goal TEXT NULL,
  household_size TEXT NULL,
  income_bracket TEXT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Grandfather pre-v2 accounts: they signed up under the old rules, so they
-- must not be forced through the one-time code on their next login. Only
-- accounts created after this migration stay unverified until verifyCode.
UPDATE users SET account_verified_at = now() WHERE account_verified_at IS NULL;

-- +goose Down
DROP TABLE questionnaire_answers;

DROP INDEX idx_verification_codes_user_consumed;
DROP TABLE verification_codes;

ALTER TABLE users
  DROP COLUMN onboarding_current_step,
  DROP COLUMN onboarding_completed_at,
  DROP COLUMN location_zip_fallback,
  DROP COLUMN notification_permission_status,
  DROP COLUMN phone_call_consent,
  DROP COLUMN email_consent,
  DROP COLUMN verification_method,
  DROP COLUMN account_verified_at,
  DROP COLUMN phone_number;
