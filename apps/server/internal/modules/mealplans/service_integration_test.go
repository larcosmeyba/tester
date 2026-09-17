package mealplans

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
	"github.com/helpthehive/server/internal/domain/meals"
	"github.com/helpthehive/server/internal/modules/catalog"
	"github.com/helpthehive/server/internal/modules/grocery"
	"github.com/helpthehive/server/internal/modules/mealgen"
	"github.com/helpthehive/server/internal/modules/mealgen/provider"
	"github.com/helpthehive/server/internal/modules/mealprofile"
	"github.com/helpthehive/server/internal/modules/pantry"
	"github.com/helpthehive/server/internal/modules/users"
	fx "github.com/helpthehive/server/internal/testsupport/mealfixtures"
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

	// The same wiring main.go uses, so this exercises the real seams between
	// the modules and not a shortcut assembled for the test.
	store := db.NewStore(pool)
	userService := users.NewService(store)
	catalogService := catalog.NewService(store)
	groceryService := grocery.NewService(store, userService, catalogService, nil)
	generatorService := mealgen.NewService(store, catalogService, provider.Disabled{}, nil, nil)
	profileService := mealprofile.NewService(store, userService)
	pantryService := pantry.NewService(store, userService).WithResolver(catalogService, nil)
	service := NewService(store, userService, generatorService, groceryService, profileService, pantryService, nil)

	stamp := time.Now().UnixNano()
	owner := auth.Identity{Subject: fmt.Sprintf("meal-service-owner-%d", stamp)}
	other := auth.Identity{Subject: fmt.Sprintf("meal-service-other-%d", stamp)}

	riceID := seedFixtures(t, ctx, store, stamp)

	request := fx.BaseRequest()
	request.PantryItems = []string{riceID}
	// One dinner across two days, so there is a free slot to move a meal into.
	request.Meals = meals.MealCounts{Dinner: 1}

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
		if _, err := service.Get(ctx, other, plan.PlanID); !errors.Is(err, meals.ErrNotFound) {
			t.Fatalf("Get(other) error = %v, want meals.ErrNotFound", err)
		}
		if _, err := groceryService.Accept(ctx, other, plan.PlanID); !errors.Is(err, meals.ErrNotFound) {
			t.Fatalf("Accept(other) error = %v, want meals.ErrNotFound", err)
		}
	})

	t.Run("accepting saves a grocery list the owner can tick off", func(t *testing.T) {
		accepted, err := groceryService.Accept(ctx, owner, plan.PlanID)
		if err != nil {
			t.Fatalf("Accept() error = %v", err)
		}
		if len(accepted.Sections) == 0 {
			t.Fatal("Accept() produced an empty grocery list")
		}

		first := accepted.Sections[0].Items[0]
		ticked, err := groceryService.SetItemChecked(ctx, owner, plan.PlanID, first.IngredientID, true)
		if err != nil || !ticked {
			t.Fatalf("SetGroceryItemChecked(owner) = %v, %v; want true, nil", ticked, err)
		}
		ticked, err = groceryService.SetItemChecked(ctx, other, plan.PlanID, first.IngredientID, true)
		if err != nil || ticked {
			t.Fatalf("SetGroceryItemChecked(other) = %v, %v; want false, nil", ticked, err)
		}

		// A tick survives a reload, which is the whole point of accepting.
		saved, err := groceryService.List(ctx, owner, plan.PlanID)
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
		to := meals.Slot{Day: from.Day + 1, MealType: from.MealType}

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
		if _, err := service.Move(ctx, other, plan.PlanID, to, from); !errors.Is(err, meals.ErrNotFound) {
			t.Fatalf("Move(other) error = %v, want meals.ErrNotFound", err)
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

	t.Run("updating servings re-prices the week", func(t *testing.T) {
		before, err := service.Current(ctx, owner)
		if err != nil || before == nil {
			t.Fatalf("Current() = %v, %v", before, err)
		}
		slot := before.Meals[0].Slot
		target := before.Meals[0].ServingsPlanned * 2

		after, err := service.UpdateServings(ctx, owner, before.PlanID, slot, target)
		if err != nil {
			t.Fatalf("UpdateServings() error = %v", err)
		}
		updated := mealAt(after, slot)
		if updated == nil || updated.ServingsPlanned != target {
			t.Fatalf("servings = %v, want %v", updated, target)
		}
		// Scale and servings are two views of one decision and must move together.
		if updated.ScaleFactor <= before.Meals[0].ScaleFactor {
			t.Fatal("doubling the servings must raise the scale factor with it")
		}
		if after.Summary.EstimatedCost.Point <= before.Summary.EstimatedCost.Point {
			t.Fatal("cooking more food must cost more: the week was not re-priced")
		}
	})

	t.Run("regenerating a day leaves the rest of the week alone", func(t *testing.T) {
		before, err := service.Current(ctx, owner)
		if err != nil || before == nil {
			t.Fatalf("Current() = %v, %v", before, err)
		}
		day := before.Meals[0].Slot.Day

		after, err := service.RegenerateDay(ctx, owner, before.PlanID, day)
		if err != nil {
			t.Fatalf("RegenerateDay() error = %v", err)
		}
		if len(after.Meals) != len(before.Meals) {
			t.Fatalf("meals = %d, want %d: regenerating one day must not change the shape of the week",
				len(after.Meals), len(before.Meals))
		}
		for _, meal := range before.Meals {
			if meal.Slot.Day == day {
				continue
			}
			if got := mealAt(after, meal.Slot); got == nil || got.RecipeID != meal.RecipeID {
				t.Fatalf("slot %v changed; only the regenerated day should differ", meal.Slot)
			}
		}
	})

	t.Run("another user cannot edit the plan", func(t *testing.T) {
		current, err := service.Current(ctx, owner)
		if err != nil || current == nil {
			t.Fatalf("Current() = %v, %v", current, err)
		}
		slot := current.Meals[0].Slot

		if _, err := service.UpdateServings(ctx, other, current.PlanID, slot, 8); !errors.Is(err, meals.ErrNotFound) {
			t.Fatalf("UpdateServings() error = %v, want not found", err)
		}
		if _, err := service.RegenerateDay(ctx, other, current.PlanID, slot.Day); !errors.Is(err, meals.ErrNotFound) {
			t.Fatalf("RegenerateDay() error = %v, want not found", err)
		}
		if _, err := service.ReplaceMeal(ctx, other, current.PlanID, slot, current.Meals[0].RecipeID); !errors.Is(err, meals.ErrNotFound) {
			t.Fatalf("ReplaceMeal() error = %v, want not found", err)
		}
		if _, err := service.Save(ctx, other, current.PlanID); !errors.Is(err, meals.ErrNotFound) {
			t.Fatalf("Save() error = %v, want not found", err)
		}
	})

	t.Run("replacing a meal refuses a recipe the filters exclude", func(t *testing.T) {
		current, err := service.Current(ctx, owner)
		if err != nil || current == nil {
			t.Fatalf("Current() = %v, %v", current, err)
		}
		slot := current.Meals[0].Slot

		if _, err := service.ReplaceMeal(ctx, owner, current.PlanID, slot, "no-such-recipe"); err == nil {
			t.Fatal("a recipe outside the eligible pool must be refused, however it was asked for")
		}
	})

	t.Run("an invalid request is rejected before anything is written", func(t *testing.T) {
		bad := fx.BaseRequest()
		bad.Allergies = []meals.AllergyRequirement{{Allergen: "peanut", Strength: meals.StrengthPreferred}}
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

	catalogue := []meals.Ingredient{
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
	for _, price := range []meals.IngredientPrice{
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

func libraryRecipe(id string, ingredientIDs []string) meals.Recipe {
	servings := 4.0
	minutes := 30
	recipe := meals.Recipe{
		ID: id, Title: "Test " + id, SourceType: "hth_library",
		Visibility: "public", ReviewStatus: "approved",
		Servings: &servings, ServingsConfidence: "source", Scalable: true,
		TotalTimeMinutes: &minutes, TimeConfidence: "source",
		MealTypes: []string{"dinner"}, EquipmentRequired: []string{"stovetop"},
		BaseMealPlanEligible: true,
		Instructions:         []meals.RecipeInstruction{{Step: 1, Text: "Cook."}},
	}
	for i, ingredientID := range ingredientIDs {
		id := ingredientID
		quantity := 1.0
		unit := "lb"
		recipe.Ingredients = append(recipe.Ingredients, meals.RecipeIngredient{
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

func itemChecked(list meals.GroceryListResult, ingredientID string) bool {
	for _, section := range list.Sections {
		for _, item := range section.Items {
			if item.IngredientID == ingredientID {
				return item.IsChecked
			}
		}
	}
	return false
}

func hasSlot(plan meals.Plan, slot meals.Slot) bool {
	for _, meal := range plan.Meals {
		if meal.Slot == slot {
			return true
		}
	}
	return false
}

func mealAt(plan meals.Plan, slot meals.Slot) *meals.PlannedMeal {
	for i := range plan.Meals {
		if plan.Meals[i].Slot == slot {
			return &plan.Meals[i]
		}
	}
	return nil
}

func recipeAt(plan meals.Plan, slot meals.Slot) string {
	for _, meal := range plan.Meals {
		if meal.Slot == slot {
			return meal.RecipeID
		}
	}
	return ""
}

// TestStoredPantryReachesTheGenerator is the second half of the pantry cycle:
// not "the request said I own rice" but "the user's actual pantry, typed into
// the app and resolved server-side, changes what the plan buys".
//
// Nothing in the request mentions the pantry. The service reads it.
// riceLine finds one ingredient's line in a plan's grocery list.
func riceLine(t *testing.T, plan meals.Plan, ingredientID string) meals.GroceryItem {
	t.Helper()
	for i := range plan.GroceryList {
		for j := range plan.GroceryList[i].Items {
			if plan.GroceryList[i].Items[j].IngredientID == ingredientID {
				return plan.GroceryList[i].Items[j]
			}
		}
	}
	t.Fatalf("ingredient %q is not on the grocery list", ingredientID)
	return meals.GroceryItem{}
}

func TestStoredPantryReachesTheGenerator(t *testing.T) {
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
	userService := users.NewService(store)
	catalogService := catalog.NewService(store)
	groceryService := grocery.NewService(store, userService, catalogService, nil)
	generatorService := mealgen.NewService(store, catalogService, provider.Disabled{}, nil, nil)
	profileService := mealprofile.NewService(store, userService)
	pantryService := pantry.NewService(store, userService).WithResolver(catalogService, nil)
	service := NewService(store, userService, generatorService, groceryService, profileService, pantryService, nil)

	stamp := time.Now().UnixNano()
	identity := auth.Identity{Subject: fmt.Sprintf("stored-pantry-%d", stamp)}
	riceID := seedFixtures(t, ctx, store, stamp)

	// Give this run's rice a display name no other row claims. The test
	// database is shared and accumulates fixtures, and the resolver refuses to
	// choose between several rows called "Rice" — correctly, which is how this
	// test found out.
	riceName := fmt.Sprintf("Rice %d", stamp)
	if err := store.UpsertIngredient(ctx, meals.Ingredient{
		ID: riceID, DisplayName: riceName, Aisle: "pantry",
		FoodGroup: "grain", PriceReferenceUnit: "lb",
	}); err != nil {
		t.Fatalf("UpsertIngredient(rice) error = %v", err)
	}

	baseline := fx.BaseRequest()
	baseline.Meals = meals.MealCounts{Dinner: 1}
	// Deliberately empty: the point is that the service supplies it.
	baseline.PantryItems = nil

	before, err := service.Generate(ctx, identity, baseline)
	if err != nil {
		t.Fatalf("Generate(empty pantry) error = %v", err)
	}
	if len(before.Summary.PantryItemsUsed) != 0 {
		t.Fatalf("pantry items used = %v, want none before anything is in the pantry", before.Summary.PantryItemsUsed)
	}

	// The user adds rice, by name, exactly as the mobile app does.
	item, err := pantryService.Add(ctx, identity, db.CreatePantryItemParams{
		Name:           riceName,
		Quantity:       "2 lb",
		Location:       "PANTRY",
		Category:       "Grains",
		ExpirationDate: time.Now().AddDate(0, 0, 30).UTC(),
	})
	if err != nil {
		t.Fatalf("Add() error = %v", err)
	}
	if item.IngredientID == nil || *item.IngredientID != riceID {
		t.Fatalf("ingredient_id = %v, want %q resolved from the name alone", item.IngredientID, riceID)
	}

	after, err := service.Generate(ctx, identity, baseline)
	if err != nil {
		t.Fatalf("Generate(with pantry) error = %v", err)
	}

	t.Run("the plan knows the rice is already owned", func(t *testing.T) {
		found := false
		for _, id := range after.Summary.PantryItemsUsed {
			if id == riceID {
				found = true
			}
		}
		if !found {
			t.Fatalf("pantry items used = %v, want the stored rice", after.Summary.PantryItemsUsed)
		}
	})

	t.Run("the grocery list flags it without assuming there is enough", func(t *testing.T) {
		var rice *meals.GroceryItem
		for i := range after.GroceryList {
			for j := range after.GroceryList[i].Items {
				if after.GroceryList[i].Items[j].IngredientID == riceID {
					rice = &after.GroceryList[i].Items[j]
				}
			}
		}
		if rice == nil {
			t.Fatal("the rice vanished from the grocery list; a pantry item should stay listed, marked as owned")
		}
		// The pantry row carries no amount yet, so the requirement stays in
		// full and is flagged. Saying "you have rice" is not saying "you have
		// two cups of rice".
		if rice.InPantry {
			t.Error("rice was treated as covered; the pantry row has no quantity")
		}
		if !rice.PantryMayCover {
			t.Error("rice is not flagged as possibly covered by the pantry")
		}
	})

	t.Run("a stated pantry quantity buys only the shortfall", func(t *testing.T) {
		// Say how much rice there is, and less than the week needs. The list
		// should ask for the difference rather than nothing.
		half := 0.5
		unit := "lb"
		if _, err := pantryService.Update(ctx, identity, item.ID, db.PantryItemPatch{
			QuantityAmount: &half, QuantityUnit: &unit,
		}); err != nil {
			t.Fatalf("Update(quantity) error = %v", err)
		}

		withQty, err := service.Generate(ctx, identity, baseline)
		if err != nil {
			t.Fatalf("Generate(with quantity) error = %v", err)
		}

		var rice *meals.GroceryItem
		for i := range withQty.GroceryList {
			for j := range withQty.GroceryList[i].Items {
				if withQty.GroceryList[i].Items[j].IngredientID == riceID {
					rice = &withQty.GroceryList[i].Items[j]
				}
			}
		}
		if rice == nil {
			t.Fatal("rice left the grocery list entirely")
		}
		if !rice.PartiallyInPantry {
			t.Fatalf("rice = %+v, want marked as partially owned", rice)
		}
		if rice.NeededQty <= 0 {
			t.Fatalf("needed = %v, want the shortfall, not zero", rice.NeededQty)
		}
		if rice.EstimatedPrice <= 0 {
			t.Error("the shortfall was not priced")
		}
	})

	t.Run("a stated quantity reduces what has to be bought", func(t *testing.T) {
		// By this point the subtest above recorded half a pound of rice.
		//
		// The assertion is on quantity, not price. Rice is sold in two-pound
		// bags, so needing 1.5 lb instead of 2 lb still buys one bag and costs
		// the same — which is correct, and is exactly why package rounding
		// lives in the pricing step rather than the subtraction step.
		withQty, err := service.Generate(ctx, identity, baseline)
		if err != nil {
			t.Fatalf("Generate() error = %v", err)
		}
		before := riceLine(t, after, riceID).NeededQty
		now := riceLine(t, withQty, riceID).NeededQty
		if now >= before {
			t.Errorf("needed went from %v to %v lb; recording how much rice there is should reduce it", before, now)
		}
	})
}
