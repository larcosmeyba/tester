package mealgen

import (
	"context"
	"fmt"
	"log/slog"
	"strings"

	"github.com/helpthehive/server/internal/domain/meals"
	"github.com/helpthehive/server/internal/modules/mealgen/provider"
)

// Narrator turns a finished, priced plan into Penny's message.
//
// The plan is complete before this runs. If the provider is unavailable, slow,
// or returns something that fails validation, the deterministic sentence below
// is used and the user's plan is unaffected — an AI outage never costs someone
// their meal plan.
type Narrator struct {
	Provider provider.Provider
	Logger   *slog.Logger
}

func NewNarrator(p provider.Provider, logger *slog.Logger) *Narrator {
	if p == nil {
		p = provider.Disabled{}
	}
	if logger == nil {
		logger = slog.Default()
	}
	return &Narrator{Provider: p, Logger: logger}
}

// Describe returns the message and the source it came from ("ai" or
// "deterministic"), which is recorded on the plan.
func (n *Narrator) Describe(ctx context.Context, plan meals.Plan) (string, string) {
	fallback := DeterministicMessage(plan)

	facts := factsFrom(plan)
	prompt, err := facts.UserPrompt()
	if err != nil {
		return fallback, "deterministic"
	}

	response, err := n.Provider.Complete(ctx, provider.Request{
		System:    provider.SystemPrompt,
		User:      prompt,
		MaxTokens: 300,
	})
	if err != nil {
		// Not an error the user needs to see, and nothing identifying is
		// logged: the plan id is enough to trace it.
		if err != provider.ErrNoProvider {
			n.Logger.Warn("meal narration unavailable", "plan_id", plan.PlanID, "error", err.Error())
		}
		return fallback, "deterministic"
	}

	message, err := provider.ValidateMessage(response.Text, facts)
	if err != nil {
		// A rejected reply is a safety event worth seeing. The reply itself is
		// not logged, because it may contain whatever the model made up.
		n.Logger.Warn("meal narration rejected",
			"plan_id", plan.PlanID, "provider", response.Provider, "reason", err.Error())
		return fallback, "deterministic"
	}
	return message, "ai"
}

func factsFrom(plan meals.Plan) provider.PlanFacts {
	titles := make([]string, 0, len(plan.Meals))
	for _, meal := range plan.Meals {
		titles = appendUnique(titles, meal.Title)
	}
	return provider.PlanFacts{
		MealsPlanned:      plan.Summary.MealsPlanned,
		Days:              daysCovered(plan),
		EstimatedCostLow:  plan.Summary.EstimatedCost.Low,
		EstimatedCostHigh: plan.Summary.EstimatedCost.High,
		CostConfidence:    plan.Summary.EstimatedCost.Confidence,
		Budget:            plan.Summary.Budget,
		Headroom:          plan.Summary.Headroom,
		PantryItemsUsed:   len(plan.Summary.PantryItemsUsed),
		MealTitles:        titles,
	}
}

func daysCovered(plan meals.Plan) int {
	highest := 0
	for _, meal := range plan.Meals {
		if meal.Slot.Day > highest {
			highest = meal.Slot.Day
		}
	}
	return highest
}

// DeterministicMessage is the message the server writes itself. Every number in
// it is copied from the computed plan, which is the same rule the AI path is
// held to — the difference is that here it is guaranteed by construction.
func DeterministicMessage(plan meals.Plan) string {
	summary := plan.Summary
	var parts []string

	if summary.MealsPlanned == 0 {
		return "We could not fill this plan from the recipes that match your requirements. " +
			"Try widening a preference and generating again."
	}

	parts = append(parts, fmt.Sprintf("Here are %s for the week.", pluralMeals(summary.MealsPlanned)))
	parts = append(parts, fmt.Sprintf("Groceries are estimated at $%.2f to $%.2f.",
		summary.EstimatedCost.Low, summary.EstimatedCost.High))

	if summary.Budget != nil && summary.Headroom != nil {
		if *summary.Headroom >= 0 {
			parts = append(parts, fmt.Sprintf("That leaves about $%.2f of your $%.2f budget.",
				*summary.Headroom, *summary.Budget))
		} else {
			parts = append(parts, fmt.Sprintf("That is about $%.2f above your $%.2f budget, so you may want to swap a meal.",
				-*summary.Headroom, *summary.Budget))
		}
	}

	if count := len(summary.PantryItemsUsed); count > 0 {
		parts = append(parts, fmt.Sprintf("%s you already have %s used.",
			pluralItems(count), wasWere(count)))
	}

	return strings.Join(parts, " ")
}

func pluralMeals(count int) string {
	if count == 1 {
		return "1 meal"
	}
	return fmt.Sprintf("%d meals", count)
}

func pluralItems(count int) string {
	if count == 1 {
		return "1 ingredient"
	}
	return fmt.Sprintf("%d ingredients", count)
}

func wasWere(count int) string {
	if count == 1 {
		return "was"
	}
	return "were"
}
