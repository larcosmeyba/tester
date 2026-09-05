-- +goose Up
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  auth_subject TEXT NOT NULL UNIQUE,
  email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE profiles (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  first_name TEXT NOT NULL DEFAULT '',
  last_name TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  zip TEXT NOT NULL DEFAULT '',
  household_size INTEGER NOT NULL DEFAULT 1 CHECK (household_size > 0),
  profile_image_uri TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE preferences (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  weekly_budget TEXT NOT NULL DEFAULT '',
  preferred_finance_topics TEXT[] NOT NULL DEFAULT '{}',
  preferred_resources TEXT[] NOT NULL DEFAULT '{}',
  wants_gov_assistance BOOLEAN NOT NULL DEFAULT false,
  last_meal_plan_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE onboarding_state (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  has_completed_onboarding BOOLEAN NOT NULL DEFAULT false,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE pantry_items (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  quantity TEXT NOT NULL,
  location TEXT NOT NULL CHECK (location IN ('PANTRY', 'REFRIGERATOR', 'FREEZER')),
  expiration_date DATE NOT NULL,
  category TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('ACTIVE', 'USED', 'EXPIRED')),
  date_added DATE NOT NULL,
  date_used DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX pantry_items_user_status_idx ON pantry_items(user_id, status);
CREATE INDEX pantry_items_user_location_idx ON pantry_items(user_id, location);
CREATE INDEX pantry_items_user_expiration_idx ON pantry_items(user_id, expiration_date);

CREATE TABLE push_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  platform TEXT NOT NULL CHECK (platform IN ('IOS', 'ANDROID', 'WEB')),
  device_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX push_tokens_user_idx ON push_tokens(user_id);

-- +goose Down
DROP TABLE IF EXISTS push_tokens;
DROP TABLE IF EXISTS pantry_items;
DROP TABLE IF EXISTS onboarding_state;
DROP TABLE IF EXISTS preferences;
DROP TABLE IF EXISTS profiles;
DROP TABLE IF EXISTS users;
