package pantry_test

// The pantry → catalogue → meal generator path, against real SQL.
//
// These prove the thing the whole cycle was about: what a person actually keeps
// at home reaches the planner, and what the catalogue does not recognise stays
// visible in the pantry without quietly becoming a wrong ingredient in a plan.

import (
	"context"
	"database/sql"
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
	"github.com/helpthehive/server/internal/modules/pantry"
	"github.com/helpthehive/server/internal/modules/users"
)

func TestPantryResolvesAgainstTheCatalogue(t *testing.T) {
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
	service := pantry.NewService(store, userService).WithResolver(catalogService, nil)

	stamp := time.Now().UnixNano()
	owner := auth.Identity{Subject: fmt.Sprintf("pantry-owner-%d", stamp)}
	other := auth.Identity{Subject: fmt.Sprintf("pantry-other-%d", stamp)}

	milkID := fmt.Sprintf("pantry-milk-%d", stamp)
	for _, ingredient := range []meals.Ingredient{
		{ID: milkID, DisplayName: fmt.Sprintf("Milk %d", stamp), Aisle: "dairy_refrigerated",
			FoodGroup: "dairy", PriceReferenceUnit: "gal", ContainsDairy: true, IsAnimalDerived: true},
	} {
		if err := store.UpsertIngredient(ctx, ingredient); err != nil {
			t.Fatalf("UpsertIngredient() error = %v", err)
		}
	}
	catalogueName := fmt.Sprintf("Milk %d", stamp)

	add := func(t *testing.T, identity auth.Identity, name string) db.PantryItem {
		t.Helper()
		item, err := service.Add(ctx, identity, db.CreatePantryItemParams{
			Name:           name,
			Quantity:       "1 gallon",
			Location:       "REFRIGERATOR",
			Category:       "Dairy",
			ExpirationDate: time.Now().AddDate(0, 0, 7).UTC(),
		})
		if err != nil {
			t.Fatalf("Add(%q) error = %v", name, err)
		}
		return item
	}

	t.Run("a name the catalogue knows is linked to it", func(t *testing.T) {
		item := add(t, owner, catalogueName)
		if item.IngredientID == nil {
			t.Fatal("a catalogue name was stored unresolved: it will never reach a meal plan")
		}
		if *item.IngredientID != milkID {
			t.Fatalf("ingredient_id = %q, want %q", *item.IngredientID, milkID)
		}
	})

	t.Run("a name the catalogue does not know is kept, unresolved", func(t *testing.T) {
		item := add(t, owner, fmt.Sprintf("Blue Raspberry Cordial %d", stamp))
		if item.IngredientID != nil {
			t.Fatalf("ingredient_id = %v, want nil — nothing in the catalogue matches this", *item.IngredientID)
		}
		// The point: it is still a pantry item. Unresolved is a supported
		// state, not a rejected write.
		if item.ID == "" || item.Name == "" {
			t.Fatal("the item was not stored")
		}
	})

	t.Run("only resolved items reach the meal generator", func(t *testing.T) {
		ids, err := service.IngredientIDs(ctx, owner)
		if err != nil {
			t.Fatalf("IngredientIDs() error = %v", err)
		}
		found := false
		for _, id := range ids {
			if id == milkID {
				found = true
			}
		}
		if !found {
			t.Fatalf("ingredient ids = %v, want the resolved milk", ids)
		}
		// The unresolved cordial contributes nothing, which is the whole point:
		// the planner never sees an ingredient nobody could identify.
		if len(ids) != 1 {
			t.Fatalf("ingredient ids = %v, want exactly the one resolved item", ids)
		}
	})

	t.Run("renaming to something unknown unlinks it", func(t *testing.T) {
		item := add(t, owner, catalogueName)
		if item.IngredientID == nil {
			t.Fatal("precondition: the item should have resolved")
		}
		renamed := fmt.Sprintf("Something Else Entirely %d", stamp)
		updated, err := service.Update(ctx, owner, item.ID, db.PantryItemPatch{Name: &renamed})
		if err != nil {
			t.Fatalf("Update() error = %v", err)
		}
		if updated.IngredientID != nil {
			t.Fatalf("ingredient_id = %v, want nil: the old link would have the planner counting milk the user no longer claims", *updated.IngredientID)
		}
	})

	t.Run("one user's pantry never reaches another", func(t *testing.T) {
		add(t, other, catalogueName)

		ownerIDs, err := service.IngredientIDs(ctx, owner)
		if err != nil {
			t.Fatalf("IngredientIDs(owner) error = %v", err)
		}
		otherIDs, err := service.IngredientIDs(ctx, other)
		if err != nil {
			t.Fatalf("IngredientIDs(other) error = %v", err)
		}
		ownerItems, err := service.List(ctx, owner, db.PantryFilter{})
		if err != nil {
			t.Fatalf("List(owner) error = %v", err)
		}
		otherItems, err := service.List(ctx, other, db.PantryFilter{})
		if err != nil {
			t.Fatalf("List(other) error = %v", err)
		}
		if len(otherItems) != 1 {
			t.Fatalf("the second user sees %d items, want only their own 1", len(otherItems))
		}
		if len(ownerItems) == len(otherItems) {
			t.Fatal("both users see the same number of items; the scoping is not doing anything")
		}
		// Both resolve to the same catalogue row, which is correct — the
		// catalogue is shared. What must not leak is the items.
		if len(ownerIDs) == 0 || len(otherIDs) == 0 {
			t.Fatalf("owner=%v other=%v, want each user to see their own resolved ingredient", ownerIDs, otherIDs)
		}
	})
}

