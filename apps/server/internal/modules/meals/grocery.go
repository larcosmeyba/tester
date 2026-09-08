package meals

import (
	"sort"
	"strconv"

	"github.com/helpthehive/server/internal/db"
)

// Basket is a consolidated, pantry-aware shopping list for a set of recipes.
type Basket struct {
	Items []GroceryItem
	Cost  CostRange
	// Notes the user is entitled to see: what could not be priced, and what was
	// assumed. They are facts about the computation, never reassurance.
	Assumptions []string
}

// PlannedRecipe is one occurrence of a recipe in a plan, at the scale it will
// be cooked. A dish planned for two nights appears twice.
type PlannedRecipe struct {
	Recipe db.Recipe
	Scale  float64
}

// BuildBasket consolidates every planned occurrence's ingredient needs into one
// list.
//
// Ingredients already in the pantry stay on the list with InPantry true and a
// zero estimate rather than disappearing, so nothing silently goes missing from
// a shop. Ingredients with no price row are listed with a zero estimate and
// recorded in Assumptions — a missing price is never treated as free.
func BuildBasket(occurrences []PlannedRecipe, pantry map[string]bool, catalog *Catalog) Basket {
	needs := collectNeeds(occurrences, catalog)

	var (
		items       []GroceryItem
		unpriced    []string
		missingQty  []string
		anyUnpriced bool
	)

	for _, entry := range needs {
		item := GroceryItem{
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

	basket := Basket{Items: items, Cost: costRange(items, anyUnpriced)}
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
func GroupByAisle(items []GroceryItem, catalog *Catalog) []GrocerySection {
	byAisle := map[string][]GroceryItem{}
	for _, item := range items {
		aisle := "other"
		if ingredient, ok := catalog.Ingredient(item.IngredientID); ok && ingredient.Aisle != "" {
			aisle = ingredient.Aisle
		}
		byAisle[aisle] = append(byAisle[aisle], item)
	}

	var sections []GrocerySection
	for _, aisle := range AisleOrder {
		if grouped, ok := byAisle[aisle]; ok {
			sections = append(sections, GrocerySection{Aisle: aisle, Items: grouped})
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
		sections = append(sections, GrocerySection{Aisle: aisle, Items: byAisle[aisle]})
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
