-- +goose Up
ALTER TABLE profiles DROP COLUMN email;

CREATE TABLE profile_handles (
  handle TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  is_current BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  retired_at TIMESTAMPTZ,
  CONSTRAINT profile_handles_normalized_check CHECK (handle = lower(handle)),
  CONSTRAINT profile_handles_format_check CHECK (handle ~ '^[a-z][a-z0-9_]{2,29}$'),
  CONSTRAINT profile_handles_retired_check CHECK (
    (is_current AND retired_at IS NULL) OR (NOT is_current AND retired_at IS NOT NULL)
  )
);

CREATE UNIQUE INDEX profile_handles_current_user_idx
  ON profile_handles(user_id)
  WHERE is_current;

CREATE INDEX profile_handles_user_idx ON profile_handles(user_id);

-- +goose Down
DROP TABLE IF EXISTS profile_handles;
ALTER TABLE profiles ADD COLUMN email TEXT NOT NULL DEFAULT '';
