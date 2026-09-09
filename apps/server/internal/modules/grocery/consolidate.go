// Package grocery consolidates a set of planned recipes into one shopping
// list, prices it, and saves the list a user shops from.
//
// It is separate from the generator on purpose: the same consolidation prices a
// generated week, an ad-hoc "choose my recipes" selection and a re-priced plan
// after a swap, and none of those should have to go through the planner.
package grocery

import (
	"sort"
	"strconv"

	"github.com/helpthehive/server/internal/domain/meals"
)

// BuildBasket consolidates every planned occurrence's ingredient needs into one
// list.
//
// Ingredients already in the pantry stay on the list with InPantry true and a
// zero estimate rather than disappearing, so nothing silently goes missing from
// a shop. Ingredients with no price row are listed with a zero estimate and
// recorded in Assumptions — a missing price is never treated as free.
// BuildBasket consolidates a set of planned recipes into a shopping list,
// treating the pantry as presence-only: an owned ingredient is free.
//
// Kept for the callers that genuinely have no quantities. It delegates to
// BuildBasketWithHoldings with every holding marked unknown, so there is one
// implementation and the two can never drift.
func BuildBasket(occurrences []meals.PlannedRecipe, pantry map[string]bool, catalog *meals.Catalog) meals.Basket {
	ids := make([]string, 0, len(pantry))
	for id := range pantry {
		ids = append(ids, id)
	}
	return BuildBasketWithHoldings(occurrences, meals.HoldingsFromIDs(ids), catalog)
}

// BuildBasketWithHoldings is the quantity-aware consolidation.
//
// Where a holding carries a usable amount in a comparable unit, only the
// shortfall is bought: two cups of rice needed against one owned is one cup on
// the list, not zero. Where the amount is unknown — which is most pantry rows,
// because people write "a bag" — the line is covered but flagged, so a shopper
// is told to check rather than being quietly assured.
func BuildBasketWithHoldings(occurrences []meals.PlannedRecipe, holdings map[string]meals.PantryHolding, catalog *meals.Catalog) meals.Basket {
	needs := collectNeeds(occurrences, catalog)

	var (
		items          []meals.GroceryItem
		unpriced       []string
		missingQty     []string
		uncheckedQty   []string
		partiallyOwned []string
		anyUnpriced    bool
	)

	for _, entry := range needs {
		item := meals.GroceryItem{
			IngredientID: entry.ingredientID,
			DisplayName:  entry.displayName,
			NeededQty:    roundQty(entry.qty),
			Unit:         entry.unit,
			UsedBy:       entry.usedBy,
		}

		holding, owned := holdingFor(entry.ingredientID, holdings, catalog)
		if owned {
			remaining, coverage := meals.Subtract(entry.qty, entry.unit, holding)
			switch coverage {
			case meals.CoverageFull:
				item.InPantry = true
				items = append(items, item)
				continue
			case meals.CoverageUnknown:
				// Owned, amount not usable. The requirement stays in full and
				// gets priced: an unmeasured jar is not evidence of enough, and
				// over-buying is the recoverable mistake here.
				item.PantryMayCover = true
				uncheckedQty = append(uncheckedQty, entry.displayName)
			case meals.CoveragePartial:
				// Buy the shortfall. The line stays on the list at the reduced
				// quantity, priced normally from here down.
				partiallyOwned = append(partiallyOwned, entry.displayName)
				item.PartiallyInPantry = true
				entry.qty = remaining
				item.NeededQty = roundQty(remaining)
			}
		}

		price, ok := catalog.Price(entry.ingredientID)
		if !ok || entry.qty <= 0 {
			anyUnpriced = true
			unpriced = append(unpriced, entry.displayName)
			items = append(items, item)
			continue
		}

		packages, estimate := priceNeed(entry, price)
		item.Packages = packages
		item.EstimatedPrice = estimate
		tier := price.Tier
		item.PriceTier = &tier
		if packages != nil {
			label := formatPackageLabel(price.PackageSize, entry.unit)
			item.PackageLabel = &label
		}
		items = append(items, item)

		if entry.quantityMissing {
			missingQty = append(missingQty, entry.displayName)
		}
	}

	sort.Slice(items, func(i, j int) bool { return items[i].DisplayName < items[j].DisplayName })

	basket := meals.Basket{Items: items, Cost: costRange(items, anyUnpriced)}
	basket.Assumptions = append(basket.Assumptions,
		"Prices are estimates and vary by store.",
		"Salt, pepper and water are assumed to be on hand.")
	if len(holdings) > 0 {
		basket.Assumptions = append(basket.Assumptions, "Pantry items are counted as $0 for this trip.")
	}
	if len(uncheckedQty) > 0 {
		basket.Assumptions = append(basket.Assumptions,
			"These are still on the list in full because you did not say how much you have. "+
				"Your pantry may already cover some or all of them: "+joinDisplay(uncheckedQty)+".")
	}
	if len(partiallyOwned) > 0 {
		basket.Assumptions = append(basket.Assumptions,
			"Only the shortfall is listed for these, because you already have some: "+
				joinDisplay(partiallyOwned)+".")
	}
	if len(unpriced) > 0 {
		basket.Assumptions = append(basket.Assumptions,
			"Some ingredients could not be priced and are not included in the estimate: "+
				joinDisplay(unpriced)+".")
	}
	if len(missingQty) > 0 {
		basket.Assumptions = append(basket.Assumptions,
			"Some recipes did not state a quantity, so these may need checking: "+
				joinDisplay(missingQty)+".")
	}
	return basket
}

