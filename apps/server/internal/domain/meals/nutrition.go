package meals

// NutritionGoalSummary reports how many planned meals met the user's primary
// nutrition goal. MetBy of Of, never a percentage that hides the denominator.
type NutritionGoalSummary struct {
	Goal        string
	MetBy       int
	Of          int
	AvgProteinG *float64
}

// BalancedMealBaseline is the fallback ranking applied when the user stated no
// nutrition goal. Applied says whether it was used at all.
type BalancedMealBaseline struct {
	Applied  bool
	AvgScore *float64
}
