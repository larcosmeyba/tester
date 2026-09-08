-- +goose Up

-- Meal prep: the batch work a plan makes possible.
--
-- Derived from a plan, never entered by hand. A prep plan is a view of work
-- that is already implied by the week's recipes — the same onion diced once
-- instead of four times, the same grain cooked once for three dinners — so it
-- is recomputed from the plan rather than being a second thing to keep in sync.
CREATE TABLE meal_prep_plans (
  id                   TEXT PRIMARY KEY,
  meal_plan_id         TEXT NOT NULL REFERENCES meal_plans(id) ON DELETE CASCADE,
  user_id              TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- Sum of the tasks' active minutes. Hands-on time, not elapsed time.
  total_active_minutes INTEGER NOT NULL DEFAULT 0,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (meal_plan_id)
);

CREATE INDEX meal_prep_plans_user_idx ON meal_prep_plans (user_id);

-- One piece of prep work.
--
-- kind is `batch_ingredient` (one ingredient prepared once for several meals)
-- or `batch_cook` (a whole recipe cooked once for several servings).
CREATE TABLE meal_prep_tasks (
  id              TEXT PRIMARY KEY,
  prep_plan_id    TEXT NOT NULL REFERENCES meal_prep_plans(id) ON DELETE CASCADE,
  position        INTEGER NOT NULL,
  kind            TEXT NOT NULL,
  title           TEXT NOT NULL,
  instruction     TEXT NOT NULL,
  active_minutes  INTEGER NOT NULL DEFAULT 0 CHECK (active_minutes >= 0),
  -- How much to prepare, in the ingredient's own reference unit. NULL when a
  -- quantity was never stated: it is never invented, and the task says so.
  portion_amount  NUMERIC(10,4),
  portion_unit    TEXT,
  -- refrigerate | freeze | pantry
  storage         TEXT NOT NULL DEFAULT 'refrigerate',
  -- How long the prepared item keeps, in days.
  keeps_days      INTEGER CHECK (keeps_days IS NULL OR keeps_days > 0),
  ingredient_ids  TEXT[] NOT NULL DEFAULT '{}',
  -- Which meals in the plan consume this. Stored so the app can answer "what
  -- is this for" without re-deriving the whole plan.
  recipe_ids      TEXT[] NOT NULL DEFAULT '{}',
  serves_slots    TEXT[] NOT NULL DEFAULT '{}',
  is_done         BOOLEAN NOT NULL DEFAULT false,
  UNIQUE (prep_plan_id, position)
);

CREATE INDEX meal_prep_tasks_plan_idx ON meal_prep_tasks (prep_plan_id);

-- +goose Down
DROP TABLE IF EXISTS meal_prep_tasks;
DROP TABLE IF EXISTS meal_prep_plans;
