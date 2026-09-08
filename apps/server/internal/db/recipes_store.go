package db

import (
	"context"
	"strings"

	"github.com/helpthehive/server/internal/domain/meals"
)

const recipeColumns = `
	id, owner_user_id, title, description, source_type, source_url, source_name, license_id,
	attribution_text, visibility, review_status, servings::float8, servings_confidence,
	serving_size_text, scalable, prep_time_minutes, cook_time_minutes, total_time_minutes,
	time_confidence, meal_types, cuisine, difficulty, equipment_required, is_component, tags,
	calories_kcal::float8, protein_g::float8, carbs_g::float8, fat_g::float8, fiber_g::float8,
	sodium_mg::float8, nutrition_basis, nutrition_confidence, base_meal_plan_eligible,
	missing_information`

func scanRecipe(row scanner) (meals.Recipe, error) {
	var r meals.Recipe
	err := row.Scan(
		&r.ID, &r.OwnerUserID, &r.Title, &r.Description, &r.SourceType, &r.SourceURL,
		&r.SourceName, &r.LicenseID, &r.AttributionText, &r.Visibility, &r.ReviewStatus,
		&r.Servings, &r.ServingsConfidence, &r.ServingSizeText, &r.Scalable,
		&r.PrepTimeMinutes, &r.CookTimeMinutes, &r.TotalTimeMinutes, &r.TimeConfidence,
		&r.MealTypes, &r.Cuisine, &r.Difficulty, &r.EquipmentRequired, &r.IsComponent, &r.Tags,
		&r.CaloriesKcal, &r.ProteinG, &r.CarbsG, &r.FatG, &r.FiberG, &r.SodiumMg,
		&r.NutritionBasis, &r.NutritionConfidence, &r.BaseMealPlanEligible, &r.MissingInformation,
	)
	return r, err
}

