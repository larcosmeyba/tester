package meals

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"os"
	"testing"
	"time"

	_ "github.com/jackc/pgx/v5/stdlib"
	"github.com/pressly/goose/v3"

	"github.com/helpthehive/server/internal/auth"
	"github.com/helpthehive/server/internal/db"
	"github.com/helpthehive/server/internal/modules/meals/generator"
	"github.com/helpthehive/server/internal/modules/users"
)

// An end-to-end pass through the real service and real SQL: generate a plan,
// read it back, accept it, tick an item off, swap a meal, move a meal — and
// confirm none of it is reachable by a second user.
func TestMealServiceEndToEnd(t *testing.T) {
	databaseURL := os.Getenv("TEST_DATABASE_URL")
	if databaseURL == "" {
		t.Skip("TEST_DATABASE_URL is not set")
	}

	ctx := context.Background()
	migrate(t, databaseURL)

	pool, err := db.Connect(ctx, databaseURL)
	if err != nil {
		t.Fatalf("Connect() error = %v", err)
	}
	defer pool.Close()

	store := db.NewStore(pool)
	service := NewService(store, users.NewService(store), generator.Disabled{}, nil)

	stamp := time.Now().UnixNano()
	owner := auth.Identity{Subject: fmt.Sprintf("meal-service-owner-%d", stamp)}
	other := auth.Identity{Subject: fmt.Sprintf("meal-service-other-%d", stamp)}

	riceID := seedFixtures(t, ctx, store, stamp)

	request := baseRequest()
	request.PantryItems = []string{riceID}
	// One dinner across two days, so there is a free slot to move a meal into.
	request.Meals = MealCounts{Dinner: 1}

	plan, err := service.Generate(ctx, owner, request)
	if err != nil {
		t.Fatalf("Generate() error = %v", err)
	}
	if len(plan.Meals) == 0 {
		t.Fatal("Generate() produced no meals")
	}
	if plan.PennyMessage == "" {
		t.Fatal("a plan must always come with a message, even with no AI provider")
	}
	// The pantry is honoured end to end, not just in the engine's unit tests.
	if len(plan.Summary.PantryItemsUsed) == 0 {
		t.Fatalf("pantry items used = %v, want the seeded pantry ingredient", plan.Summary.PantryItemsUsed)
	}

	t.Run("the plan is the user's current plan", func(t *testing.T) {
		current, err := service.Current(ctx, owner)
		if err != nil || current == nil {
			t.Fatalf("Current() = %v, %v; want the plan just generated", current, err)
		}
		if current.PlanID != plan.PlanID {
			t.Fatalf("current plan = %s, want %s", current.PlanID, plan.PlanID)
		}
	})

	t.Run("another user sees nothing", func(t *testing.T) {
		current, err := service.Current(ctx, other)
		if err != nil {
			t.Fatalf("Current(other) error = %v", err)
		}
		if current != nil {
			t.Fatal("another user was shown a plan they do not own")
		}
		if _, err := service.Get(ctx, other, plan.PlanID); !errors.Is(err, ErrNotFound) {
			t.Fatalf("Get(other) error = %v, want ErrNotFound", err)
		}
		if _, err := service.Accept(ctx, other, plan.PlanID); !errors.Is(err, ErrNotFound) {
			t.Fatalf("Accept(other) error = %v, want ErrNotFound", err)
		}
	})

	t.Run("accepting saves a grocery list the owner can tick off", func(t *testing.T) {
		accepted, err := service.Accept(ctx, owner, plan.PlanID)
		if err != nil {
			t.Fatalf("Accept() error = %v", err)
		}
		if len(accepted.Sections) == 0 {
			t.Fatal("Accept() produced an empty grocery list")
		}

		first := accepted.Sections[0].Items[0]
		ticked, err := service.SetGroceryItemChecked(ctx, owner, plan.PlanID, first.IngredientID, true)
		if err != nil || !ticked {
			t.Fatalf("SetGroceryItemChecked(owner) = %v, %v; want true, nil", ticked, err)
		}
		ticked, err = service.SetGroceryItemChecked(ctx, other, plan.PlanID, first.IngredientID, true)
		if err != nil || ticked {
			t.Fatalf("SetGroceryItemChecked(other) = %v, %v; want false, nil", ticked, err)
		}

		// A tick survives a reload, which is the whole point of accepting.
		saved, err := service.GroceryList(ctx, owner, plan.PlanID)
		if err != nil || saved == nil {
			t.Fatalf("GroceryList() = %v, %v", saved, err)
		}
		if !itemChecked(*saved, first.IngredientID) {
			t.Fatal("the ticked item did not come back ticked")
		}
	})

	t.Run("moving a meal does not re-price the week", func(t *testing.T) {
		before, err := service.Get(ctx, owner, plan.PlanID)
		if err != nil {
			t.Fatalf("Get() error = %v", err)
		}
		from := before.Meals[0].Slot
		to := Slot{Day: from.Day + 1, MealType: from.MealType}

		moved, err := service.Move(ctx, owner, plan.PlanID, from, to)
		if err != nil {
			t.Fatalf("Move() error = %v", err)
		}
		if moved.Summary.EstimatedCost.Point != before.Summary.EstimatedCost.Point {
			t.Fatalf("cost changed on a move: %v -> %v",
				before.Summary.EstimatedCost.Point, moved.Summary.EstimatedCost.Point)
		}
		if !hasSlot(moved, to) {
			t.Fatalf("the meal did not land in %+v", to)
		}

		// Another user cannot move a meal in a plan they do not own.
		if _, err := service.Move(ctx, other, plan.PlanID, to, from); !errors.Is(err, ErrNotFound) {
			t.Fatalf("Move(other) error = %v, want ErrNotFound", err)
		}
	})

	t.Run("swapping a meal replaces only that slot", func(t *testing.T) {
		before, err := service.Get(ctx, owner, plan.PlanID)
		if err != nil {
			t.Fatalf("Get() error = %v", err)
		}
		slot := before.Meals[0].Slot

		after, err := service.Swap(ctx, owner, plan.PlanID, slot, "cheaper", false)
		if err != nil {
			t.Fatalf("Swap() error = %v", err)
		}
		if len(after.Meals) != len(before.Meals) {
			t.Fatalf("meals = %d, want %d: a swap must not change the shape of the week",
				len(after.Meals), len(before.Meals))
		}
		if recipeAt(after, slot) == recipeAt(before, slot) {
			t.Fatal("the swapped slot still holds the same recipe")
		}
	})

	t.Run("an invalid request is rejected before anything is written", func(t *testing.T) {
		bad := baseRequest()
		bad.Allergies = []AllergyRequirement{{Allergen: "peanut", Strength: StrengthPreferred}}
		if _, err := service.Generate(ctx, owner, bad); err == nil {
			t.Fatal("an allergy that is not required must be rejected")
		}

		// The rejected request left the existing plan alone.
		current, err := service.Current(ctx, owner)
		if err != nil || current == nil {
			t.Fatalf("Current() = %v, %v; want the plan to survive a rejected request", current, err)
		}
	})
}

