-- +goose Up

-- Connect the pantry to the ingredient catalogue.
--
-- `pantry_items` has always stored a free-text `name`, while the meal generator
-- matches on canonical `ingredient_id`. The two never met: the questionnaire
-- collected pantry ids from the catalogue by hand, and what the user actually
-- kept in their pantry never reached a plan.
--
-- `name` and `quantity` are kept and stay authoritative for display, so every
-- existing row and every existing screen is unaffected.
ALTER TABLE pantry_items
  ADD COLUMN ingredient_id   TEXT REFERENCES ingredients(id) ON DELETE SET NULL,
  -- Numeric quantity beside the free-text one, for the day the planner can
  -- subtract what is on hand rather than treating the pantry as a yes/no.
  ADD COLUMN quantity_amount NUMERIC(10,4) CHECK (quantity_amount IS NULL OR quantity_amount >= 0),
  ADD COLUMN quantity_unit   TEXT,
  -- "Use this first": ranked above other pantry items when planning.
  ADD COLUMN use_first       BOOLEAN NOT NULL DEFAULT false;

-- Every generator read of this table is "this user's active pantry, by
-- ingredient".
CREATE INDEX pantry_items_user_ingredient_idx
  ON pantry_items (user_id, ingredient_id)
  WHERE ingredient_id IS NOT NULL AND status = 'ACTIVE';

-- +goose Down
DROP INDEX IF EXISTS pantry_items_user_ingredient_idx;
ALTER TABLE pantry_items
  DROP COLUMN IF EXISTS use_first,
  DROP COLUMN IF EXISTS quantity_unit,
  DROP COLUMN IF EXISTS quantity_amount,
  DROP COLUMN IF EXISTS ingredient_id;