// ListRecipes returns the public library plus the user's own recipes. Passing an
// empty userID returns the public library alone.
func (s *Store) ListRecipes(ctx context.Context, userID string, filter meals.RecipeFilter) ([]meals.Recipe, error) {
	limit := filter.Limit
	if limit <= 0 || limit > 200 {
		limit = 100
	}
	rows, err := s.pool.Query(ctx, `
		SELECT`+recipeColumns+`
		FROM recipes r
		WHERE (
		        (r.owner_user_id IS NULL AND r.visibility = 'public' AND r.review_status = 'approved')
		     OR (r.owner_user_id = $1)
		      )
		  AND ($2::text[] IS NULL OR r.tags @> $2)
		  AND ($3::text = '' OR $3 = ANY(r.meal_types))
		  AND ($4::text = '' OR r.title ILIKE '%' || $4 || '%')
		  AND (NOT $5::boolean OR r.base_meal_plan_eligible)
		  AND (NOT $6::boolean OR EXISTS (
		        SELECT 1 FROM saved_recipes sr WHERE sr.recipe_id = r.id AND sr.user_id = $1))
		ORDER BY r.owner_user_id NULLS LAST, r.title
		LIMIT $7
	`, nullableString(userID), nullableStrings(filter.TagIDs), filter.MealType,
		strings.TrimSpace(filter.Search), filter.PlannableOnly, filter.SavedOnly, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var recipes []meals.Recipe
	for rows.Next() {
		recipe, err := scanRecipe(rows)
		if err != nil {
			return nil, err
		}
		recipes = append(recipes, recipe)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return s.attachRecipeChildren(ctx, recipes)
}

// GetRecipe returns one recipe the user is allowed to see: a public library
// recipe, or one they own. Anything else is reported as not found rather than
// as forbidden, so the query cannot be used to probe for other users' recipes.
func (s *Store) GetRecipe(ctx context.Context, userID string, recipeID string) (meals.Recipe, error) {
	row := s.pool.QueryRow(ctx, `
		SELECT`+recipeColumns+`
		FROM recipes r
		WHERE r.id = $2
		  AND (
		        (r.owner_user_id IS NULL AND r.visibility = 'public' AND r.review_status = 'approved')
		     OR (r.owner_user_id = $1)
		      )
	`, nullableString(userID), recipeID)
	recipe, err := scanRecipe(row)
	if err != nil {
		return meals.Recipe{}, err
	}
	loaded, err := s.attachRecipeChildren(ctx, []meals.Recipe{recipe})
	if err != nil {
		return meals.Recipe{}, err
	}
	return loaded[0], nil
}

// ListRecipesByIDs is the planner's bulk loader. It applies the same visibility
// rule as GetRecipe, so a plan can never reference a recipe the user cannot see.
func (s *Store) ListRecipesByIDs(ctx context.Context, userID string, recipeIDs []string) ([]meals.Recipe, error) {
	if len(recipeIDs) == 0 {
		return nil, nil
	}
	rows, err := s.pool.Query(ctx, `
		SELECT`+recipeColumns+`
		FROM recipes r
		WHERE r.id = ANY($2)
		  AND (
		        (r.owner_user_id IS NULL AND r.visibility = 'public' AND r.review_status = 'approved')
		     OR (r.owner_user_id = $1)
		      )
	`, nullableString(userID), recipeIDs)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var recipes []meals.Recipe
	for rows.Next() {
		recipe, err := scanRecipe(rows)
		if err != nil {
			return nil, err
		}
		recipes = append(recipes, recipe)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return s.attachRecipeChildren(ctx, recipes)
}

// attachRecipeChildren loads ingredient lines and instructions for a whole page
// of recipes in two queries rather than two per recipe.
func (s *Store) attachRecipeChildren(ctx context.Context, recipes []meals.Recipe) ([]meals.Recipe, error) {
	if len(recipes) == 0 {
		return recipes, nil
	}
	ids := make([]string, 0, len(recipes))
	index := make(map[string]int, len(recipes))
	for i, recipe := range recipes {
		ids = append(ids, recipe.ID)
		index[recipe.ID] = i
	}

	ingredientRows, err := s.pool.Query(ctx, `
		SELECT id, recipe_id, position, raw_text, ingredient_id, display_name, quantity::float8,
		       unit, preparation, grams::float8, is_optional, is_to_taste, missing_information
		FROM recipe_ingredients
		WHERE recipe_id = ANY($1)
		ORDER BY recipe_id, position
	`, ids)
	if err != nil {
		return nil, err
	}
	defer ingredientRows.Close()
	for ingredientRows.Next() {
		var line meals.RecipeIngredient
		if err := ingredientRows.Scan(
			&line.ID, &line.RecipeID, &line.Position, &line.RawText, &line.IngredientID,
			&line.DisplayName, &line.Quantity, &line.Unit, &line.Preparation, &line.Grams,
			&line.IsOptional, &line.IsToTaste, &line.MissingInformation,
		); err != nil {
			return nil, err
		}
		if i, ok := index[line.RecipeID]; ok {
			recipes[i].Ingredients = append(recipes[i].Ingredients, line)
		}
	}
	if err := ingredientRows.Err(); err != nil {
		return nil, err
	}

	instructionRows, err := s.pool.Query(ctx, `
		SELECT id, recipe_id, step, text, minutes
		FROM recipe_instructions
		WHERE recipe_id = ANY($1)
		ORDER BY recipe_id, step
	`, ids)
	if err != nil {
		return nil, err
	}
	defer instructionRows.Close()
	for instructionRows.Next() {
		var step meals.RecipeInstruction
		if err := instructionRows.Scan(&step.ID, &step.RecipeID, &step.Step, &step.Text, &step.Minutes); err != nil {
			return nil, err
		}
		if i, ok := index[step.RecipeID]; ok {
			recipes[i].Instructions = append(recipes[i].Instructions, step)
		}
	}
	return recipes, instructionRows.Err()
}

func (s *Store) SaveRecipeForUser(ctx context.Context, userID string, recipeID string) (bool, error) {
	tag, err := s.pool.Exec(ctx, `
		INSERT INTO saved_recipes (user_id, recipe_id)
		SELECT $1, r.id
		FROM recipes r
		WHERE r.id = $2
		  AND (
		        (r.owner_user_id IS NULL AND r.visibility = 'public' AND r.review_status = 'approved')
		     OR (r.owner_user_id = $1)
		      )
		ON CONFLICT DO NOTHING
	`, userID, recipeID)
	if err != nil {
		return false, err
	}
	return tag.RowsAffected() > 0, nil
}

func (s *Store) UnsaveRecipeForUser(ctx context.Context, userID string, recipeID string) (bool, error) {
	tag, err := s.pool.Exec(ctx, `DELETE FROM saved_recipes WHERE user_id = $1 AND recipe_id = $2`, userID, recipeID)
	if err != nil {
		return false, err
	}
	return tag.RowsAffected() > 0, nil
}

// UpsertRecipe writes a recipe and replaces its lines and steps. Seeding and
// the recipe-import paths use it; it is not exposed to the mobile app.
func (s *Store) UpsertRecipe(ctx context.Context, recipe meals.Recipe) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	if _, err := tx.Exec(ctx, `
		INSERT INTO recipes (`+recipeColumnsForWrite+`)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18,
		        $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, $35)
		ON CONFLICT (id) DO UPDATE SET
			owner_user_id = EXCLUDED.owner_user_id,
			title = EXCLUDED.title,
			description = EXCLUDED.description,
			source_type = EXCLUDED.source_type,
			source_url = EXCLUDED.source_url,
			source_name = EXCLUDED.source_name,
			license_id = EXCLUDED.license_id,
			attribution_text = EXCLUDED.attribution_text,
			visibility = EXCLUDED.visibility,
			review_status = EXCLUDED.review_status,
			servings = EXCLUDED.servings,
			servings_confidence = EXCLUDED.servings_confidence,
			serving_size_text = EXCLUDED.serving_size_text,
			scalable = EXCLUDED.scalable,
			prep_time_minutes = EXCLUDED.prep_time_minutes,
			cook_time_minutes = EXCLUDED.cook_time_minutes,
			total_time_minutes = EXCLUDED.total_time_minutes,
			time_confidence = EXCLUDED.time_confidence,
			meal_types = EXCLUDED.meal_types,
			cuisine = EXCLUDED.cuisine,
			difficulty = EXCLUDED.difficulty,
			equipment_required = EXCLUDED.equipment_required,
			is_component = EXCLUDED.is_component,
			tags = EXCLUDED.tags,
			calories_kcal = EXCLUDED.calories_kcal,
			protein_g = EXCLUDED.protein_g,
			carbs_g = EXCLUDED.carbs_g,
			fat_g = EXCLUDED.fat_g,
			fiber_g = EXCLUDED.fiber_g,
			sodium_mg = EXCLUDED.sodium_mg,
			nutrition_basis = EXCLUDED.nutrition_basis,
			nutrition_confidence = EXCLUDED.nutrition_confidence,
			base_meal_plan_eligible = EXCLUDED.base_meal_plan_eligible,
			missing_information = EXCLUDED.missing_information,
			updated_at = now()
	`,
		recipe.ID, recipe.OwnerUserID, recipe.Title, recipe.Description, recipe.SourceType,
		recipe.SourceURL, recipe.SourceName, recipe.LicenseID, recipe.AttributionText,
		recipe.Visibility, recipe.ReviewStatus, recipe.Servings, recipe.ServingsConfidence,
		recipe.ServingSizeText, recipe.Scalable, recipe.PrepTimeMinutes, recipe.CookTimeMinutes,
		recipe.TotalTimeMinutes, recipe.TimeConfidence, textArray(recipe.MealTypes), recipe.Cuisine,
		recipe.Difficulty, textArray(recipe.EquipmentRequired), recipe.IsComponent, textArray(recipe.Tags),
		recipe.CaloriesKcal, recipe.ProteinG, recipe.CarbsG, recipe.FatG, recipe.FiberG,
		recipe.SodiumMg, recipe.NutritionBasis, recipe.NutritionConfidence,
		recipe.BaseMealPlanEligible, textArray(recipe.MissingInformation),
	); err != nil {
		return err
	}

	if _, err := tx.Exec(ctx, `DELETE FROM recipe_ingredients WHERE recipe_id = $1`, recipe.ID); err != nil {
		return err
	}
	for _, line := range recipe.Ingredients {
		id := line.ID
		if id == "" {
			id = NewID()
		}
		if _, err := tx.Exec(ctx, `
			INSERT INTO recipe_ingredients (id, recipe_id, position, raw_text, ingredient_id, display_name,
			                                quantity, unit, preparation, grams, is_optional, is_to_taste, missing_information)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
		`, id, recipe.ID, line.Position, line.RawText, line.IngredientID, line.DisplayName,
			line.Quantity, line.Unit, line.Preparation, line.Grams, line.IsOptional,
			line.IsToTaste, line.MissingInformation); err != nil {
			return err
		}
	}

	if _, err := tx.Exec(ctx, `DELETE FROM recipe_instructions WHERE recipe_id = $1`, recipe.ID); err != nil {
		return err
	}
	for _, step := range recipe.Instructions {
		id := step.ID
		if id == "" {
			id = NewID()
		}
		if _, err := tx.Exec(ctx, `
			INSERT INTO recipe_instructions (id, recipe_id, step, text, minutes)
			VALUES ($1, $2, $3, $4, $5)
		`, id, recipe.ID, step.Step, step.Text, step.Minutes); err != nil {
			return err
		}
	}

	return tx.Commit(ctx)
}

const recipeColumnsForWrite = `
	id, owner_user_id, title, description, source_type, source_url, source_name, license_id,
	attribution_text, visibility, review_status, servings, servings_confidence,
	serving_size_text, scalable, prep_time_minutes, cook_time_minutes, total_time_minutes,
	time_confidence, meal_types, cuisine, difficulty, equipment_required, is_component, tags,
	calories_kcal, protein_g, carbs_g, fat_g, fiber_g, sodium_mg, nutrition_basis,
	nutrition_confidence, base_meal_plan_eligible, missing_information`

// nullableString keeps an empty user id out of an ownership comparison: an
// anonymous caller must not match a row whose owner_user_id happens to be ”.
func nullableString(value string) *string {
	if value == "" {
		return nil
	}
	return &value
}

// textArray keeps a nil Go slice out of a NOT NULL text[] column: pgx encodes
// nil as SQL NULL, which the meal tables reject. Callers should not have to
// remember that, so every write goes through here.
func textArray(values []string) []string {
	if values == nil {
		return []string{}
	}
	return values
}

func nullableStrings(values []string) []string {
	if len(values) == 0 {
		return nil
	}
	return values
}
