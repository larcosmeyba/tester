-- name: ListIngredients :many
SELECT * FROM ingredients ORDER BY display_name ASC;

-- name: ListIngredientsByIDs :many
SELECT * FROM ingredients WHERE id = ANY(sqlc.arg('ids')::text[]);

-- name: SearchIngredients :many
SELECT * FROM ingredients
WHERE display_name ILIKE '%' || sqlc.arg('query')::text || '%'
   OR id ILIKE '%' || sqlc.arg('query')::text || '%'
ORDER BY display_name ASC
LIMIT sqlc.arg('limit_count');

-- name: UpsertIngredient :exec
INSERT INTO ingredients (
  id, display_name, aisle, food_group, parent_ingredient_id,
  price_reference_unit, is_pantry_staple, assumed_on_hand,
  contains_meat, contains_poultry, contains_fish, contains_shellfish,
  contains_dairy, contains_egg, contains_gluten, contains_wheat, contains_soy,
  contains_peanut, contains_tree_nut, contains_sesame, contains_coconut,
  is_animal_derived
) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
ON CONFLICT (id) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  aisle = EXCLUDED.aisle,
  food_group = EXCLUDED.food_group,
  parent_ingredient_id = EXCLUDED.parent_ingredient_id,
  price_reference_unit = EXCLUDED.price_reference_unit,
  updated_at = now();

-- name: ListPricesForIngredients :many
-- Best (lowest) tier per ingredient wins; the service falls back to a parent
-- ingredient when a child has no price of its own.
SELECT DISTINCT ON (ingredient_id) *
FROM ingredient_prices
WHERE ingredient_id = ANY(sqlc.arg('ids')::text[])
ORDER BY ingredient_id, tier ASC;

-- name: UpsertIngredientPrice :exec
INSERT INTO ingredient_prices (
  id, ingredient_id, unit_price, package_size, divisible, tier, source, geographic_scope
) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
ON CONFLICT (ingredient_id, tier, geographic_scope) DO UPDATE SET
  unit_price = EXCLUDED.unit_price,
  package_size = EXCLUDED.package_size,
  divisible = EXCLUDED.divisible,
  source = EXCLUDED.source,
  updated_at = now();
