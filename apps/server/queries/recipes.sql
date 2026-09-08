-- name: ListLibraryRecipes :many
-- Public, approved recipes. Tag filtering is AND across the supplied tags;
-- meal_type narrows to recipes that declare it.
SELECT * FROM recipes
WHERE owner_user_id IS NULL
  AND visibility = 'public'
  AND review_status = 'approved'
  AND (sqlc.narg('tags')::text[] IS NULL OR tags @> sqlc.narg('tags')::text[])
  AND (sqlc.narg('meal_type')::text IS NULL OR sqlc.narg('meal_type')::text = ANY(meal_types))
  AND (sqlc.narg('search')::text IS NULL OR title ILIKE '%' || sqlc.narg('search')::text || '%')
ORDER BY title ASC;

-- name: ListPlannableRecipes :many
-- Everything the planner may draw from for this user: the approved library plus
-- their own recipes. Incomplete recipes are excluded — viewable, never planned.
SELECT * FROM recipes
WHERE base_meal_plan_eligible = true
  AND (
    (owner_user_id IS NULL AND visibility = 'public' AND review_status = 'approved')
    OR owner_user_id = sqlc.arg('user_id')
  );

-- name: GetRecipe :one
-- A recipe is readable when it is library content or owned by this user.
SELECT * FROM recipes
WHERE id = sqlc.arg('id')
  AND (owner_user_id IS NULL OR owner_user_id = sqlc.arg('user_id'));

-- name: ListRecipeIngredients :many
SELECT * FROM recipe_ingredients
WHERE recipe_id = ANY(sqlc.arg('recipe_ids')::text[])
ORDER BY recipe_id, position ASC;

-- name: ListRecipeInstructions :many
SELECT * FROM recipe_instructions
WHERE recipe_id = ANY(sqlc.arg('recipe_ids')::text[])
ORDER BY recipe_id, step ASC;

-- name: UpsertRecipe :one
-- Used by seeding and by recipe import. User recipes are forced private drafts
-- by the service layer; only library content may be public.
INSERT INTO recipes (
  id, owner_user_id, title, description, source_type, source_url, source_name,
  license_id, attribution_text, visibility, review_status, servings,
  servings_confidence, serving_size_text, scalable, prep_time_minutes,
  cook_time_minutes, total_time_minutes, time_confidence, meal_types, cuisine,
  difficulty, equipment_required, is_component, tags, calories_kcal, protein_g,
  carbs_g, fat_g, fiber_g, sodium_mg, nutrition_basis, nutrition_confidence,
  base_meal_plan_eligible, missing_information
) VALUES (
  $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,
  $22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35
)
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  servings = EXCLUDED.servings,
  total_time_minutes = EXCLUDED.total_time_minutes,
  meal_types = EXCLUDED.meal_types,
  tags = EXCLUDED.tags,
  base_meal_plan_eligible = EXCLUDED.base_meal_plan_eligible,
  missing_information = EXCLUDED.missing_information,
  updated_at = now()
RETURNING *;

-- name: DeleteRecipeChildren :exec
DELETE FROM recipe_ingredients WHERE recipe_id = $1;

-- name: DeleteRecipeInstructions :exec
DELETE FROM recipe_instructions WHERE recipe_id = $1;

-- name: InsertRecipeIngredient :exec
INSERT INTO recipe_ingredients (
  id, recipe_id, position, raw_text, ingredient_id, display_name, quantity,
  unit, preparation, grams, is_optional, is_to_taste, missing_information
) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13);

-- name: InsertRecipeInstruction :exec
INSERT INTO recipe_instructions (id, recipe_id, step, text, minutes)
VALUES ($1,$2,$3,$4,$5);

-- name: SaveRecipeForUser :exec
INSERT INTO saved_recipes (user_id, recipe_id) VALUES ($1, $2)
ON CONFLICT DO NOTHING;

-- name: UnsaveRecipeForUser :exec
DELETE FROM saved_recipes WHERE user_id = $1 AND recipe_id = $2;

-- name: ListSavedRecipes :many
SELECT r.* FROM recipes r
JOIN saved_recipes s ON s.recipe_id = r.id
WHERE s.user_id = $1
ORDER BY s.created_at DESC;
