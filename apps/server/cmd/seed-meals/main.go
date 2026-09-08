// Command seed-meals loads the Help The Hive seed library — the ingredient
// catalogue, its price estimates and the starter recipes — into the database.
//
// It is idempotent: every row is an upsert keyed on the id the fixture carries,
// so running it twice changes nothing. It only ever writes library rows
// (owner_user_id NULL); it never touches a user's own recipes, plans or lists.
package main

import (
	"context"
	"embed"
	"encoding/json"
	"fmt"
	"os"
	"time"

	"github.com/helpthehive/server/internal/db"
)

//go:embed data/*.json
var seedFS embed.FS

func main() {
	if err := run(); err != nil {
		_, _ = fmt.Fprintf(os.Stderr, "seed-meals: %v\n", err)
		os.Exit(1)
	}
}

func run() error {
	databaseURL := os.Getenv("DATABASE_URL")
	if databaseURL == "" {
		return fmt.Errorf("DATABASE_URL is required")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()

	pool, err := db.Connect(ctx, databaseURL)
	if err != nil {
		return err
	}
	defer pool.Close()
	store := db.NewStore(pool)

	ingredients, err := load[seedIngredient]("data/ingredient_catalog.json")
	if err != nil {
		return err
	}
	prices, err := load[seedPrice]("data/price_estimates.json")
	if err != nil {
		return err
	}
	recipes, err := load[seedRecipe]("data/seed_recipes.json")
	if err != nil {
		return err
	}

	// Ingredients first: prices and recipe lines both reference them.
	for _, ingredient := range ingredients {
		if err := store.UpsertIngredient(ctx, ingredient.toDomain()); err != nil {
			return fmt.Errorf("ingredient %s: %w", ingredient.IngredientID, err)
		}
	}
	for _, price := range prices {
		if err := store.UpsertIngredientPrice(ctx, price.toDomain()); err != nil {
			return fmt.Errorf("price for %s: %w", price.IngredientID, err)
		}
	}
	for _, recipe := range recipes {
		if err := store.UpsertRecipe(ctx, recipe.toDomain()); err != nil {
			return fmt.Errorf("recipe %s: %w", recipe.RecipeID, err)
		}
	}

	fmt.Printf("seeded %d ingredients, %d prices, %d recipes\n",
		len(ingredients), len(prices), len(recipes))
	return nil
}

func load[T any](name string) ([]T, error) {
	raw, err := seedFS.ReadFile(name)
	if err != nil {
		return nil, err
	}
	var values []T
	if err := json.Unmarshal(raw, &values); err != nil {
		return nil, fmt.Errorf("%s: %w", name, err)
	}
	return values, nil
}
