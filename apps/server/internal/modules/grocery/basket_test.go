package grocery

import (
	"strings"
	"testing"

	"github.com/helpthehive/server/internal/domain/meals"
	fx "github.com/helpthehive/server/internal/testsupport/mealfixtures"
)

// Consolidating a week into one basket, and what it costs.
// --- Pricing and the grocery list ----------------------------------------

func TestBasketRoundsPackagesUpAndBuysLooseGoodsToQuantity(t *testing.T) {
	catalog := fx.Catalog()
	// 2 lb of chicken sold in 1.5 lb packs at $3.00/lb -> 2 packs, $9.00.
	// 1 lb of beans sold loose at $0.50/lb -> $0.50.
	dish := fx.Recipe("dish", 4, []string{"dinner"}, fx.Line(1, "chicken", 2), fx.Line(2, "beans", 1))

	basket := BuildBasket([]meals.PlannedRecipe{{Recipe: dish, Scale: 1}}, nil, catalog)
	byID := itemsByID(basket.Items)

	chicken := byID["chicken"]
	if chicken.Packages == nil || *chicken.Packages != 2 || chicken.EstimatedPrice != 9.00 {
		t.Fatalf("chicken = %+v, want 2 packages at $9.00", chicken)
	}
	beans := byID["beans"]
	if beans.Packages != nil || beans.EstimatedPrice != 0.50 {
		t.Fatalf("beans = %+v, want loose at $0.50", beans)
	}
}

func TestBasketCountsARepeatedRecipeTwice(t *testing.T) {
	catalog := fx.Catalog()
	dish := fx.Recipe("dish", 4, []string{"dinner"}, fx.Line(1, "beans", 1))

	once := BuildBasket([]meals.PlannedRecipe{{Recipe: dish, Scale: 1}}, nil, catalog)
	twice := BuildBasket([]meals.PlannedRecipe{{Recipe: dish, Scale: 1}, {Recipe: dish, Scale: 1}}, nil, catalog)

	if itemsByID(once.Items)["beans"].NeededQty != 1 {
		t.Fatalf("one serving needed %v beans, want 1", itemsByID(once.Items)["beans"].NeededQty)
	}
	if got := itemsByID(twice.Items)["beans"].NeededQty; got != 2 {
		t.Fatalf("a dish cooked twice needed %v beans, want 2", got)
	}
}

func TestPantryItemsStayOnTheListAtZeroCost(t *testing.T) {
	catalog := fx.Catalog()
	dish := fx.Recipe("dish", 4, []string{"dinner"}, fx.Line(1, "rice", 2), fx.Line(2, "beans", 1))

	basket := BuildBasket([]meals.PlannedRecipe{{Recipe: dish, Scale: 1}}, meals.Set("rice"), catalog)
	rice := itemsByID(basket.Items)["rice"]

	if !rice.InPantry {
		t.Fatal("a pantry ingredient must stay on the list, marked as already owned")
	}
	if rice.EstimatedPrice != 0 {
		t.Fatalf("pantry item price = %v, want 0", rice.EstimatedPrice)
	}
	if basket.Cost.Point != 0.50 {
		t.Fatalf("cost = %v, want only the beans at $0.50", basket.Cost.Point)
	}
}

func TestAssumedOnHandIngredientsAreNeverBought(t *testing.T) {
	catalog := fx.Catalog()
	dish := fx.Recipe("dish", 4, []string{"dinner"}, fx.Line(1, "salt", 1), fx.Line(2, "rice", 1))

	basket := BuildBasket([]meals.PlannedRecipe{{Recipe: dish, Scale: 1}}, nil, catalog)
	if _, found := itemsByID(basket.Items)["salt"]; found {
		t.Fatal("salt is assumed on hand and must never reach a grocery list")
	}
}

func TestCostIsARangeAndUnpricedIngredientsLowerConfidence(t *testing.T) {
	catalog := fx.Catalog()
	priced := fx.Recipe("priced", 4, []string{"dinner"}, fx.Line(1, "rice", 2))

	basket := BuildBasket([]meals.PlannedRecipe{{Recipe: priced, Scale: 1}}, nil, catalog)
	if !(basket.Cost.Low < basket.Cost.Point && basket.Cost.Point < basket.Cost.High) {
		t.Fatalf("cost = %+v, want low < point < high", basket.Cost)
	}
	// Rice is tier 1, the tightest band.
	if basket.Cost.Confidence != meals.ConfidenceHigh {
		t.Fatalf("confidence = %q, want high for a tier 1 basket", basket.Cost.Confidence)
	}

	unpriced := fx.Recipe("unpriced", 4, []string{"dinner"},
		fx.Line(1, "rice", 2), fx.Line(2, "almond_unknown", 1))
	catalogWithGap := meals.NewCatalog(
		append(fx.Ingredients(), fx.Ingredient("almond_unknown")),
		fx.Prices(),
	)
	gapped := BuildBasket([]meals.PlannedRecipe{{Recipe: unpriced, Scale: 1}}, nil, catalogWithGap)
	if gapped.Cost.Confidence != meals.ConfidenceLow {
		t.Fatalf("confidence = %q, want low when something could not be priced", gapped.Cost.Confidence)
	}
	if !mentions(gapped.Assumptions, "could not be priced") {
		t.Fatalf("assumptions = %v, want the unpriced ingredient disclosed", gapped.Assumptions)
	}
}

func TestGroceryListIsGroupedInShoppingOrder(t *testing.T) {
	catalog := fx.Catalog()
	dish := fx.Recipe("dish", 4, []string{"dinner"}, fx.Line(1, "rice", 1), fx.Line(2, "chicken", 1), fx.Line(3, "beans", 1))

	basket := BuildBasket([]meals.PlannedRecipe{{Recipe: dish, Scale: 1}}, nil, catalog)
	sections := GroupByAisle(basket.Items, catalog)

	var order []string
	for _, section := range sections {
		order = append(order, section.Aisle)
	}
	want := []string{"meat_seafood", "pantry", "canned"}
	if len(order) != len(want) {
		t.Fatalf("sections = %v, want %v", order, want)
	}
	for i := range want {
		if order[i] != want[i] {
			t.Fatalf("sections = %v, want %v", order, want)
		}
	}
}

func itemsByID(items []meals.GroceryItem) map[string]meals.GroceryItem {
	out := make(map[string]meals.GroceryItem, len(items))
	for _, item := range items {
		out[item.IngredientID] = item
	}
	return out
}

func mentions(values []string, substring string) bool {
	for _, value := range values {
		if strings.Contains(value, substring) {
			return true
		}
	}
	return false
}
