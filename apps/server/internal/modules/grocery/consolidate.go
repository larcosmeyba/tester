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
func BuildBasket(occurrences []meals.PlannedRecipe, pantry map[string]bool, catalog *meals.Catalog) meals.Basket {
	needs := collectNeeds(occurrences, catalog)

	var (
		items       []meals.GroceryItem
		unpriced    []string
		missingQty  []string
		anyUnpriced bool
	)

	for _, entry := range needs {
		item := meals.GroceryItem{
			IngredientID: entry.ingredientID,
			DisplayName:  entry.displayName,
			NeededQty:    roundQty(entry.qty),
			Unit:         entry.unit,
			UsedBy:       entry.usedBy,
		}

		if catalog.Matches(entry.ingredientID, pantry) {
			item.InPantry = true
			items = append(items, item)
			continue
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
	if len(pantry) > 0 {
		basket.Assumptions = append(basket.Assumptions, "Pantry items are counted as $0 for this trip.")
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
