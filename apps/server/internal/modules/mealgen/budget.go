package mealgen

import (
	"fmt"

	"github.com/helpthehive/server/internal/domain/meals"
)

// Budget enforcement.
//
// A budget used to be reported and then ignored: the summary carried a
// negative headroom and the user was left to fix it themselves, one swap at a
// time, against a number they could not see the parts of. This is the step
// that makes the budget a rule the server applies.
//
// Three properties matter more than the saving:
//
//   - Compliance is measured against the cost range's upper bound, never the
//     point estimate. A plan is only within budget if its worst case is. This
//     is the same rule summarize already uses for headroom, so the two can
//     never disagree.
//   - A swap chooses only from the eligible pool, which has already passed
//     every hard filter. Saving money can never relax an allergy, a required
//     diet, an equipment limit or a required cooking time.
//   - When the budget cannot be met the plan is returned anyway, over budget,
//     and says so. A household with $60 and $70 of need is not helped by being
//     handed nothing, and is not helped by a number bent to fit.
//
// It runs for the deterministic and the arranged plan alike, because it runs
// inside BuildWith: a week costs what it costs however it was chosen.
//
// It runs at generation only. Replacing a meal, regenerating a day or changing
// servings re-prices the stored plan without re-planning it, so a user who has
// deliberately chosen a dish never finds the server has quietly swapped it back
// out to save money. An edit that pushes a plan over budget is reported in the
// summary's headroom, and left to them.

// maxBudgetSwaps bounds the repair. Each pass re-prices the whole basket, and a
// week has at most 28 slots. In practice the loop stops well before this, since
// it exits as soon as a pass stops improving.
const maxBudgetSwaps = 8

// fitToBudget swaps the costliest meals for cheaper eligible ones until the
// plan's worst case fits, or no swap improves it.
//
// It returns the plan it settled on. With no budget set, that is the plan it
// was given, untouched and unremarked on.
func (p *Planner) fitToBudget(request meals.PlanRequest, pool []meals.Recipe, planID string, plan meals.Plan) meals.Plan {
	if !request.Budget.Enabled() || len(plan.Meals) == 0 {
		return plan
	}
	budget := request.Budget.Amount
	if plan.Summary.EstimatedCost.High <= budget {
		return plan
	}

	arrangement := make(map[meals.Slot]string, len(plan.Meals))
	for _, meal := range plan.Meals {
		arrangement[meal.Slot] = meal.RecipeID
	}

	swaps := 0
	for swaps < maxBudgetSwaps {
		slot, replacement, ok := p.cheapestSwap(request, pool, arrangement)
		if !ok {
			break
		}

		candidate := make(map[meals.Slot]string, len(arrangement))
		for k, v := range arrangement {
			candidate[k] = v
		}
		candidate[slot] = replacement

		candidatePlan := p.assemble(request, pool, planID, candidate)
		// A cheaper individual recipe can still make the basket dearer: it may
		// share nothing with the rest of the week, so a package is bought for
		// it alone. The swap is kept only when the whole basket improved.
		if candidatePlan.Summary.EstimatedCost.High >= plan.Summary.EstimatedCost.High {
			break
		}

		plan, arrangement = candidatePlan, candidate
		swaps++
		if plan.Summary.EstimatedCost.High <= budget {
			break
		}
	}

	if swaps > 0 {
		plan.Assumptions = append(plan.Assumptions, fmt.Sprintf(
			"%s swapped for a cheaper option to fit your $%.2f grocery budget.",
			mealsSwapped(swaps), budget))
	}
	if plan.Summary.EstimatedCost.High > budget {
		over := meals.RoundCents(plan.Summary.EstimatedCost.High - budget)
		plan.Assumptions = append(plan.Assumptions, fmt.Sprintf(
			"This plan is estimated at up to $%.2f, which is $%.2f above your $%.2f budget. "+
				"No cheaper combination was available from the recipes that match your requirements.",
			plan.Summary.EstimatedCost.High, over, budget))
	}
	return plan
}

// cheapestSwap finds the single change that saves the most by the per-meal
// estimate, and returns the slot to change and what to change it to.
//
// The per-meal estimate is a proxy: what a swap truly saves depends on what the
// rest of the week shares. That is why the caller re-prices the whole basket and
// discards the swap when the basket did not actually get cheaper.
func (p *Planner) cheapestSwap(request meals.PlanRequest, pool []meals.Recipe, arrangement map[meals.Slot]string) (meals.Slot, string, bool) {
	pantry := meals.Set(request.PantryItems...)

	byID := make(map[string]meals.Recipe, len(pool))
	for _, recipe := range pool {
		byID[recipe.ID] = recipe
	}
	used := map[string]int{}
	for _, recipeID := range arrangement {
		used[recipeID]++
	}

	var bestSlot meals.Slot
	var bestRecipe string
	bestSaving := 0.0
	found := false

	for _, slot := range RequestedSlots(request) {
		currentID, ok := arrangement[slot]
		if !ok {
			continue
		}
		current, ok := byID[currentID]
		if !ok {
			continue
		}
		currentCost, known := mealCost(current, request, pantry, p.Catalog)
		if !known {
			// A meal that could not be priced is not evidence that it is
			// expensive, so it is never the one chosen to be swapped away.
			continue
		}

		for _, candidate := range pool {
			if candidate.ID == currentID || !contains(candidate.MealTypes, slot.MealType) {
				continue
			}
			// The leftovers preference still holds while saving money.
			switch request.Leftovers {
			case "no":
				if used[candidate.ID] > 0 {
					continue
				}
			case "sometimes":
				if used[candidate.ID] >= 2 {
					continue
				}
			}
			candidateCost, ok := mealCost(candidate, request, pantry, p.Catalog)
			if !ok {
				continue
			}
			saving := currentCost - candidateCost
			if saving <= 0 {
				continue
			}
			// Ties break on recipe id, so the same plan and the same budget
			// always produce the same repair.
			if saving > bestSaving || (saving == bestSaving && found && candidate.ID < bestRecipe) {
				bestSlot, bestRecipe, bestSaving, found = slot, candidate.ID, saving, true
			}
		}
	}
	return bestSlot, bestRecipe, found
}

func mealCost(recipe meals.Recipe, request meals.PlanRequest, pantry map[string]bool, catalog *meals.Catalog) (float64, bool) {
	cost := consumedCost(recipe, meals.ScaleFactor(recipe, request.Household.Size), pantry, catalog)
	if cost == nil {
		return 0, false
	}
	return *cost, true
}

func mealsSwapped(count int) string {
	if count == 1 {
		return "One meal was"
	}
	return fmt.Sprintf("%d meals were", count)
}