// seedFixtures writes a small catalogue and two library recipes, and returns
// the id of an ingredient to use as a pantry item.
func seedFixtures(t *testing.T, ctx context.Context, store *db.Store, stamp int64) string {
	t.Helper()

	riceID := fmt.Sprintf("svc-rice-%d", stamp)
	beansID := fmt.Sprintf("svc-beans-%d", stamp)
	chickenID := fmt.Sprintf("svc-chicken-%d", stamp)

	catalogue := []db.Ingredient{
		{ID: riceID, DisplayName: "Rice", Aisle: "pantry", FoodGroup: "grain", PriceReferenceUnit: "lb"},
		{ID: beansID, DisplayName: "Beans", Aisle: "canned", FoodGroup: "legume", PriceReferenceUnit: "can"},
		{ID: chickenID, DisplayName: "Chicken", Aisle: "meat_seafood", FoodGroup: "protein",
			PriceReferenceUnit: "lb", ContainsMeat: true, ContainsPoultry: true, IsAnimalDerived: true},
	}
	for _, ingredient := range catalogue {
		if err := store.UpsertIngredient(ctx, ingredient); err != nil {
			t.Fatalf("UpsertIngredient(%s) error = %v", ingredient.ID, err)
		}
	}
	for _, price := range []db.IngredientPrice{
		{IngredientID: riceID, UnitPrice: 1.20, PackageSize: 2, Tier: 3, Source: "test"},
		{IngredientID: beansID, UnitPrice: 0.99, PackageSize: 1, Tier: 3, Source: "test"},
		{IngredientID: chickenID, UnitPrice: 3.49, PackageSize: 1.5, Tier: 3, Source: "test"},
	} {
		if err := store.UpsertIngredientPrice(ctx, price); err != nil {
			t.Fatalf("UpsertIngredientPrice(%s) error = %v", price.IngredientID, err)
		}
	}

	for i, ingredients := range [][]string{{riceID, beansID}, {riceID, chickenID}} {
		id := fmt.Sprintf("svc-recipe-%d-%d", stamp, i)
		if err := store.UpsertRecipe(ctx, libraryRecipe(id, ingredients)); err != nil {
			t.Fatalf("UpsertRecipe(%s) error = %v", id, err)
		}
	}
	return riceID
}

func libraryRecipe(id string, ingredientIDs []string) db.Recipe {
	servings := 4.0
	minutes := 30
	recipe := db.Recipe{
		ID: id, Title: "Test " + id, SourceType: "hth_library",
		Visibility: "public", ReviewStatus: "approved",
		Servings: &servings, ServingsConfidence: "source", Scalable: true,
		TotalTimeMinutes: &minutes, TimeConfidence: "source",
		MealTypes: []string{"dinner"}, EquipmentRequired: []string{"stovetop"},
		BaseMealPlanEligible: true,
		Instructions:         []db.RecipeInstruction{{Step: 1, Text: "Cook."}},
	}
	for i, ingredientID := range ingredientIDs {
		id := ingredientID
		quantity := 1.0
		unit := "lb"
		recipe.Ingredients = append(recipe.Ingredients, db.RecipeIngredient{
			Position: i + 1, RawText: ingredientID, IngredientID: &id,
			Quantity: &quantity, Unit: &unit,
		})
	}
	return recipe
}

func migrate(t *testing.T, databaseURL string) {
	t.Helper()
	if err := goose.SetDialect("postgres"); err != nil {
		t.Fatalf("SetDialect() error = %v", err)
	}
	conn, err := sql.Open("pgx", databaseURL)
	if err != nil {
		t.Fatalf("sql.Open() error = %v", err)
	}
	defer conn.Close()
	if err := goose.Up(conn, "../../../migrations"); err != nil {
		t.Fatalf("goose.Up() error = %v", err)
	}
}

func itemChecked(list GroceryListResult, ingredientID string) bool {
	for _, section := range list.Sections {
		for _, item := range section.Items {
			if item.IngredientID == ingredientID {
				return item.IsChecked
			}
		}
	}
	return false
}

func hasSlot(plan Plan, slot Slot) bool {
	for _, meal := range plan.Meals {
		if meal.Slot == slot {
			return true
		}
	}
	return false
}

func recipeAt(plan Plan, slot Slot) string {
	for _, meal := range plan.Meals {
		if meal.Slot == slot {
			return meal.RecipeID
		}
	}
	return ""
}
