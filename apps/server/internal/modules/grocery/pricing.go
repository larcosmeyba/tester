package grocery

import (
	"math"
	"strconv"

	"github.com/helpthehive/server/internal/domain/meals"
)

// Half-width of the estimate band for each price tier. Tier 1 is a retailer
// feed and tier 4 a curated fallback, so the range widens as the source gets
// further from the till.
var tierSpread = map[int]float64{1: 0.08, 2: 0.15, 3: 0.25, 4: 0.35}

const unpricedSpread = 0.40

// need is one ingredient's requirement across the whole plan.
type need struct {
	ingredientID string
	displayName  string
	unit         string
	qty          float64
	usedBy       []string
	// A line with no stated quantity contributes no number, only a note.
	quantityMissing bool
}

// collectNeeds walks every planned meal and totals what each ingredient is
// needed for, scaled to the household.
//
// It takes one entry per planned occurrence, not per distinct recipe: a dish
// cooked on two nights is bought for two nights. Ingredients the catalogue
// marks as always on hand — salt, pepper, water — are never collected.
func collectNeeds(occurrences []meals.PlannedRecipe, catalog *meals.Catalog) map[string]*need {
	needs := map[string]*need{}
	for _, occurrence := range occurrences {
		recipe := occurrence.Recipe
		scale := occurrence.Scale
		if scale <= 0 {
			scale = 1
		}
		for _, line := range meals.PurchasableLines(recipe) {
			if line.IngredientID == nil {
				continue
			}
			ingredient, ok := catalog.Ingredient(*line.IngredientID)
			if !ok || ingredient.AssumedOnHand {
				continue
			}
			entry := needs[ingredient.ID]
			if entry == nil {
				entry = &need{
					ingredientID: ingredient.ID,
					displayName:  ingredient.DisplayName,
					unit:         ingredient.PriceReferenceUnit,
				}
				needs[ingredient.ID] = entry
			}
			if line.Quantity == nil {
				entry.quantityMissing = true
			} else {
				entry.qty += *line.Quantity * scale
			}
			entry.usedBy = appendUnique(entry.usedBy, recipe.Title)
		}
	}
	return needs
}

// priceNeed turns a requirement into a purchasable quantity and an estimate.
// Loose goods are bought to the gram; packaged goods are bought whole, because
// that is what the till charges.
func priceNeed(entry *need, price meals.IngredientPrice) (packages *int, estimate float64) {
	if price.Divisible || price.PackageSize <= 0 {
		return nil, meals.RoundCents(entry.qty * price.UnitPrice)
	}
	count := int(math.Ceil(entry.qty / price.PackageSize))
	if count < 1 {
		count = 1
	}
	return &count, meals.RoundCents(float64(count) * price.PackageSize * price.UnitPrice)
}

// costRange turns a priced basket into a range with a confidence. The spread is
// weighted by how much of the basket's value came from each tier, and any
// unpriced ingredient widens it and caps the confidence at low.
func costRange(items []meals.GroceryItem, anyUnpriced bool) meals.CostRange {
	var total float64
	byTier := map[int]float64{}
	for _, item := range items {
		if item.InPantry {
			continue
		}
		total += item.EstimatedPrice
		if item.PriceTier != nil {
			byTier[*item.PriceTier] += item.EstimatedPrice
		}
	}
	total = meals.RoundCents(total)

	spread := unpricedSpread
	tierMix := map[string]float64{}
	if total > 0 {
		spread = 0
		for tier, value := range byTier {
			share := value / total
			tierMix[strconv.Itoa(tier)] = math.Round(share*1000) / 1000
			spread += share * tierSpread[tier]
		}
		if spread == 0 {
			spread = unpricedSpread
		}
	}

	confidence := meals.ConfidenceLow
	switch {
	case anyUnpriced:
		confidence = meals.ConfidenceLow
	case spread <= 0.12:
		confidence = meals.ConfidenceHigh
	case spread <= 0.22:
		confidence = meals.ConfidenceMedium
	}
	if anyUnpriced {
		spread = math.Max(spread, unpricedSpread)
	}

	basis := "Estimated from Help The Hive's ingredient price data."
	return meals.CostRange{
		Point:      total,
		Low:        meals.RoundCents(total * (1 - spread)),
		High:       meals.RoundCents(total * (1 + spread)),
		Confidence: confidence,
		TierMix:    tierMix,
		Basis:      &basis,
	}
}

func appendUnique(values []string, value string) []string {
	for _, existing := range values {
		if existing == value {
			return values
		}
	}
	return append(values, value)
}
