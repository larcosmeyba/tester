package tools

import (
	"context"
	"strconv"
	"strings"

	"github.com/helpthehive/server/internal/auth"
	"github.com/helpthehive/server/internal/db"
	"github.com/helpthehive/server/internal/domain/meals"
)

type groceryItemView struct {
	IngredientID string  `json:"ingredient_id"`
	Name         string  `json:"name"`
	Quantity     float64 `json:"quantity"`
	Unit         string  `json:"unit,omitempty"`
	// An estimate, always. The field name says so, so that a model reading it
	// has no reason to describe it as a price.
	EstimatedPrice float64 `json:"estimated_price"`
	InPantry       bool    `json:"in_pantry"`
	Checked        bool    `json:"checked"`
}

type groceryListView struct {
	PlanID            string                       `json:"plan_id,omitempty"`
	Aisles            map[string][]groceryItemView `json:"aisles"`
	EstimatedCostLow  float64                      `json:"estimated_cost_low"`
	EstimatedCostHigh float64                      `json:"estimated_cost_high"`
	CostConfidence    string                       `json:"cost_confidence"`
	ItemCount         int                          `json:"item_count"`
}

func getGroceryList(ctx context.Context, g *Gateway, identity auth.Identity, args Args) (any, error) {
	planID, err := args.String("plan_id")
	if err != nil {
		return nil, err
	}
	result, err := g.services.Grocery.List(ctx, identity, planID)
	if err != nil {
		return nil, err
	}
	if result == nil {
		return map[string]any{"has_list": false}, nil
	}
	return map[string]any{"has_list": true, "list": groceryToView(*result)}, nil
}

// createGroceryList accepts a plan. Reached only after the user confirmed the
// proposal, because it commits the week and the spend that goes with it.
func createGroceryList(ctx context.Context, g *Gateway, identity auth.Identity, args Args) (any, error) {
	planID, err := args.String("plan_id")
	if err != nil {
		return nil, err
	}
	result, err := g.services.Grocery.Accept(ctx, identity, planID)
	if err != nil {
		return nil, err
	}
	return groceryToView(result), nil
}

func checkGroceryItem(ctx context.Context, g *Gateway, identity auth.Identity, args Args) (any, error) {
	planID, err := args.String("plan_id")
	if err != nil {
		return nil, err
	}
	ingredientID, err := args.String("ingredient_id")
	if err != nil {
		return nil, err
	}
	checked, err := args.Bool("checked")
	if err != nil {
		return nil, err
	}
	ok, err := g.services.Grocery.SetItemChecked(ctx, identity, planID, ingredientID, checked)
	if err != nil {
		return nil, err
	}
	return map[string]any{"updated": ok, "checked": checked}, nil
}

func groceryToView(result meals.GroceryListResult) groceryListView {
	view := groceryListView{
		Aisles:            make(map[string][]groceryItemView, len(result.Sections)),
		EstimatedCostLow:  result.Cost.Low,
		EstimatedCostHigh: result.Cost.High,
		CostConfidence:    result.Cost.Confidence,
	}
	if result.PlanID != nil {
		view.PlanID = *result.PlanID
	}
	for _, section := range result.Sections {
		items := make([]groceryItemView, 0, len(section.Items))
		for _, item := range section.Items {
			items = append(items, groceryItemView{
				IngredientID:   item.IngredientID,
				Name:           item.DisplayName,
				Quantity:       item.NeededQty,
				Unit:           item.Unit,
				EstimatedPrice: item.EstimatedPrice,
				InPantry:       item.InPantry,
				Checked:        item.IsChecked,
			})
		}
		view.Aisles[section.Aisle] = items
		view.ItemCount += len(items)
	}
	return view
}

// Budget lives here rather than in its own file because it is the same
// question as the grocery list, asked from the other end: what is this week
// going to cost against what the user said they could spend.

type budgetView struct {
	WeeklyBudget *float64 `json:"weekly_budget,omitempty"`
	// Absent when the user has no current plan.
	PlanEstimateLow  *float64 `json:"plan_estimate_low,omitempty"`
	PlanEstimateHigh *float64 `json:"plan_estimate_high,omitempty"`
	// Budget minus the high end of the estimate. Negative means the plan may
	// come in over. Computed here so that Penny quotes a number rather than
	// doing arithmetic, which is the thing models are worst at and users are
	// least forgiving about.
	Headroom *float64 `json:"headroom,omitempty"`
	Currency string   `json:"currency"`
}

func budgetSummary(ctx context.Context, g *Gateway, identity auth.Identity, _ Args) (any, error) {
	viewer, err := g.services.Users.Viewer(ctx, identity)
	if err != nil {
		return nil, err
	}

	view := budgetView{Currency: "USD"}
	if amount, ok := parseBudget(viewer.Preferences.WeeklyBudget); ok {
		view.WeeklyBudget = &amount
	}

	plan, err := g.services.MealPlans.Current(ctx, identity)
	if err != nil {
		return nil, err
	}
	if plan != nil {
		low := plan.Summary.EstimatedCost.Low
		high := plan.Summary.EstimatedCost.High
		view.PlanEstimateLow = &low
		view.PlanEstimateHigh = &high
		if view.WeeklyBudget != nil {
			headroom := *view.WeeklyBudget - high
			view.Headroom = &headroom
		}
	}
	return view, nil
}

// setWeeklyBudget runs only after confirmation: it changes every plan the user
// makes afterwards.
func setWeeklyBudget(ctx context.Context, g *Gateway, identity auth.Identity, args Args) (any, error) {
	amount, err := args.Float("amount")
	if err != nil {
		return nil, err
	}
	if amount <= 0 || amount > 5000 {
		return nil, errBudgetRange
	}

	// Stored as text because that is the column's type; formatted to cents so
	// a model's 119.999 does not become the user's budget.
	formatted := strconv.FormatFloat(amount, 'f', 2, 64)
	preferences, err := g.services.Users.UpdatePreferences(ctx, identity, db.PreferencesPatch{WeeklyBudget: &formatted}, nil)
	if err != nil {
		return nil, err
	}
	return map[string]any{"weekly_budget": preferences.WeeklyBudget, "currency": "USD"}, nil
}

var errBudgetRange = errBudget("amount must be between $0 and $5000")

type errBudget string

func (e errBudget) Error() string { return string(e) }

// parseBudget reads the stored budget, which is text and may be empty, a bare
// number, or something with a currency symbol on it.
func parseBudget(stored string) (float64, bool) {
	cleaned := strings.TrimSpace(strings.NewReplacer("$", "", ",", "").Replace(stored))
	if cleaned == "" {
		return 0, false
	}
	amount, err := strconv.ParseFloat(cleaned, 64)
	if err != nil || amount <= 0 {
		return 0, false
	}
	return amount, true
}
