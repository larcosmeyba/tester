-- +goose Up
-- Signup consent record (Terms/Privacy acceptance + email marketing preference).
-- The server stamps both acceptance timestamps at insert; re-accepting
-- overwrites the row with the newest version and timestamps.
CREATE TABLE consents (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  terms_version TEXT NOT NULL,
  terms_accepted_at TIMESTAMPTZ NOT NULL,
  privacy_version TEXT NOT NULL,
  privacy_accepted_at TIMESTAMPTZ NOT NULL,
  email_marketing_opt_in BOOLEAN NOT NULL DEFAULT FALSE,
  email_marketing_updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Questionnaire answers that live on the user's preferences row.
ALTER TABLE preferences
  ADD COLUMN selected_benefit_programs TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN location_permission_status TEXT NOT NULL DEFAULT 'unset'
    CHECK (location_permission_status IN ('unset', 'granted', 'denied'));

-- +goose Down
ALTER TABLE preferences
  DROP COLUMN location_permission_status,
  DROP COLUMN selected_benefit_programs;

DROP TABLE consents;
