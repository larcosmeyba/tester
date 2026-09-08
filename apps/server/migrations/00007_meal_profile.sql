-- +goose Up

-- The user's standing answers to the meal questionnaire.
--
-- Until now these lived only inside each plan's `request` JSONB snapshot, which
-- meant a returning user was re-interrogated every week and nothing else in the
-- product could read what they had already said. The snapshot stays — it is
-- what makes a plan reproducible — but this is where the answers live between
-- plans.
--
-- Nothing here is a substitute for the snapshot: a plan is always generated
-- from an explicit request. This table is what fills that request in when the
-- client does not.
CREATE TABLE meal_profiles (
  user_id                TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  household_size         INTEGER NOT NULL DEFAULT 1 CHECK (household_size BETWEEN 1 AND 8),
  adults                 INTEGER CHECK (adults IS NULL OR adults >= 0),
  children               INTEGER CHECK (children IS NULL OR children >= 0),
  -- True when the user picked 8+; household_size is stored as 8.
  size_is_plus           BOOLEAN NOT NULL DEFAULT false,
  -- Weekly grocery budget. NUMERIC, not the TEXT that preferences.weekly_budget
  -- has always been, because this one is arithmetic the planner does.
  budget_amount          NUMERIC(10,2) CHECK (budget_amount IS NULL OR budget_amount >= 0),
  budget_currency        TEXT NOT NULL DEFAULT 'USD',
  budget_mode            TEXT NOT NULL DEFAULT 'balanced',
  -- Meals needed, per week, per category.
  meals_breakfast        INTEGER NOT NULL DEFAULT 0 CHECK (meals_breakfast >= 0),
  meals_lunch            INTEGER NOT NULL DEFAULT 0 CHECK (meals_lunch >= 0),
  meals_dinner           INTEGER NOT NULL DEFAULT 0 CHECK (meals_dinner >= 0),
  meals_snack            INTEGER NOT NULL DEFAULT 0 CHECK (meals_snack >= 0),
  days                   INTEGER NOT NULL DEFAULT 7 CHECK (days BETWEEN 1 AND 7),
  cooking_time_max_minutes INTEGER CHECK (cooking_time_max_minutes IS NULL OR cooking_time_max_minutes > 0),
  -- required = a hard limit that excludes; preferred = only ranks.
  cooking_time_strength  TEXT NOT NULL DEFAULT 'preferred',
  leftovers              TEXT NOT NULL DEFAULT 'sometimes',
  equipment              TEXT[] NOT NULL DEFAULT '{}',
  cooking_style          TEXT[] NOT NULL DEFAULT '{}',
  dietary_other_text     TEXT,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Dietary requirements. Strength matters: `required` excludes a recipe,
-- `preferred` only ranks it.
CREATE TABLE meal_profile_diets (
  user_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  diet      TEXT NOT NULL,
  strength  TEXT NOT NULL DEFAULT 'required',
  PRIMARY KEY (user_id, diet)
);

-- Allergies. Always required — the service rejects any other strength rather
-- than quietly downgrading a safety filter — but the column is kept so a row
-- that somehow says otherwise is visible rather than invisible.
CREATE TABLE meal_profile_allergies (
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  allergen      TEXT,
  -- For "other" allergies the user named from the catalogue.
  ingredient_id TEXT REFERENCES ingredients(id) ON DELETE CASCADE,
  strength      TEXT NOT NULL DEFAULT 'required',
  CONSTRAINT meal_profile_allergies_target_check
    CHECK ((allergen IS NULL) <> (ingredient_id IS NULL))
);

CREATE UNIQUE INDEX meal_profile_allergies_allergen_idx
  ON meal_profile_allergies (user_id, allergen) WHERE allergen IS NOT NULL;
CREATE UNIQUE INDEX meal_profile_allergies_ingredient_idx
  ON meal_profile_allergies (user_id, ingredient_id) WHERE ingredient_id IS NOT NULL;

-- Likes and dislikes. `kind` separates them so one table serves both without
-- two near-identical ones drifting apart.
CREATE TABLE meal_profile_preferences (
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- like | dislike
  kind          TEXT NOT NULL,
  -- ingredient | cuisine
  target        TEXT NOT NULL,
  value         TEXT NOT NULL,
  PRIMARY KEY (user_id, kind, target, value)
);

CREATE TABLE meal_profile_nutrition_goals (
  user_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  goal      TEXT NOT NULL,
  strength  TEXT NOT NULL DEFAULT 'preferred',
  -- Lower sorts first; the planner measures a plan against the first goal.
  position  INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, goal)
);

-- +goose Down
DROP TABLE IF EXISTS meal_profile_nutrition_goals;
DROP TABLE IF EXISTS meal_profile_preferences;
DROP TABLE IF EXISTS meal_profile_allergies;
DROP TABLE IF EXISTS meal_profile_diets;
DROP TABLE IF EXISTS meal_profiles;
