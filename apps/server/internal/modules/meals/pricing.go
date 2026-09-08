package meals

import (
	"math"
	"strconv"

	"github.com/helpthehive/server/internal/db"
)

// Half-width of the estimate band for each price tier. Tier 1 is a retailer
// feed and tier 4 a curated fallback, so the range widens as the source gets
// further from the till.
var tierSpread = map[int]float64{1: 0.08, 2: 0.15, 3: 0.25, 4: 0.35}

const unpricedSpread = 0.40

// ScaleFactor sizes a recipe to the household. A recipe that cannot be scaled
// is cooked as written.
func ScaleFactor(recipe db.Recipe, householdSize int) float64 {
	if !recipe.Scalable || recipe.Servings == nil || *recipe.Servings <= 0 {
		return 1
	}
	factor := float64(householdSize) / *recipe.Servings
	if factor < 0.25 {
		factor = 0.25
	}
	if factor > 8 {
		factor = 8
	}
	return math.Round(factor*100) / 100
}

// ServingsPlanned is what the household actually gets out of the pot.
func ServingsPlanned(recipe db.Recipe, householdSize int, scale float64) float64 {
	if recipe.Servings == nil || *recipe.Servings <= 0 {
		return float64(householdSize)
	}
	return math.Round(*recipe.Servings*scale*100) / 100
}

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
func collectNeeds(occurrences []PlannedRecipe, catalog *Catalog) map[string]*need {
	needs := map[string]*need{}
	for _, occurrence := range occurrences {
		recipe := occurrence.Recipe
		scale := occurrence.Scale
		if scale <= 0 {
			scale = 1
		}
		for _, line := range PurchasableLines(recipe) {
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
func priceNeed(entry *need, price db.IngredientPrice) (packages *int, estimate float64) {
	if price.Divisible || price.PackageSize <= 0 {
		return nil, roundCents(entry.qty * price.UnitPrice)
	}
	count := int(math.Ceil(entry.qty / price.PackageSize))
	if count < 1 {
		count = 1
	}
	return &count, roundCents(float64(count) * price.PackageSize * price.UnitPrice)
}

// costRange turns a priced basket into a range with a confidence. The spread is
// weighted by how much of the basket's value came from each tier, and any
// unpriced ingredient widens it and caps the confidence at low.
func costRange(items []GroceryItem, anyUnpriced bool) CostRange {
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
	total = roundCents(total)

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

	confidence := ConfidenceLow
	switch {
	case anyUnpriced:
		confidence = ConfidenceLow
	case spread <= 0.12:
		confidence = ConfidenceHigh
	case spread <= 0.22:
		confidence = ConfidenceMedium
	}
	if anyUnpriced {
		spread = math.Max(spread, unpricedSpread)
	}

	basis := "Estimated from Help The Hive's ingredient price data."
	return CostRange{
		Point:      total,
		Low:        roundCents(total * (1 - spread)),
		High:       roundCents(total * (1 + spread)),
		Confidence: confidence,
		TierMix:    tierMix,
		Basis:      &basis,
	}
}

// consumedCost is what one meal eats out of the basket: quantity times unit
// price, with no package rounding. It is not what the user pays at the till,
// and it is reported separately for that reason.
func consumedCost(recipe db.Recipe, scale float64, pantry map[string]bool, catalog *Catalog) *float64 {
	var total float64
	var priced bool
	for _, line := range PurchasableLines(recipe) {
		if line.IngredientID == nil || line.Quantity == nil {
			continue
		}
		ingredient, ok := catalog.Ingredient(*line.IngredientID)
		if !ok || ingredient.AssumedOnHand {
			continue
		}
		if catalog.Matches(ingredient.ID, pantry) {
			continue
		}
		price, ok := catalog.Price(ingredient.ID)
		if !ok {
			continue
		}
		total += *line.Quantity * scale * price.UnitPrice
		priced = true
	}
	if !priced {
		return nil
	}
	rounded := roundCents(total)
	return &rounded
}

func roundCents(value float64) float64 {
	return math.Round(value*100) / 100
}

func appendUnique(values []string, value string) []string {
	for _, existing := range values {
		if existing == value {
			return values
		}
	}
	return append(values, value)
}