// The EXPIRED filter used to compare the stored column while the API reported a
// status computed from the expiration date. Asking for EXPIRED returned nothing
// and asking for ACTIVE returned lapsed items.
func TestExpiredFilterMatchesTheReportedStatus(t *testing.T) {
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
	service := pantry.NewService(store, userService)

	stamp := time.Now().UnixNano()
	identity := auth.Identity{Subject: fmt.Sprintf("pantry-filter-%d", stamp)}

	lapsed, err := service.Add(ctx, identity, db.CreatePantryItemParams{
		Name: "Lapsed", Quantity: "1", Location: "PANTRY", Category: "Other",
		ExpirationDate: time.Now().AddDate(0, 0, -3).UTC(),
	})
	if err != nil {
		t.Fatalf("Add(lapsed) error = %v", err)
	}
	fresh, err := service.Add(ctx, identity, db.CreatePantryItemParams{
		Name: "Fresh", Quantity: "1", Location: "PANTRY", Category: "Other",
		ExpirationDate: time.Now().AddDate(0, 0, 7).UTC(),
	})
	if err != nil {
		t.Fatalf("Add(fresh) error = %v", err)
	}

	expiredStatus := "EXPIRED"
	expired, err := service.List(ctx, identity, db.PantryFilter{Status: &expiredStatus})
	if err != nil {
		t.Fatalf("List(EXPIRED) error = %v", err)
	}
	if len(expired) != 1 || expired[0].ID != lapsed.ID {
		t.Fatalf("EXPIRED filter returned %d items, want the one lapsed item", len(expired))
	}

	activeStatus := "ACTIVE"
	active, err := service.List(ctx, identity, db.PantryFilter{Status: &activeStatus})
	if err != nil {
		t.Fatalf("List(ACTIVE) error = %v", err)
	}
	if len(active) != 1 || active[0].ID != fresh.ID {
		t.Fatalf("ACTIVE filter returned %d items, want only the unexpired one", len(active))
	}

	// The stored column is untouched: the item is still ACTIVE in the table and
	// only *reported* as expired. Nothing about the wire format changed.
	if db.EffectiveStatus(lapsed, time.Now()) != "EXPIRED" {
		t.Error("the lapsed item should report EXPIRED")
	}
	if lapsed.Status != "ACTIVE" {
		t.Errorf("stored status = %q, want ACTIVE: the fix must not rewrite rows", lapsed.Status)
	}
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
