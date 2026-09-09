package grocery

import (
	"testing"

	"github.com/helpthehive/server/internal/domain/meals"
	fx "github.com/helpthehive/server/internal/testsupport/mealfixtures"
)

// Quantity-aware consolidation: owning some of an ingredient should buy the
// shortfall, not zero and not the lot.
//
// The fixtures state their lines in pounds, so the holdings do too.

func amount(v float64) *float64 { return &v }

func holdings(hs ...meals.PantryHolding) map[string]meals.PantryHolding {
	return meals.HoldingsByIngredient(hs)
}

// The example from the brief, in the units the fixtures use: a recipe needs 2
// lb of chicken, the user has 1 lb, so 1 lb goes on the list.
func TestPartialPantryCoverageBuysOnlyTheShortfall(t *testing.T) {
	catalog := fx.Catalog()
	dish := fx.Recipe("dish", 4, []string{"dinner"}, fx.Line(1, "chicken", 2))

	basket := BuildBasketWithHoldings(
		[]meals.PlannedRecipe{{Recipe: dish, Scale: 1}},
		holdings(meals.PantryHolding{IngredientID: "chicken", Amount: amount(1), Unit: "lb"}),
		catalog,
	)
	chicken := itemsByID(basket.Items)["chicken"]

	if chicken.InPantry {
		t.Error("chicken is marked fully in-pantry; only half of it is")
	}
	if !chicken.PartiallyInPantry {
		t.Error("chicken is not marked as partially owned, so a shopper cannot tell why the quantity dropped")
	}
	if chicken.NeededQty != 1 {
		t.Fatalf("needed = %v lb, want 1 — 2 needed, 1 owned", chicken.NeededQty)
	}
	if chicken.EstimatedPrice <= 0 {
		t.Error("the shortfall was not priced")
	}
	if !mentions(basket.Assumptions, "already have some") {
		t.Errorf("assumptions = %v, want the partial coverage stated", basket.Assumptions)
	}
}

func TestFullPantryCoverageBuysNothing(t *testing.T) {
	catalog := fx.Catalog()
	dish := fx.Recipe("dish", 4, []string{"dinner"}, fx.Line(1, "chicken", 2))

	basket := BuildBasketWithHoldings(
		[]meals.PlannedRecipe{{Recipe: dish, Scale: 1}},
		holdings(meals.PantryHolding{IngredientID: "chicken", Amount: amount(5), Unit: "lb"}),
		catalog,
	)
	chicken := itemsByID(basket.Items)["chicken"]

	if !chicken.InPantry || chicken.EstimatedPrice != 0 {
		t.Fatalf("chicken = %+v, want fully covered at zero cost", chicken)
	}
	if chicken.PartiallyInPantry {
		t.Error("chicken should not be marked partial: there is more than enough")
	}
}

// The common case, and the one that must not silently over-promise.
func TestUnknownPantryQuantityIsCoveredButFlagged(t *testing.T) {
	catalog := fx.Catalog()
	dish := fx.Recipe("dish", 4, []string{"dinner"}, fx.Line(1, "chicken", 2))

	basket := BuildBasketWithHoldings(
		[]meals.PlannedRecipe{{Recipe: dish, Scale: 1}},
		holdings(meals.PantryHolding{IngredientID: "chicken"}),
		catalog,
	)
	chicken := itemsByID(basket.Items)["chicken"]

	if !chicken.InPantry || chicken.EstimatedPrice != 0 {
		t.Fatalf("chicken = %+v, want treated as covered", chicken)
	}
	if !mentions(basket.Assumptions, "did not say how much") {
		t.Fatalf("assumptions = %v, want the unknown quantity said out loud", basket.Assumptions)
	}
}

// Incomparable units must not be converted into a number nobody can justify.
func TestIncomparableUnitsFallBackToUnknown(t *testing.T) {
	catalog := fx.Catalog()
	dish := fx.Recipe("dish", 4, []string{"dinner"}, fx.Line(1, "chicken", 2)) // lb

	basket := BuildBasketWithHoldings(
		[]meals.PlannedRecipe{{Recipe: dish, Scale: 1}},
		holdings(meals.PantryHolding{IngredientID: "chicken", Amount: amount(3), Unit: "cup"}),
		catalog,
	)
	chicken := itemsByID(basket.Items)["chicken"]

	if !chicken.InPantry {
		t.Error("chicken should still be treated as owned")
	}
	if chicken.PartiallyInPantry {
		t.Error("no partial quantity should have been computed from cups against pounds")
	}
	if !mentions(basket.Assumptions, "did not say how much") {
		t.Errorf("assumptions = %v, want it reported as an unchecked quantity", basket.Assumptions)
	}
}

// Two nights of the same dish need two nights of ingredients; a fixed holding
// covers proportionally less.
func TestShortfallGrowsWithTheNumberOfMeals(t *testing.T) {
	catalog := fx.Catalog()
	dish := fx.Recipe("dish", 4, []string{"dinner"}, fx.Line(1, "chicken", 2))
	owned := holdings(meals.PantryHolding{IngredientID: "chicken", Amount: amount(1), Unit: "lb"})

	once := BuildBasketWithHoldings([]meals.PlannedRecipe{{Recipe: dish, Scale: 1}}, owned, catalog)
	twice := BuildBasketWithHoldings(
		[]meals.PlannedRecipe{{Recipe: dish, Scale: 1}, {Recipe: dish, Scale: 1}}, owned, catalog)

	first := itemsByID(once.Items)["chicken"].NeededQty
	second := itemsByID(twice.Items)["chicken"].NeededQty
	if second <= first {
		t.Fatalf("one night needs %v lb and two nights %v lb; the second should be larger", first, second)
	}
	if second != 3 {
		t.Fatalf("two nights = %v lb, want 3 — 4 needed, 1 owned", second)
	}
}

func TestOwningNothingIsUnchanged(t *testing.T) {
	catalog := fx.Catalog()
	dish := fx.Recipe("dish", 4, []string{"dinner"}, fx.Line(1, "chicken", 2))

	withNone := BuildBasketWithHoldings([]meals.PlannedRecipe{{Recipe: dish, Scale: 1}}, nil, catalog)
	legacy := BuildBasket([]meals.PlannedRecipe{{Recipe: dish, Scale: 1}}, nil, catalog)

	a, b := itemsByID(withNone.Items)["chicken"], itemsByID(legacy.Items)["chicken"]
	if a.NeededQty != b.NeededQty || a.EstimatedPrice != b.EstimatedPrice {
		t.Fatalf("quantity-aware = %+v, presence-only = %+v; an empty pantry must behave identically", a, b)
	}
}

// The presence-only entry point must keep behaving exactly as it did, because
// several callers still use it.
func TestPresenceOnlyEntryPointStillZeroesOwnedItems(t *testing.T) {
	catalog := fx.Catalog()
	dish := fx.Recipe("dish", 4, []string{"dinner"}, fx.Line(1, "chicken", 2))

	basket := BuildBasket([]meals.PlannedRecipe{{Recipe: dish, Scale: 1}}, meals.Set("chicken"), catalog)
	chicken := itemsByID(basket.Items)["chicken"]

	if !chicken.InPantry || chicken.EstimatedPrice != 0 {
		t.Fatalf("chicken = %+v, want in-pantry at zero cost", chicken)
	}
}
