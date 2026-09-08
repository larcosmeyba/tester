-- +goose Up

-- The questionnaire, saved.
--
-- Until now the answer set survived only inside each plan's meal_plans.request
-- snapshot, so a user re-answered every question on every generation and
-- nothing else in the product could read what they had said. This table is the
-- durable form: one row per user, rewritten whole each time the questionnaire
-- is answered, and read back as the starting point for the next plan.
--
-- The columns mirror internal/domain/meals.PlanRequest. Closed vocabularies are
-- stored as text and checked in Go against the same lists the GraphQL enums
-- use; the JSONB columns hold the {value, strength} pairs where a preference
-- can be required or merely preferred.
CREATE TABLE meal_preferences (
  user_id                 TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  questionnaire_version   TEXT NOT NULL DEFAULT '',
  plan_scope              TEXT NOT NULL DEFAULT 'us',

  -- Household.
  household_size          INTEGER NOT NULL CHECK (household_size BETWEEN 1 AND 8),
  household_adults        INTEGER CHECK (household_adults >= 0),
  household_children      INTEGER CHECK (household_children >= 0),
  household_size_is_plus  BOOLEAN NOT NULL DEFAULT false,

  -- Meals needed, per category, across the whole plan rather than per day.
  days                    INTEGER NOT NULL DEFAULT 7 CHECK (days BETWEEN 1 AND 7),
  meals_breakfast         INTEGER NOT NULL DEFAULT 0 CHECK (meals_breakfast >= 0),
  meals_lunch             INTEGER NOT NULL DEFAULT 0 CHECK (meals_lunch >= 0),
  meals_dinner            INTEGER NOT NULL DEFAULT 0 CHECK (meals_dinner >= 0),
  meals_snack             INTEGER NOT NULL DEFAULT 0 CHECK (meals_snack >= 0),

  -- Grocery budget. Amount 0 means the user set no budget; it is never a
  -- claim that they have nothing to spend.
  budget_amount           NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (budget_amount >= 0),
  budget_currency         TEXT NOT NULL DEFAULT 'USD',
  budget_mode             TEXT NOT NULL DEFAULT 'balanced',

  -- Dietary preferences: [{"diet": "vegan", "strength": "required"}, ...].
  dietary_requirements    JSONB NOT NULL DEFAULT '[]'::jsonb,
  dietary_other_text      TEXT,

  -- Allergies: [{"allergen": "peanut", "strength": "required"}, ...]. Always
  -- required — the service rejects any other strength rather than downgrading
  -- it — plus canonical ingredient ids for allergies outside the nine.
  allergies               JSONB NOT NULL DEFAULT '[]'::jsonb,
  allergy_ingredient_ids  TEXT[] NOT NULL DEFAULT '{}',

  -- Likes and dislikes. Ingredients and cuisines are ids and canonical names;
  -- free text is the user's own words and is never sent to an AI provider.
  likes_ingredient_ids    TEXT[] NOT NULL DEFAULT '{}',
  likes_cuisines          TEXT[] NOT NULL DEFAULT '{}',
  likes_free_text         TEXT,
  dislikes_ingredient_ids TEXT[] NOT NULL DEFAULT '{}',
  dislikes_cuisines       TEXT[] NOT NULL DEFAULT '{}',
  dislikes_free_text      TEXT,

  -- Nutrition goal: [{"goal": "high_protein", "strength": "preferred"}, ...].
  nutrition_preferences   JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- Cooking time. A required limit excludes; a preferred one only ranks.
  cooking_time_max_minutes INTEGER CHECK (cooking_time_max_minutes > 0),
  cooking_time_strength    TEXT NOT NULL DEFAULT 'preferred',

  -- Leftover preference: 'yes', 'sometimes' or 'no'.
  leftovers               TEXT NOT NULL DEFAULT 'sometimes',

  equipment               TEXT[] NOT NULL DEFAULT '{}',
  cooking_style           TEXT[] NOT NULL DEFAULT '{}',

  -- Recipes the user has rejected. A dislike is remembered so a regeneration
  -- does not bring the same dish back.
  exclude_recipe_ids      TEXT[] NOT NULL DEFAULT '{}',

  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Connects the pantry to the generator.
--
-- pantry_items.name is free text the user typed and stays authoritative for
-- display; ingredient_id is the canonical catalogue row it was matched to. It
-- is nullable on purpose: an item the catalogue cannot resolve stays in the
-- pantry as text and is simply not credited against a plan. It is never
-- guessed at, because a wrong match drops something from a grocery list and
-- the user finds out at the shop.
ALTER TABLE pantry_items
  ADD COLUMN ingredient_id TEXT REFERENCES ingredients(id) ON DELETE SET NULL;

CREATE INDEX pantry_items_ingredient_idx ON pantry_items (user_id, ingredient_id);

-- Exact, case-insensitive name matching is the one automatic resolution the
-- generator performs, so the catalogue needs an index for it.
CREATE INDEX ingredients_display_name_lower_idx ON ingredients (lower(display_name));

-- +goose Down
DROP INDEX IF EXISTS ingredients_display_name_lower_idx;
DROP INDEX IF EXISTS pantry_items_ingredient_idx;
ALTER TABLE pantry_items DROP COLUMN IF EXISTS ingredient_id;
DROP TABLE IF EXISTS meal_preferences;
