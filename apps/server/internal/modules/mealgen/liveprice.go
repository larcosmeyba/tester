package mealgen

import (
	"context"
	"log/slog"

	"github.com/helpthehive/server/internal/domain/meals"
	"github.com/helpthehive/server/internal/modules/kroger"
)

// LivePricer re-prices a plan's grocery list with live Kroger quotes for the
// user's area. When Kroger is unconfigured, the postal code is missing, or no
// store is found, it returns the plan unchanged — live pricing is an upgrade,
// never a requirement.
//
// Items with a live quote get their EstimatedPrice replaced and PriceTier set
// to 1 (live retailer). Items without one keep their stored estimates.
type LivePricer struct {
	kroger kroger.Provider
	logger *slog.Logger
}

func NewLivePricer(p kroger.Provider, logger *slog.Logger) *LivePricer {
	if logger == nil {
		logger = slog.Default()
	}
	if p == nil {
		p = kroger.Unconfigured{}
	}
	return &LivePricer{kroger: p, logger: logger}
}

// PricePlan returns a copy of the plan with live Kroger prices applied to the
// grocery list, plus the number of items that got a live quote. When live
// pricing is unavailable it returns the plan unchanged and 0.
func (l *LivePricer) PricePlan(ctx context.Context, postalCode string, plan meals.Plan) (meals.Plan, int) {
	if l == nil || !l.kroger.Available() || postalCode == "" || len(plan.GroceryList) == 0 {
		return plan, 0
	}

	// Find the nearest Kroger-family store to the user.
	stores, err := l.kroger.NearbyStores(ctx, postalCode, 1)
	if err != nil || len(stores) == 0 {
		l.logger.Warn("kroger store lookup failed, keeping estimates",
			"postal_code", postalCode, "error", err)
		return plan, 0
	}
	locationID := stores[0].LocationID
	l.logger.Info("pricing plan with live kroger quotes",
		"postal_code", postalCode, "store", stores[0].Name)

	liveCount := 0
	for si, section := range plan.GroceryList {
		for ii, item := range section.Items {
			if item.InPantry {
				continue
			}
			quote, err := l.kroger.Quote(ctx, kroger.QuoteRequest{
				Term:       item.DisplayName,
				LocationID: locationID,
			})
			if err != nil || !quote.Live {
				continue
			}
			// Quote.Price.Cents is per package; scale to the needed
			// quantity via the item's package count when known.
			priceDollars := float64(quote.Price.Cents) / 100
			if item.Packages != nil && *item.Packages > 0 {
				priceDollars = priceDollars * float64(*item.Packages)
			}
			tier := 1
			plan.GroceryList[si].Items[ii].EstimatedPrice = priceDollars
			plan.GroceryList[si].Items[ii].PriceTier = &tier
			liveCount++
		}
	}

	if liveCount > 0 {
		l.logger.Info("live kroger prices applied",
			"items", liveCount, "store", stores[0].Name)
		// Recompute the plan summary cost from the live grocery list.
		plan.Summary = recostSummary(plan)
	}
	return plan, liveCount
}

// recostSummary rebuilds the estimated cost range from the grocery list's
// (possibly live) item prices.
func recostSummary(plan meals.Plan) meals.PlanSummary {
	var total float64
	for _, section := range plan.GroceryList {
		for _, item := range section.Items {
			if !item.InPantry {
				total += item.EstimatedPrice
			}
		}
	}
	summary := plan.Summary
	// A 10% range around the total keeps the honest "estimates" framing
	// while reflecting the live prices.
	summary.EstimatedCost.Low = meals.RoundCents(total * 0.95)
	summary.EstimatedCost.High = meals.RoundCents(total * 1.05)
	summary.EstimatedCost.Point = meals.RoundCents(total)
	return summary
}
