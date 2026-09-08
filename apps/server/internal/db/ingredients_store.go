package db

import (
	"context"
	"strings"

	"github.com/helpthehive/server/internal/domain/meals"
)

const ingredientColumns = `
	id, display_name, aisle, food_group, parent_ingredient_id, price_reference_unit,
	is_pantry_staple, assumed_on_hand, contains_meat, contains_poultry, contains_fish,
	contains_shellfish, contains_dairy, contains_egg, contains_gluten, contains_wheat,
	contains_soy, contains_peanut, contains_tree_nut, contains_sesame, contains_coconut,
	is_animal_derived`

func scanIngredient(row scanner) (meals.Ingredient, error) {
	var item meals.Ingredient
	err := row.Scan(
		&item.ID, &item.DisplayName, &item.Aisle, &item.FoodGroup, &item.ParentIngredientID,
		&item.PriceReferenceUnit, &item.IsPantryStaple, &item.AssumedOnHand, &item.ContainsMeat,
		&item.ContainsPoultry, &item.ContainsFish, &item.ContainsShellfish, &item.ContainsDairy,
		&item.ContainsEgg, &item.ContainsGluten, &item.ContainsWheat, &item.ContainsSoy,
		&item.ContainsPeanut, &item.ContainsTreeNut, &item.ContainsSesame, &item.ContainsCoconut,
		&item.IsAnimalDerived,
	)
	return item, err
}

// ListIngredients returns the whole catalogue. It is small, shared by every
// user and safe to load in one go — the planner needs allergen flags for every
// ingredient a candidate recipe might reference.
func (s *Store) ListIngredients(ctx context.Context) ([]meals.Ingredient, error) {
	rows, err := s.pool.Query(ctx, `SELECT`+ingredientColumns+` FROM ingredients ORDER BY display_name`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var items []meals.Ingredient
	for rows.Next() {
		item, err := scanIngredient(rows)
		if err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

// SearchIngredients backs the pantry and allergy pickers. An empty search
// returns the head of the catalogue rather than everything.
func (s *Store) SearchIngredients(ctx context.Context, search string, limit int) ([]meals.Ingredient, error) {
	search = strings.TrimSpace(search)
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	rows, err := s.pool.Query(ctx, `
		SELECT`+ingredientColumns+`
		FROM ingredients
		WHERE $1 = '' OR display_name ILIKE '%' || $1 || '%'
		ORDER BY display_name
		LIMIT $2
	`, search, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var items []meals.Ingredient
	for rows.Next() {
		item, err := scanIngredient(rows)
		if err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

// ListPricesForIngredients returns one price per ingredient: the lowest tier
// available, which is the most trustworthy estimate we hold.
func (s *Store) ListPricesForIngredients(ctx context.Context, ingredientIDs []string, scope string) ([]meals.IngredientPrice, error) {
	if len(ingredientIDs) == 0 {
		return nil, nil
	}
	if scope == "" {
		scope = "us"
	}
	rows, err := s.pool.Query(ctx, `
		SELECT DISTINCT ON (ingredient_id)
			id, ingredient_id, unit_price::float8, package_size::float8, divisible, tier, source, geographic_scope
		FROM ingredient_prices
		WHERE ingredient_id = ANY($1) AND geographic_scope = $2
		ORDER BY ingredient_id, tier ASC
	`, ingredientIDs, scope)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var prices []meals.IngredientPrice
	for rows.Next() {
		var price meals.IngredientPrice
		if err := rows.Scan(
			&price.ID, &price.IngredientID, &price.UnitPrice, &price.PackageSize,
			&price.Divisible, &price.Tier, &price.Source, &price.GeographicScope,
		); err != nil {
			return nil, err
		}
		prices = append(prices, price)
	}
	return prices, rows.Err()
}

// UpsertIngredient is used by seeding and by admin tooling. It is not reachable
// from the mobile app.
func (s *Store) UpsertIngredient(ctx context.Context, item meals.Ingredient) error {
	if item.ID == "" {
		item.ID = NewID()
	}
	_, err := s.pool.Exec(ctx, `
		INSERT INTO ingredients (`+ingredientColumns+`)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22)
		ON CONFLICT (id) DO UPDATE SET
			display_name = EXCLUDED.display_name,
			aisle = EXCLUDED.aisle,
			food_group = EXCLUDED.food_group,
			parent_ingredient_id = EXCLUDED.parent_ingredient_id,
			price_reference_unit = EXCLUDED.price_reference_unit,
			is_pantry_staple = EXCLUDED.is_pantry_staple,
			assumed_on_hand = EXCLUDED.assumed_on_hand,
			contains_meat = EXCLUDED.contains_meat,
			contains_poultry = EXCLUDED.contains_poultry,
			contains_fish = EXCLUDED.contains_fish,
			contains_shellfish = EXCLUDED.contains_shellfish,
			contains_dairy = EXCLUDED.contains_dairy,
			contains_egg = EXCLUDED.contains_egg,
			contains_gluten = EXCLUDED.contains_gluten,
			contains_wheat = EXCLUDED.contains_wheat,
			contains_soy = EXCLUDED.contains_soy,
			contains_peanut = EXCLUDED.contains_peanut,
			contains_tree_nut = EXCLUDED.contains_tree_nut,
			contains_sesame = EXCLUDED.contains_sesame,
			contains_coconut = EXCLUDED.contains_coconut,
			is_animal_derived = EXCLUDED.is_animal_derived,
			updated_at = now()
	`,
		item.ID, item.DisplayName, item.Aisle, item.FoodGroup, item.ParentIngredientID,
		item.PriceReferenceUnit, item.IsPantryStaple, item.AssumedOnHand, item.ContainsMeat,
		item.ContainsPoultry, item.ContainsFish, item.ContainsShellfish, item.ContainsDairy,
		item.ContainsEgg, item.ContainsGluten, item.ContainsWheat, item.ContainsSoy,
		item.ContainsPeanut, item.ContainsTreeNut, item.ContainsSesame, item.ContainsCoconut,
		item.IsAnimalDerived,
	)
	return err
}

func (s *Store) UpsertIngredientPrice(ctx context.Context, price meals.IngredientPrice) error {
	if price.ID == "" {
		price.ID = NewID()
	}
	if price.GeographicScope == "" {
		price.GeographicScope = "us"
	}
	_, err := s.pool.Exec(ctx, `
		INSERT INTO ingredient_prices (id, ingredient_id, unit_price, package_size, divisible, tier, source, geographic_scope)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		ON CONFLICT (ingredient_id, tier, geographic_scope) DO UPDATE SET
			unit_price = EXCLUDED.unit_price,
			package_size = EXCLUDED.package_size,
			divisible = EXCLUDED.divisible,
			source = EXCLUDED.source,
			updated_at = now()
	`, price.ID, price.IngredientID, price.UnitPrice, price.PackageSize, price.Divisible,
		price.Tier, price.Source, price.GeographicScope)
	return err
}
