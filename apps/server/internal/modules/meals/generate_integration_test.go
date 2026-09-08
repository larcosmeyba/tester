package meals

import (
	"context"
	"fmt"
	"os"
	"strings"
	"testing"
	"time"

	_ "github.com/jackc/pgx/v5/stdlib"

	"github.com/helpthehive/server/internal/auth"
	"github.com/helpthehive/server/internal/db"
	"github.com/helpthehive/server/internal/modules/meals/generator"
	"github.com/helpthehive/server/internal/modules/users"
)

// The chain the product describes, against real SQL:
//
//	Questionnaire → Saved Meal Preferences → Existing Pantry → Budget
//	  → Hard Filters → AI Meal Plan → Validation → Grocery List
//
// Each sub-test is one link. The pantry link is the one worth the most: it is
// the difference between a household being asked what they own and the server
// knowing.
func TestGenerateFromSavedPreferencesAndPantry(t *testing.T) {
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
	owner := auth.Identity{Subject: fmt.Sprintf("meal-prefs-owner-%d", stamp)}
	other := auth.Identity{Subject: fmt.Sprintf("meal-prefs-other-%d", stamp)}

	riceID := seedFixtures(t, ctx, store, stamp)

	t.Run("a user with no saved questionnaire is told to answer it", func(t *testing.T) {
		if _, err := service.Generate(ctx, owner, nil); err == nil {
			t.Fatal("Generate(nil) = nil error, want a user with no preferences to be asked for them rather than given defaults nobody chose")
		}
	})

	t.Run("preferences are null before the questionnaire is answered", func(t *testing.T) {
		saved, err := service.Preferences(ctx, owner)
		if err != nil {
			t.Fatalf("Preferences() error = %v", err)
		}
		if saved != nil {
			t.Fatalf("Preferences() = %+v, want nil for a user who has never answered", saved)
		}
	})

	request := baseRequest()
	request.Meals = MealCounts{Dinner: 1}
	request.Budget = Budget{Amount: 200, Currency: "USD", Mode: "balanced"}
	request.NutritionPreferences = []NutritionPreference{{Goal: "high_protein", Strength: StrengthPreferred}}
	request.Normalize()

	t.Run("generating with a questionnaire saves it", func(t *testing.T) {
		if _, err := service.Generate(ctx, owner, &request); err != nil {
			t.Fatalf("Generate() error = %v", err)
		}

		saved, err := service.Preferences(ctx, owner)
		if err != nil || saved == nil {
			t.Fatalf("Preferences() = %v, %v; want the questionnaire that was just used", saved, err)
		}
		if saved.Budget.Amount != 200 {
			t.Fatalf("budget = %.2f, want the answered 200.00", saved.Budget.Amount)
		}
		if len(saved.NutritionPreferences) != 1 || saved.NutritionPreferences[0].Goal != "high_protein" {
			t.Fatalf("nutrition preferences = %v, want the answered goal", saved.NutritionPreferences)
		}
		if saved.Meals.Dinner != 1 {
			t.Fatalf("dinners = %d, want 1", saved.Meals.Dinner)
		}
	})

	t.Run("a later plan needs no questionnaire at all", func(t *testing.T) {
		plan, err := service.Generate(ctx, owner, nil)
		if err != nil {
			t.Fatalf("Generate(nil) error = %v, want the saved questionnaire to be used", err)
		}
		if len(plan.Meals) == 0 {
			t.Fatal("a plan generated from saved preferences produced no meals")
		}
		if plan.Summary.Budget == nil || *plan.Summary.Budget != 200 {
			t.Fatalf("budget = %v, want the saved 200.00 to be applied", plan.Summary.Budget)
		}
	})

	t.Run("the pantry is pulled automatically and credited", func(t *testing.T) {
		// The user adds rice to their pantry through the ordinary pantry
		// screen: free text, no ingredient id, exactly as the app writes it.
		item, err := store.CreatePantryItem(ctx, db.CreatePantryItemParams{
			UserID:         userIDFor(t, ctx, store, owner),
			Name:           "Rice",
			Quantity:       "1 bag",
			Location:       "PANTRY",
			Category:       "grain",
			ExpirationDate: time.Now().AddDate(0, 1, 0).UTC(),
		})
		if err != nil {
			t.Fatalf("CreatePantryItem() error = %v", err)
		}
		if item.IngredientID != nil {
			t.Fatalf("ingredient id = %v, want a free-text item to start unlinked", *item.IngredientID)
		}

		// Nothing is sent from the client: the questionnaire carries no pantry.
		plan, err := service.Generate(ctx, owner, nil)
		if err != nil {
			t.Fatalf("Generate() error = %v", err)
		}

		// "Rice" matched the catalogue's "Rice" exactly, so it is credited.
		if !containsID(plan.Summary.PantryItemsUsed, riceID) {
			t.Fatalf("pantry items used = %v, want the pantry's rice pulled automatically and credited",
				plan.Summary.PantryItemsUsed)
		}
		if !anyAssumptionMentions(plan, "from your pantry") {
			t.Fatalf("assumptions = %v, want the pantry contribution disclosed", plan.Assumptions)
		}

		// It stays on the grocery list, marked as already owned, rather than
		// disappearing from the shop.
		if !groceryLineIsInPantry(plan, riceID) {
			t.Fatalf("grocery list = %v, want the pantry line kept and marked in-pantry", plan.GroceryList)
		}
	})

	t.Run("a pantry item the catalogue cannot resolve is reported, not guessed", func(t *testing.T) {
		if _, err := store.CreatePantryItem(ctx, db.CreatePantryItemParams{
			UserID:         userIDFor(t, ctx, store, owner),
			Name:           "Grandma's mystery jar",
			Quantity:       "1",
			Location:       "PANTRY",
			Category:       "other",
			ExpirationDate: time.Now().AddDate(0, 1, 0).UTC(),
		}); err != nil {
			t.Fatalf("CreatePantryItem() error = %v", err)
		}

		plan, err := service.Generate(ctx, owner, nil)
		if err != nil {
			t.Fatalf("Generate() error = %v", err)
		}
		if !anyAssumptionMentions(plan, "could not be matched") {
			t.Fatalf("assumptions = %v, want an unmatched pantry item disclosed rather than silently dropped",
				plan.Assumptions)
		}
	})

	t.Run("one user's pantry never reaches another user's plan", func(t *testing.T) {
		if _, err := service.SavePreferences(ctx, other, request); err != nil {
			t.Fatalf("SavePreferences() error = %v", err)
		}
		plan, err := service.Generate(ctx, other, nil)
		if err != nil {
			t.Fatalf("Generate() error = %v", err)
		}
		if len(plan.Summary.PantryItemsUsed) != 0 {
			t.Fatalf("pantry items used = %v, want an empty pantry for a different user",
				plan.Summary.PantryItemsUsed)
		}
	})

	t.Run("preferences can be forgotten", func(t *testing.T) {
		deleted, err := service.DeletePreferences(ctx, other)
		if err != nil || !deleted {
			t.Fatalf("DeletePreferences() = %v, %v; want the questionnaire forgotten", deleted, err)
		}
		saved, err := service.Preferences(ctx, other)
		if err != nil || saved != nil {
			t.Fatalf("Preferences() = %v, %v; want nil after deletion", saved, err)
		}
		// A forgotten questionnaire does not rewrite plans already generated.
		if current, err := service.Current(ctx, other); err != nil || current == nil {
			t.Fatalf("Current() = %v, %v; want the existing plan to survive", current, err)
		}
	})
}

func userIDFor(t *testing.T, ctx context.Context, store *db.Store, identity auth.Identity) string {
	t.Helper()
	viewer, err := store.EnsureViewer(ctx, identity.Subject, nil)
	if err != nil {
		t.Fatalf("EnsureViewer() error = %v", err)
	}
	return viewer.User.ID
}

func containsID(values []string, want string) bool {
	for _, value := range values {
		if value == want {
			return true
		}
	}
	return false
}

func anyAssumptionMentions(plan Plan, substring string) bool {
	for _, assumption := range plan.Assumptions {
		if strings.Contains(assumption, substring) {
			return true
		}
	}
	return false
}

func groceryLineIsInPantry(plan Plan, ingredientID string) bool {
	for _, section := range plan.GroceryList {
		for _, item := range section.Items {
			if item.IngredientID == ingredientID {
				return item.InPantry
			}
		}
	}
	return false
}
