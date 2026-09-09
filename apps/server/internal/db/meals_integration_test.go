package db

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"testing"
	"time"

	_ "github.com/jackc/pgx/v5/stdlib"

	"github.com/helpthehive/server/internal/domain/meals"
)

// These tests exist for one reason: to prove that the meal tables cannot be
// read or written across users. Every assertion below is about somebody else's
// data being invisible, not about a feature working.
func TestMealDataIsScopedToItsOwner(t *testing.T) {
	databaseURL := os.Getenv("TEST_DATABASE_URL")
	if databaseURL == "" {
		t.Skip("TEST_DATABASE_URL is not set")
	}

	ctx := context.Background()
	runMigrations(t, databaseURL)

	pool, err := Connect(ctx, databaseURL)
	if err != nil {
		t.Fatalf("Connect() error = %v", err)
	}
	defer pool.Close()
	store := NewStore(pool)

	stamp := time.Now().UnixNano()
	viewerA, err := store.EnsureViewer(ctx, fmt.Sprintf("meal-user-a-%d", stamp), stringPtr("a@example.com"))
	if err != nil {
		t.Fatalf("EnsureViewer(A) error = %v", err)
	}
	viewerB, err := store.EnsureViewer(ctx, fmt.Sprintf("meal-user-b-%d", stamp), stringPtr("b@example.com"))
	if err != nil {
		t.Fatalf("EnsureViewer(B) error = %v", err)
	}
	userA, userB := viewerA.User.ID, viewerB.User.ID

	ingredientID := fmt.Sprintf("test-rice-%d", stamp)
	if err := store.UpsertIngredient(ctx, meals.Ingredient{
		ID: ingredientID, DisplayName: "Rice", Aisle: "pantry",
		FoodGroup: "grain", PriceReferenceUnit: "lb",
	}); err != nil {
		t.Fatalf("UpsertIngredient() error = %v", err)
	}

	libraryRecipeID := fmt.Sprintf("test-library-%d", stamp)
	if err := store.UpsertRecipe(ctx, testRecipe(libraryRecipeID, nil, "public", "approved", ingredientID)); err != nil {
		t.Fatalf("UpsertRecipe(library) error = %v", err)
	}
	privateRecipeID := fmt.Sprintf("test-private-%d", stamp)
	if err := store.UpsertRecipe(ctx, testRecipe(privateRecipeID, &userA, "private", "draft", ingredientID)); err != nil {
		t.Fatalf("UpsertRecipe(private) error = %v", err)
	}

	t.Run("a private recipe is invisible to another user", func(t *testing.T) {
		if _, err := store.GetRecipe(ctx, userA, privateRecipeID); err != nil {
			t.Fatalf("the owner could not read their own recipe: %v", err)
		}
		if _, err := store.GetRecipe(ctx, userB, privateRecipeID); !IsNotFound(err) {
			t.Fatalf("GetRecipe(other user) error = %v, want not found", err)
		}
		// The public library is still shared.
		if _, err := store.GetRecipe(ctx, userB, libraryRecipeID); err != nil {
			t.Fatalf("the public library recipe was not readable: %v", err)
		}
	})

	plan, err := store.SaveMealPlan(ctx, testPlan(userA, libraryRecipeID))
	if err != nil {
		t.Fatalf("SaveMealPlan() error = %v", err)
	}

	t.Run("a plan is invisible to another user", func(t *testing.T) {
		if _, err := store.GetMealPlan(ctx, userA, plan.ID); err != nil {
			t.Fatalf("the owner could not read their own plan: %v", err)
		}
		if _, err := store.GetMealPlan(ctx, userB, plan.ID); !IsNotFound(err) {
			t.Fatalf("GetMealPlan(other user) error = %v, want not found", err)
		}
		if _, err := store.GetActiveMealPlan(ctx, userB); !IsNotFound(err) {
			t.Fatalf("GetActiveMealPlan(B) error = %v, want not found", err)
		}
	})

	t.Run("another user cannot move or delete a plan's meals", func(t *testing.T) {
		err := store.MoveMealPlanMeal(ctx, userB, plan.ID, 1, "dinner", 2, "dinner")
		if err == nil {
			t.Fatal("another user moved a meal in a plan they do not own")
		}
		if deleted, err := store.DeleteMealPlan(ctx, userB, plan.ID); err != nil || deleted {
			t.Fatalf("DeleteMealPlan(other user) = %v, %v; want false, nil", deleted, err)
		}
		// The owner's plan is untouched.
		if _, err := store.GetMealPlan(ctx, userA, plan.ID); err != nil {
			t.Fatalf("the owner's plan was affected: %v", err)
		}
	})

	t.Run("a grocery list cannot be read or ticked by another user", func(t *testing.T) {
		if _, err := store.SaveGroceryList(ctx, meals.GroceryList{
			MealPlanID: plan.ID,
			UserID:     userA,
			Items: []meals.GroceryListItem{{
				IngredientID: ingredientID, DisplayName: "Rice",
				NeededQty: 2, Unit: "lb", EstimatedPrice: 2.00,
			}},
		}); err != nil {
			t.Fatalf("SaveGroceryList() error = %v", err)
		}

		if _, err := store.GetGroceryList(ctx, userA, plan.ID); err != nil {
			t.Fatalf("the owner could not read their own list: %v", err)
		}
		if _, err := store.GetGroceryList(ctx, userB, plan.ID); !IsNotFound(err) {
			t.Fatalf("GetGroceryList(other user) error = %v, want not found", err)
		}

		updated, err := store.SetGroceryItemChecked(ctx, userB, plan.ID, ingredientID, true)
		if err != nil || updated {
			t.Fatalf("SetGroceryItemChecked(other user) = %v, %v; want false, nil", updated, err)
		}
		updated, err = store.SetGroceryItemChecked(ctx, userA, plan.ID, ingredientID, true)
		if err != nil || !updated {
			t.Fatalf("SetGroceryItemChecked(owner) = %v, %v; want true, nil", updated, err)
		}
	})

	t.Run("a user cannot write a list against another user's plan", func(t *testing.T) {
		// The insert selects the plan by (id, user_id), so it matches no row.
		_, err := store.SaveGroceryList(ctx, meals.GroceryList{MealPlanID: plan.ID, UserID: userB})
		if err == nil {
			t.Fatal("a grocery list was written against a plan the user does not own")
		}
	})

	t.Run("generating again archives the previous plan", func(t *testing.T) {
		second, err := store.SaveMealPlan(ctx, testPlan(userA, libraryRecipeID))
		if err != nil {
			t.Fatalf("SaveMealPlan(second) error = %v", err)
		}
		active, err := store.GetActiveMealPlan(ctx, userA)
		if err != nil {
			t.Fatalf("GetActiveMealPlan() error = %v", err)
		}
		if active.ID != second.ID {
			t.Fatalf("active plan = %s, want the newest plan %s", active.ID, second.ID)
		}
		// The old plan is still readable by id, just no longer active.
		previous, err := store.GetMealPlan(ctx, userA, plan.ID)
		if err != nil {
			t.Fatalf("GetMealPlan(previous) error = %v", err)
		}
		if previous.Status != "archived" {
			t.Fatalf("previous plan status = %q, want archived", previous.Status)
		}
	})

	t.Run("saving a recipe is per user", func(t *testing.T) {
		if _, err := store.SaveRecipeForUser(ctx, userA, libraryRecipeID); err != nil {
			t.Fatalf("SaveRecipeForUser() error = %v", err)
		}
		saved, err := store.ListRecipes(ctx, userB, meals.RecipeFilter{SavedOnly: true})
		if err != nil {
			t.Fatalf("ListRecipes(saved, B) error = %v", err)
		}
		for _, recipe := range saved {
			if recipe.ID == libraryRecipeID {
				t.Fatal("one user's saved recipe appeared in another user's list")
			}
		}

		// Saving another user's private recipe matches no row, so nothing is saved.
		savedPrivate, err := store.SaveRecipeForUser(ctx, userB, privateRecipeID)
		if err != nil {
			t.Fatalf("SaveRecipeForUser(private) error = %v", err)
		}
		if savedPrivate {
			t.Fatal("a user saved a recipe they are not allowed to see")
		}
	})
}

