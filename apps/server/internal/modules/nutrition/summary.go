// Package nutrition owns what the meal system says about nutrition: the
// per-serving figures a recipe carries, and how many meals in a plan met the
// goal the user chose.
//
// It reports counts, never health claims, and it never converts a count into
// advice. It has no store of its own: recipe nutrition is a column on the
// recipe, and a plan's summary is derived from the meals in it.
package nutrition

import (
	"math"

	"github.com/helpthehive/server/internal/domain/meals"
)

// PrimaryGoal is the goal a plan is measured against: the first one the user
// chose. Nil when they chose none.
func PrimaryGoal(request meals.PlanRequest) *string {
	if len(request.NutritionPreferences) == 0 {
		return nil
	}
	goal := request.NutritionPreferences[0].Goal
	return &goal
}

// GoalSummary counts how many planned meals carry the user's first nutrition
// goal. It reports a count out of a total — never a percentage that hides the
// denominator, and never a health claim.
func GoalSummary(request meals.PlanRequest, planned []meals.PlannedMeal) *meals.NutritionGoalSummary {
	if len(request.NutritionPreferences) == 0 || len(planned) == 0 {
		return nil
	}
	goal := request.NutritionPreferences[0].Goal
	summary := &meals.NutritionGoalSummary{Goal: goal, Of: len(planned)}

	var proteinTotal float64
	var proteinCount int
	for _, meal := range planned {
		if meal.GoalIndicator != nil && *meal.GoalIndicator == goal {
			summary.MetBy++
		}
		if meal.ProteinGPerServing != nil {
			proteinTotal += *meal.ProteinGPerServing
			proteinCount++
		}
	}
	if proteinCount > 0 {
		average := math.Round(proteinTotal/float64(proteinCount)*10) / 10
		summary.AvgProteinG = &average
	}
	return summary
}
