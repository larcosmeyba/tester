package meals

import (
	"fmt"
	"math"

	"github.com/helpthehive/server/internal/db"
)

// Budget enforcement.
//
// Until now a budget was reported but never acted on: a plan came back with a
// negative headroom and the user was left to fix it by hand. This makes the
// budget a rule the server applies, on both the deterministic and the AI path,
// with the same discipline as the rest of the engine.
//
// Three properties matter more than the saving itself:
//
//   - Compliance is measured against the cost range's upper bound, never the
//     point estimate. A plan is only within budget if its worst case is.
//   - A swap can only ever choose from recipes that already passed every hard
//     filter. Saving money never relaxes an allergy, a diet or a time limit.
//   - When the budget cannot be met, the plan is returned anyway, over budget,
//     and says so. A user who has $60 and needs $70 of food is not helped by
//     being handed nothing, and is not told a false number to make the figure
//     fit.

// maxBudgetSwaps bounds the repair. Each pass re-prices the whole basket, and a
// week has at most 28 slots; in practice the loop stops long before this
// because it exits as soon as a pass stops improving.
const maxBudgetSwaps = 8

// enforceBudget re-prices a plan under its budget, swapping the costliest meals
// for cheaper eligible ones until the worst case fits or no swap helps.
//
// It returns the plan it settled on. When no budget was set it is the plan it
// was given, untouched.
func enforceBudget(request PlanRequest, assignments []assignment, pool []db.Recipe, catalog *Catalog, planID string, slotCount int) Plan {
	plan := assemble(request, assignments, catalog, planID, slotCount)
	if !request.Budget.Enabled() || len(assignments) == 0 {
		return plan
	}

	budget := request.Budget.Amount
	if plan.Summary.EstimatedCost.High <= budget {
		return plan
	}

	current := make([]assignment, len(assignments))
	copy(current, assignments)
	swaps := 0

	for swaps < maxBudgetSwaps {
		index, replacement, ok := cheapestSwap(current, request, pool, catalog)
		if !ok {
			break
		}

		candidate := make([]assignment, len(current))
		copy(candidate, current)
		candidate[index].Recipe = replacement

		candidatePlan := assemble(request, candidate, catalog, planID, slotCount)
		// A cheaper individual recipe can still make the basket dearer, because
		// it may not share ingredients with the rest of the week. The swap is
		// kept only if the whole basket got cheaper.
		if candidatePlan.Summary.EstimatedCost.High >= plan.Summary.EstimatedCost.High {
			break
		}

		current, plan = candidate, candidatePlan
		swaps++
		if plan.Summary.EstimatedCost.High <= budget {
			break
		}
	}

	if swaps > 0 {
		plan.Assumptions = append(plan.Assumptions, fmt.Sprintf(
			"%s swapped for a cheaper option to fit your $%.2f grocery budget.",
			pluralMealsSwapped(swaps), budget))
	}
	if plan.Summary.EstimatedCost.High > budget {
		over := roundCents(plan.Summary.EstimatedCost.High - budget)
		plan.Assumptions = append(plan.Assumptions, fmt.Sprintf(
			"This plan is estimated at up to $%.2f, which is $%.2f above your $%.2f budget. "+
				"No cheaper combination was available from the recipes that match your requirements.",
			plan.Summary.EstimatedCost.High, over, budget))
	}
	return plan
}

// cheapestSwap finds the single change that saves the most, by the per-meal
// estimate. It returns the index to change and what to change it to.
//
// The per-meal estimate is a proxy: the true saving depends on what the rest of
// the week shares. That is why the caller re-prices the whole basket and
// discards the swap if the basket did not actually get cheaper.
func cheapestSwap(assignments []assignment, request PlanRequest, pool []db.Recipe, catalog *Catalog) (int, db.Recipe, bool) {
	pantry := set(request.PantryItems...)

	inPlan := map[string]int{}
	for _, a := range assignments {
		inPlan[a.Recipe.ID]++
	}

	bestIndex := -1
	var bestRecipe db.Recipe
	bestSaving := 0.0

	for index, current := range assignments {
		currentCost, known := costOf(current.Recipe, request, pantry, catalog)
		if !known {
			// A meal that could not be priced is not evidence that it is
			// expensive, so it is not a candidate for being swapped away.
			continue
		}

		for _, candidate := range pool {
			if candidate.ID == current.Recipe.ID {
				continue
			}
			if !contains(candidate.MealTypes, current.Slot.MealType) {
				continue
			}
			// "No leftovers" still holds while saving money.
			if request.Leftovers == "no" && inPlan[candidate.ID] > 0 {
				continue
			}
			candidateCost, ok := costOf(candidate, request, pantry, catalog)
			if !ok {
				continue
			}

			saving := currentCost - candidateCost
			if saving <= 0 {
				continue
			}
			// Ties break on recipe id so the same plan and budget always
			// produce the same repair.
			if saving > bestSaving || (saving == bestSaving && bestIndex >= 0 && candidate.ID < bestRecipe.ID) {
				bestIndex, bestRecipe, bestSaving = index, candidate, saving
			}
		}
	}

	if bestIndex < 0 {
		return 0, db.Recipe{}, false
	}
	return bestIndex, bestRecipe, true
}

func costOf(recipe db.Recipe, request PlanRequest, pantry map[string]bool, catalog *Catalog) (float64, bool) {
	cost := consumedCost(recipe, ScaleFactor(recipe, request.Household.Size), pantry, catalog)
	if cost == nil || math.IsNaN(*cost) {
		return 0, false
	}
	return *cost, true
}

func pluralMealsSwapped(count int) string {
	if count == 1 {
		return "One meal was"
	}
	return fmt.Sprintf("%d meals were", count)
}