func testRecipe(id string, owner *string, visibility string, reviewStatus string, ingredientID string) meals.Recipe {
	servings := 4.0
	quantity := 2.0
	unit := "lb"
	return meals.Recipe{
		ID:                   id,
		OwnerUserID:          owner,
		Title:                "Test meals.Recipe " + id,
		SourceType:           "hth_library",
		Visibility:           visibility,
		ReviewStatus:         reviewStatus,
		Servings:             &servings,
		ServingsConfidence:   "source",
		Scalable:             true,
		TimeConfidence:       "source",
		MealTypes:            []string{"dinner"},
		EquipmentRequired:    []string{"stovetop"},
		Tags:                 []string{},
		MissingInformation:   []string{},
		BaseMealPlanEligible: true,
		Ingredients: []meals.RecipeIngredient{{
			Position: 1, RawText: "2 lb rice", IngredientID: &ingredientID,
			Quantity: &quantity, Unit: &unit,
		}},
		Instructions: []meals.RecipeInstruction{{Step: 1, Text: "Cook the rice."}},
	}
}

func testPlan(userID string, recipeID string) meals.MealPlan {
	request, _ := json.Marshal(map[string]any{"days": 2, "household": map[string]any{"size": 4}})
	return meals.MealPlan{
		UserID:            userID,
		StartDate:         time.Now().UTC(),
		Days:              2,
		HouseholdSize:     4,
		Request:           request,
		Assumptions:       []string{},
		GenerationSource:  "deterministic",
		GenerationVersion: "v1",
		Meals: []meals.MealPlanMeal{{
			Day: 1, MealType: "dinner", RecipeID: recipeID,
			ScaleFactor: 1, ServingsPlanned: 4, PantryIngredientIDs: []string{},
		}},
	}
}