// GroupByAisle arranges a basket into store sections in shopping order.
func GroupByAisle(items []meals.GroceryItem, catalog *meals.Catalog) []meals.GrocerySection {
	byAisle := map[string][]meals.GroceryItem{}
	for _, item := range items {
		aisle := "other"
		if ingredient, ok := catalog.Ingredient(item.IngredientID); ok && ingredient.Aisle != "" {
			aisle = ingredient.Aisle
		}
		byAisle[aisle] = append(byAisle[aisle], item)
	}

	var sections []meals.GrocerySection
	for _, aisle := range meals.AisleOrder {
		if grouped, ok := byAisle[aisle]; ok {
			sections = append(sections, meals.GrocerySection{Aisle: aisle, Items: grouped})
			delete(byAisle, aisle)
		}
	}
	// Anything with an aisle the catalogue introduced after this list was
	// written still gets shown rather than dropped.
	remaining := make([]string, 0, len(byAisle))
	for aisle := range byAisle {
		remaining = append(remaining, aisle)
	}
	sort.Strings(remaining)
	for _, aisle := range remaining {
		sections = append(sections, meals.GrocerySection{Aisle: aisle, Items: byAisle[aisle]})
	}
	return sections
}

func roundQty(value float64) float64 {
	return float64(int(value*1000+0.5)) / 1000
}

func formatPackageLabel(size float64, unit string) string {
	return trimFloat(size) + " " + unit
}

func trimFloat(value float64) string {
	return strconv.FormatFloat(value, 'f', -1, 64)
}

func joinDisplay(values []string) string {
	sort.Strings(values)
	out := ""
	for i, value := range values {
		switch {
		case i == 0:
			out = value
		case i == len(values)-1:
			out += " and " + value
		default:
			out += ", " + value
		}
	}
	return out
}

// PurchaseSections is the list with everything the user already owns removed:
// only what must actually be bought.
//
// It is offered *alongside* the full list rather than instead of it. The full
// list keeps pantry items visible at a zero estimate, because a shopper who
// cannot see that rice is already at home has no way to know whether it was
// considered or simply forgotten. Which of the two a screen shows is a
// presentation decision, and both are computed from the same basket so they can
// never disagree.
func PurchaseSections(sections []meals.GrocerySection) []meals.GrocerySection {
	out := make([]meals.GrocerySection, 0, len(sections))
	for _, section := range sections {
		items := make([]meals.GroceryItem, 0, len(section.Items))
		for _, item := range section.Items {
			if item.InPantry {
				continue
			}
			items = append(items, item)
		}
		if len(items) > 0 {
			out = append(out, meals.GrocerySection{Aisle: section.Aisle, Items: items})
		}
	}
	return out
}

// PurchaseCost is what the items still to buy add up to. It is the same
// arithmetic the basket already did — pantry items are priced at zero — and is
// exposed separately so a screen showing only the shopping list can show a
// total that matches it.
func PurchaseCost(sections []meals.GrocerySection) float64 {
	var total float64
	for _, section := range sections {
		for _, item := range section.Items {
			if item.InPantry {
				continue
			}
			total += item.EstimatedPrice
		}
	}
	return meals.RoundCents(total)
}

// holdingFor looks up what the user has of an ingredient, following the
// catalogue's parent relationship the same way the presence check always did:
// owning "chicken" covers a recipe calling for chicken thighs.
func holdingFor(ingredientID string, holdings map[string]meals.PantryHolding, catalog *meals.Catalog) (meals.PantryHolding, bool) {
	if len(holdings) == 0 {
		return meals.PantryHolding{}, false
	}
	if holding, ok := holdings[ingredientID]; ok {
		return holding, true
	}
	if !catalog.Matches(ingredientID, meals.PantryIDs(holdings)) {
		return meals.PantryHolding{}, false
	}
	// Matched through a parent. The parent's quantity is not this ingredient's
	// quantity — a pound of "chicken" is not a pound of "chicken thighs" for
	// subtraction purposes — so the amount is deliberately dropped and the
	// coverage is unknown.
	for id, holding := range holdings {
		if catalog.Matches(ingredientID, map[string]bool{id: true}) {
			// A parent's quantity is not the child's — a pound of "chicken" is
			// not a pound of chicken thighs — so the amount is dropped and the
			// coverage falls through to unknown.
			return meals.PantryHolding{
				IngredientID:  holding.IngredientID,
				UseFirst:      holding.UseFirst,
				AssumeCovered: holding.AssumeCovered,
			}, true
		}
	}
	return meals.PantryHolding{}, false
}
