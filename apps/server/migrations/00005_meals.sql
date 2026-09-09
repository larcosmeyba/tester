-- +goose Up

-- Canonical ingredient catalog. Every downstream feature — allergens, diets,
-- pantry matching, pricing, grocery lists — joins on ingredient_id, never on
-- raw text. Allergen and diet flags are human-reviewed data, never AI output.
CREATE TABLE ingredients (
  id                    TEXT PRIMARY KEY,
  display_name          TEXT NOT NULL,
  aisle                 TEXT NOT NULL,
  food_group            TEXT NOT NULL,
  parent_ingredient_id  TEXT REFERENCES ingredients(id) ON DELETE SET NULL,
  -- Unit that quantities and prices for this ingredient are expressed in.
  price_reference_unit  TEXT NOT NULL,
  is_pantry_staple      BOOLEAN NOT NULL DEFAULT false,
  -- salt, pepper, water only: always treated as on hand.
  assumed_on_hand       BOOLEAN NOT NULL DEFAULT false,
  contains_meat         BOOLEAN NOT NULL DEFAULT false,
  contains_poultry      BOOLEAN NOT NULL DEFAULT false,
  contains_fish         BOOLEAN NOT NULL DEFAULT false,
  contains_shellfish    BOOLEAN NOT NULL DEFAULT false,
  contains_dairy        BOOLEAN NOT NULL DEFAULT false,
  contains_egg          BOOLEAN NOT NULL DEFAULT false,
  contains_gluten       BOOLEAN NOT NULL DEFAULT false,
  contains_wheat        BOOLEAN NOT NULL DEFAULT false,
  contains_soy          BOOLEAN NOT NULL DEFAULT false,
  contains_peanut       BOOLEAN NOT NULL DEFAULT false,
  contains_tree_nut     BOOLEAN NOT NULL DEFAULT false,
  contains_sesame       BOOLEAN NOT NULL DEFAULT false,
  contains_coconut      BOOLEAN NOT NULL DEFAULT false,
  is_animal_derived     BOOLEAN NOT NULL DEFAULT false,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Estimated prices. Tier 1 = retailer, 2 = regional, 3 = national public
-- estimate, 4 = curated. The tier mix determines a plan's cost confidence.
CREATE TABLE ingredient_prices (
  id                TEXT PRIMARY KEY,
  ingredient_id     TEXT NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
  unit_price        NUMERIC(10,4) NOT NULL CHECK (unit_price >= 0),
  package_size      NUMERIC(10,4) NOT NULL CHECK (package_size > 0),
  -- true = sold loose by weight: buy what is needed, rounded up.
  divisible         BOOLEAN NOT NULL DEFAULT false,
  tier              INTEGER NOT NULL CHECK (tier BETWEEN 1 AND 4),
  source            TEXT NOT NULL,
  geographic_scope  TEXT NOT NULL DEFAULT 'us',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (ingredient_id, tier, geographic_scope)
);

CREATE INDEX ingredient_prices_ingredient_idx ON ingredient_prices (ingredient_id, tier);

-- The Standard HTH Recipe Object. One format for library, AI-generated,
-- imported and hand-entered recipes: source_type is a field, not a second table.
-- owner_user_id NULL = public library recipe.
CREATE TABLE recipes (
  id                      TEXT PRIMARY KEY,
  owner_user_id           TEXT REFERENCES users(id) ON DELETE CASCADE,
  title                   TEXT NOT NULL,
  description             TEXT,
  source_type             TEXT NOT NULL,
  source_url              TEXT,
  source_name             TEXT,
  license_id              TEXT,
  attribution_text        TEXT,
  visibility              TEXT NOT NULL DEFAULT 'private',
  review_status           TEXT NOT NULL DEFAULT 'draft',
  servings                NUMERIC(6,2),
  servings_confidence     TEXT NOT NULL DEFAULT 'missing',
  serving_size_text       TEXT,
  scalable                BOOLEAN NOT NULL DEFAULT true,
  prep_time_minutes       INTEGER,
  cook_time_minutes       INTEGER,
  total_time_minutes      INTEGER,
  time_confidence         TEXT NOT NULL DEFAULT 'missing',
  meal_types              TEXT[] NOT NULL DEFAULT '{}',
  cuisine                 TEXT,
  difficulty              INTEGER,
  equipment_required      TEXT[] NOT NULL DEFAULT '{}',
  is_component            BOOLEAN NOT NULL DEFAULT false,
  tags                    TEXT[] NOT NULL DEFAULT '{}',
  -- Per-serving nutrition. NULL where the source never stated it.
  calories_kcal           NUMERIC(8,2),
  protein_g               NUMERIC(8,2),
  carbs_g                 NUMERIC(8,2),
  fat_g                   NUMERIC(8,2),
  fiber_g                 NUMERIC(8,2),
  sodium_mg               NUMERIC(8,2),
  nutrition_basis         TEXT,
  nutrition_confidence    TEXT,
  -- Universal plannability. Computed server-side; incomplete recipes stay
  -- viewable but are never auto-planned.
  base_meal_plan_eligible BOOLEAN NOT NULL DEFAULT false,
  missing_information     TEXT[] NOT NULL DEFAULT '{}',
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX recipes_owner_idx ON recipes (owner_user_id);
CREATE INDEX recipes_library_idx ON recipes (visibility, review_status) WHERE owner_user_id IS NULL;
CREATE INDEX recipes_tags_idx ON recipes USING GIN (tags);
CREATE INDEX recipes_meal_types_idx ON recipes USING GIN (meal_types);

-- One ingredient line. quantity NULL means the source never stated it; it is
-- never invented, and the recipe carries a missing_information note instead.
CREATE TABLE recipe_ingredients (
  id                  TEXT PRIMARY KEY,
  recipe_id           TEXT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  position            INTEGER NOT NULL,
  raw_text            TEXT NOT NULL,
  ingredient_id       TEXT REFERENCES ingredients(id) ON DELETE SET NULL,
  display_name        TEXT,
  quantity            NUMERIC(10,4),
  unit                TEXT,
  preparation         TEXT,
  grams               NUMERIC(10,2),
  is_optional         BOOLEAN NOT NULL DEFAULT false,
  is_to_taste         BOOLEAN NOT NULL DEFAULT false,
  missing_information TEXT,
  UNIQUE (recipe_id, position)
);

CREATE INDEX recipe_ingredients_recipe_idx ON recipe_ingredients (recipe_id);
CREATE INDEX recipe_ingredients_ingredient_idx ON recipe_ingredients (ingredient_id);

CREATE TABLE recipe_instructions (
  id        TEXT PRIMARY KEY,
  recipe_id TEXT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  step      INTEGER NOT NULL,
  text      TEXT NOT NULL,
  minutes   INTEGER,
  UNIQUE (recipe_id, step)
);

CREATE INDEX recipe_instructions_recipe_idx ON recipe_instructions (recipe_id);

-- A generated or hand-assembled week. `request` snapshots the questionnaire so
-- a plan can always be regenerated from what the user actually said.
CREATE TABLE meal_plans (
  id                    TEXT PRIMARY KEY,
  user_id               TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status                TEXT NOT NULL DEFAULT 'active',
  start_date            DATE NOT NULL,
  days                  INTEGER NOT NULL CHECK (days BETWEEN 1 AND 7),
  household_size        INTEGER NOT NULL CHECK (household_size > 0),
  request               JSONB NOT NULL,
  -- Costs are always a range with a confidence, never a bare number.
  budget_amount         NUMERIC(10,2),
  estimated_cost_point  NUMERIC(10,2),
  estimated_cost_low    NUMERIC(10,2),
  estimated_cost_high   NUMERIC(10,2),
  cost_confidence       TEXT,
  penny_message         TEXT NOT NULL DEFAULT '',
  assumptions           TEXT[] NOT NULL DEFAULT '{}',
  generation_source     TEXT NOT NULL DEFAULT 'deterministic',
  generation_version    TEXT NOT NULL DEFAULT 'v1',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX meal_plans_user_idx ON meal_plans (user_id, created_at DESC);
-- One active plan per user; moving a meal must not create a second.
CREATE UNIQUE INDEX meal_plans_one_active_idx ON meal_plans (user_id) WHERE status = 'active';

-- A recipe occupying one day/meal-type slot.
CREATE TABLE meal_plan_meals (
  id                      TEXT PRIMARY KEY,
  meal_plan_id            TEXT NOT NULL REFERENCES meal_plans(id) ON DELETE CASCADE,
  day                     INTEGER NOT NULL CHECK (day >= 1),
  meal_type               TEXT NOT NULL,
  recipe_id               TEXT NOT NULL REFERENCES recipes(id) ON DELETE RESTRICT,
  scale_factor            NUMERIC(6,3) NOT NULL DEFAULT 1,
  servings_planned        NUMERIC(6,2) NOT NULL,
  pantry_ingredient_ids   TEXT[] NOT NULL DEFAULT '{}',
  consumed_cost           NUMERIC(10,2),
  why                     TEXT,
  UNIQUE (meal_plan_id, day, meal_type)
);

CREATE INDEX meal_plan_meals_plan_idx ON meal_plan_meals (meal_plan_id);

CREATE TABLE grocery_lists (
  id                    TEXT PRIMARY KEY,
  meal_plan_id          TEXT NOT NULL REFERENCES meal_plans(id) ON DELETE CASCADE,
  user_id               TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  estimated_cost_point  NUMERIC(10,2),
  estimated_cost_low    NUMERIC(10,2),
  estimated_cost_high   NUMERIC(10,2),
  cost_confidence       TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (meal_plan_id)
);

CREATE INDEX grocery_lists_user_idx ON grocery_lists (user_id);

-- Consolidated across every recipe in the plan, pantry-aware. Items already in
-- the pantry are kept with in_pantry = true and zero cost, not hidden.
CREATE TABLE grocery_list_items (
  id               TEXT PRIMARY KEY,
  grocery_list_id  TEXT NOT NULL REFERENCES grocery_lists(id) ON DELETE CASCADE,
  ingredient_id    TEXT NOT NULL REFERENCES ingredients(id) ON DELETE RESTRICT,
  display_name     TEXT NOT NULL,
  needed_qty       NUMERIC(10,4) NOT NULL,
  unit             TEXT NOT NULL,
  packages         INTEGER,
  package_label    TEXT,
  estimated_price  NUMERIC(10,2) NOT NULL DEFAULT 0,
  price_tier       INTEGER,
  in_pantry        BOOLEAN NOT NULL DEFAULT false,
  is_checked       BOOLEAN NOT NULL DEFAULT false,
  used_by          TEXT[] NOT NULL DEFAULT '{}',
  UNIQUE (grocery_list_id, ingredient_id)
);

CREATE INDEX grocery_list_items_list_idx ON grocery_list_items (grocery_list_id);

CREATE TABLE saved_recipes (
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipe_id  TEXT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, recipe_id)
);

-- +goose Down
DROP TABLE IF EXISTS saved_recipes;
DROP TABLE IF EXISTS grocery_list_items;
DROP TABLE IF EXISTS grocery_lists;
DROP TABLE IF EXISTS meal_plan_meals;
DROP TABLE IF EXISTS meal_plans;
DROP TABLE IF EXISTS recipe_instructions;
DROP TABLE IF EXISTS recipe_ingredients;
DROP TABLE IF EXISTS recipes;
DROP TABLE IF EXISTS ingredient_prices;
DROP TABLE IF EXISTS ingredients;
