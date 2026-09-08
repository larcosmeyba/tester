package grocery

import (
	"testing"

	"github.com/helpthehive/server/internal/domain/meals"
	"github.com/helpthehive/server/internal/modules/grocery/retailer"
	fx "github.com/helpthehive/server/internal/testsupport/mealfixtures"
)

// The purchase-only view of a list, and the retailer seam.
//
// The full list keeps pantry items visible at a zero estimate; the purchase
// view removes them. Both come from the same basket, so the thing worth testing
// is that they cannot disagree.

func TestPurchaseSectionsRemoveWhatIsAlreadyOwned(t *testing.T) {
	catalog := fx.Catalog()
	recipe := fx.Recipe("bowl", 4, []string{"dinner"},
		fx.Line(1, "rice", 2), fx.Line(2, "beans", 1), fx.Line(3, "chicken", 1))

	basket := BuildBasket(
		[]meals.PlannedRecipe{{Recipe: recipe, Scale: 1}},
		meals.Set("rice"),
		catalog,
	)
	sections := GroupByAisle(basket.Items, catalog)

	full := countItems(sections)
	purchase := countItems(PurchaseSections(sections))

	if full != 3 {
		t.Fatalf("full list has %d items, want all 3 — a pantry item is shown, not hidden", full)
	}
	if purchase != 2 {
		t.Fatalf("purchase list has %d items, want 2 — only what must be bought", purchase)
	}
	for _, section := range PurchaseSections(sections) {
		for _, item := range section.Items {
			if item.InPantry {
				t.Fatalf("%s is in the pantry and must not be on the shopping list", item.IngredientID)
			}
		}
	}
}

// The two views must agree on money. A pantry item is priced at zero in the
// full list, so removing it cannot change the total.
func TestPurchaseCostMatchesTheBasketTotal(t *testing.T) {
	catalog := fx.Catalog()
	recipe := fx.Recipe("bowl", 4, []string{"dinner"},
		fx.Line(1, "rice", 2), fx.Line(2, "beans", 1))

	basket := BuildBasket(
		[]meals.PlannedRecipe{{Recipe: recipe, Scale: 1}},
		meals.Set("rice"),
		catalog,
	)
	sections := GroupByAisle(basket.Items, catalog)

	if got := PurchaseCost(sections); got != basket.Cost.Point {
		t.Fatalf("purchase cost = %v, basket point = %v; removing zero-priced pantry items must not change the total",
			got, basket.Cost.Point)
	}
}

func TestPurchaseSectionsDropAnAisleThatBecomesEmpty(t *testing.T) {
	catalog := fx.Catalog()
	recipe := fx.Recipe("bowl", 4, []string{"dinner"}, fx.Line(1, "chicken", 1))

	basket := BuildBasket(
		[]meals.PlannedRecipe{{Recipe: recipe, Scale: 1}},
		meals.Set("chicken"),
		catalog,
	)
	sections := GroupByAisle(basket.Items, catalog)

	if len(sections) == 0 {
		t.Fatal("the full list should still show the pantry item")
	}
	if got := PurchaseSections(sections); len(got) != 0 {
		t.Fatalf("purchase sections = %v, want none: there is nothing to buy", got)
	}
}

func TestUnconfiguredRetailerReportsItselfRatherThanFailing(t *testing.T) {
	cart, err := retailer.Unconfigured{}.Prepare(t.Context(), meals.GroceryListResult{})

	if err == nil {
		t.Fatal("an unconfigured retailer must say so")
	}
	if cart.CheckoutURL != "" {
		t.Fatal("an unconfigured retailer must not return somewhere to send the user")
	}
	var handoff retailer.Handoff = retailer.Unconfigured{}
	if handoff.Name() != "none" {
		t.Fatal("the default handoff should name itself")
	}
}

func countItems(sections []meals.GrocerySection) int {
	var total int
	for _, section := range sections {
		total += len(section.Items)
	}
	return total
}
