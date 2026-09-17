// Package mealgen generates meal plans. When the user's recipe library cannot
// fill the requested slots, the Generator asks the AI provider to invent
// recipes from the questionnaire answers — this is how a new user with no
// saved recipes still gets a full week of meals.
package mealgen

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"strings"

	"github.com/helpthehive/server/internal/domain/meals"
	"github.com/helpthehive/server/internal/modules/mealgen/provider"
)

// GenerateSystemPrompt tells the model exactly what to produce: real recipes
// as JSON, shaped for the Help The Hive recipe format. It is deliberately
// strict — the output is parsed, not read by a human.
const GenerateSystemPrompt = `You create recipes for the Help The Hive meal-planning app.

Reply with JSON only — no markdown fences, no commentary. The shape is:
{"recipes": [{"title": string, "meal_types": ["breakfast"|"lunch"|"dinner"],
"servings": number, "prep_minutes": number, "cook_minutes": number,
"ingredients": [{"name": string, "quantity": number, "unit": string, "preparation": string}],
"instructions": [string]}]}

Rules:
- Every recipe must be cookable by a home cook with ordinary equipment.
- Respect every dietary requirement and allergy in the request absolutely — a
  recipe that violates one is a failure.
- Prefer inexpensive, widely available ingredients. Stay inside the budget.
- Vary cuisines and proteins across the week; do not repeat a main dish.
- Quantities are for the household size given. Units are ordinary US cooking
- units (cup, tbsp, tsp, oz, lb, count).
- Keep instructions to 8 steps or fewer, each one concrete action.`

// aiRecipe is the JSON shape the model returns for one recipe.
type aiRecipe struct {
	Title        string `json:"title"`
	MealTypes    []string `json:"meal_types"`
	Servings     float64 `json:"servings"`
	PrepMinutes  int     `json:"prep_minutes"`
	CookMinutes  int     `json:"cook_minutes"`
	Ingredients  []aiIngredient `json:"ingredients"`
	Instructions []string `json:"instructions"`
}

type aiIngredient struct {
	Name        string  `json:"name"`
	Quantity    float64 `json:"quantity"`
	Unit        string  `json:"unit"`
	Preparation string  `json:"preparation"`
}

// IngredientResolver maps a free-text ingredient name to a catalog ID.
// It returns "" when the name does not resolve.
type IngredientResolver interface {
	ResolveIngredient(name string) string
}

// Generator invents recipes with the AI provider when the user's library is
// too small to fill the plan. Generated recipes are transient: they are
// built for this plan, not saved to the library.
type Generator struct {
	Provider provider.Provider
	Resolve  IngredientResolver
	Logger   *slog.Logger
}

func NewGenerator(p provider.Provider, resolve IngredientResolver, logger *slog.Logger) *Generator {
	if logger == nil {
		logger = slog.Default()
	}
	return &Generator{Provider: p, Resolve: resolve, Logger: logger}
}

// recipesPerBatch caps how many recipes one model call invents. A single
// recipe with ingredients and instructions runs ~300-500 tokens, so a full
// 21-slot week never fits in one response — without batching the JSON
// truncates, parsing fails, and the new user gets an empty plan.
const recipesPerBatch = 5

// Generate invents count recipes for the request, in batches of
// recipesPerBatch. It returns nil when there is no provider configured — the
// caller falls back to whatever the library holds. An AI failure is also
// nil, never an error: a partial week from the library beats no week at
// all. Recipes already generated are named in later prompts so the model
// does not repeat dishes across batches.
func (g *Generator) Generate(ctx context.Context, request meals.PlanRequest, count int) []meals.Recipe {
	if g == nil || g.Provider == nil || count <= 0 {
		return nil
	}
	if _, ok := g.Provider.(provider.Disabled); ok {
		return nil
	}

	var out []meals.Recipe
	for len(out) < count {
		need := count - len(out)
		if need > recipesPerBatch {
			need = recipesPerBatch
		}
		userPrompt := g.userPrompt(request, need, titles(out))
		response, err := g.Provider.Complete(ctx, provider.Request{
			System:    GenerateSystemPrompt,
			User:      userPrompt,
			MaxTokens: 4000,
		})
		if err != nil {
			g.Logger.Warn("ai recipe generation failed, falling back to library",
				"error", err, "provider", g.Provider.Name(),
				"generated", len(out), "wanted", count)
			break
		}

		recipes := g.parse(response.Text, request)
		if len(recipes) == 0 {
			g.Logger.Warn("ai recipe generation returned nothing usable",
				"provider", g.Provider.Name(), "model", response.Model,
				"generated", len(out), "wanted", count)
			break
		}
		out = append(out, recipes...)
	}
	return out
}

// titles returns the titles already generated, so follow-up batches can be
// told not to repeat them.
func titles(recipes []meals.Recipe) []string {
	out := make([]string, 0, len(recipes))
	for _, r := range recipes {
		out = append(out, r.Title)
	}
	return out
}

// userPrompt turns the questionnaire into the facts the model needs. already
// names dishes invented in earlier batches so the model varies the week.
func (g *Generator) userPrompt(request meals.PlanRequest, count int, already []string) string {
	var b strings.Builder
	fmt.Fprintf(&b, "Create %d recipes for a %d-day meal plan.\n", count, request.Days)
	fmt.Fprintf(&b, "Household: %d people.\n", request.Household.Size)
	if request.Budget.Amount > 0 {
		fmt.Fprintf(&b, "Weekly grocery budget: $%.2f. The week's ingredients must fit inside it.\n",
			request.Budget.Amount)
	}
	if len(request.DietaryRequirements) > 0 {
		diets := make([]string, 0, len(request.DietaryRequirements))
		for _, d := range request.DietaryRequirements {
			diets = append(diets, d.Diet)
		}
		fmt.Fprintf(&b, "Dietary requirements (absolute): %s.\n", strings.Join(diets, ", "))
	}
	if len(request.Allergies) > 0 {
		allergens := make([]string, 0, len(request.Allergies))
		for _, a := range request.Allergies {
			allergens = append(allergens, a.Allergen)
		}
		fmt.Fprintf(&b, "Allergies (absolute — never include): %s.\n", strings.Join(allergens, ", "))
	}
	if len(request.Likes.Cuisines) > 0 || len(request.Likes.Ingredients) > 0 {
		fmt.Fprintf(&b, "They like: %s.\n", joinFoodPrefs(request.Likes))
	}
	if len(request.Dislikes.Cuisines) > 0 || len(request.Dislikes.Ingredients) > 0 {
		fmt.Fprintf(&b, "They dislike (avoid): %s.\n", joinFoodPrefs(request.Dislikes))
	}
	if request.CookingTime.MaxMinutes != nil && *request.CookingTime.MaxMinutes > 0 {
		fmt.Fprintf(&b, "Each meal must take %d minutes or less, start to finish.\n",
			*request.CookingTime.MaxMinutes)
	}
	fmt.Fprintf(&b, "Meals per day: breakfast %d, lunch %d, dinner %d.\n",
		request.Meals.Breakfast, request.Meals.Lunch, request.Meals.Dinner)
	if len(already) > 0 {
		fmt.Fprintf(&b, "Do not repeat these dishes already planned this week: %s.\n",
			strings.Join(already, "; "))
	}
	return b.String()
}

// parse turns the model's JSON into recipes, dropping anything malformed or
// unsafe. A recipe with no title, no ingredients, or no instructions is not
// a recipe.
func (g *Generator) parse(raw string, request meals.PlanRequest) []meals.Recipe {
	cleaned := strings.TrimSpace(raw)
	cleaned = strings.TrimPrefix(cleaned, "```json")
	cleaned = strings.TrimPrefix(cleaned, "```")
	cleaned = strings.TrimSuffix(cleaned, "```")
	cleaned = strings.TrimSpace(cleaned)

	var decoded struct {
		Recipes []aiRecipe `json:"recipes"`
	}
	if err := json.Unmarshal([]byte(cleaned), &decoded); err != nil {
		g.Logger.Warn("ai recipe JSON did not parse", "error", err)
		return nil
	}

	var out []meals.Recipe
	for i, ar := range decoded.Recipes {
		if hit := allergenHit(ar.Ingredients, request.Allergies); hit != "" {
			g.Logger.Warn("ai recipe dropped: ingredient matches an allergy",
				"recipe", ar.Title, "allergen", hit)
			continue
		}
		recipe := g.toRecipe(ar, i)
		if recipe == nil {
			continue
		}
		out = append(out, *recipe)
	}
	return out
}

// allergenHit returns the first allergy whose name appears inside an
// ingredient name, or "". The prompt already forbids allergens absolutely;
// this is the backstop — a conservative substring match, because a false
// positive only drops a recipe while a false negative could harm someone.
func allergenHit(ingredients []aiIngredient, allergies []meals.AllergyRequirement) string {
	for _, a := range allergies {
		needle := strings.ToLower(strings.TrimSpace(a.Allergen))
		if needle == "" {
			continue
		}
		for _, ing := range ingredients {
			if strings.Contains(strings.ToLower(ing.Name), needle) {
				return a.Allergen
			}
		}
	}
	return ""
}

// toRecipe converts one AI recipe to the domain shape. Ingredients are
// resolved against the catalog so pricing works; unresolved names stay as
// free text rather than dropping the ingredient.
func (g *Generator) toRecipe(ar aiRecipe, index int) *meals.Recipe {
	title := strings.TrimSpace(ar.Title)
	if title == "" || len(ar.Ingredients) == 0 || len(ar.Instructions) == 0 {
		return nil
	}

	mealTypes := make([]string, 0, len(ar.MealTypes))
	for _, mt := range ar.MealTypes {
		mt = strings.ToLower(strings.TrimSpace(mt))
		if mt == "breakfast" || mt == "lunch" || mt == "dinner" {
			mealTypes = append(mealTypes, mt)
		}
	}
	if len(mealTypes) == 0 {
		mealTypes = []string{"dinner"}
	}

	servings := ar.Servings
	if servings <= 0 {
		servings = 4
	}
	prep := ar.PrepMinutes
	cook := ar.CookMinutes
	total := prep + cook

	ingredients := make([]meals.RecipeIngredient, 0, len(ar.Ingredients))
	for pos, ai := range ar.Ingredients {
		name := strings.TrimSpace(ai.Name)
		if name == "" {
			continue
		}
		ri := meals.RecipeIngredient{
			ID:       fmt.Sprintf("ai-%d-%d", index, pos),
			Position: pos,
			RawText:  name,
		}
		if ai.Quantity > 0 {
			q := ai.Quantity
			ri.Quantity = &q
		}
		if ai.Unit != "" {
			u := ai.Unit
			ri.Unit = &u
		}
		if ai.Preparation != "" {
			p := ai.Preparation
			ri.Preparation = &p
		}
		display := name
		ri.DisplayName = &display
		// Resolve against the catalog for pricing; free text stays usable.
		if g.Resolve != nil {
			if id := g.Resolve.ResolveIngredient(name); id != "" {
				resolved := id
				ri.IngredientID = &resolved
			}
		}
		ingredients = append(ingredients, ri)
	}
	if len(ingredients) == 0 {
		return nil
	}

	instructions := make([]meals.RecipeInstruction, 0, len(ar.Instructions))
	for step, text := range ar.Instructions {
		text = strings.TrimSpace(text)
		if text == "" {
			continue
		}
		instructions = append(instructions, meals.RecipeInstruction{
			ID:   fmt.Sprintf("ai-%d-s%d", index, step),
			Step: step,
			Text: text,
		})
	}
	if len(instructions) == 0 {
		return nil
	}

	return &meals.Recipe{
		ID:                 fmt.Sprintf("ai-generated-%d", index),
		Title:              title,
		SourceType:         "ai_generated",
		SourceName:         stringPtr("Penny"),
		Visibility:         "private",
		Servings:           &servings,
		ServingsConfidence: "ai_estimate",
		PrepTimeMinutes:    &prep,
		CookTimeMinutes:    &cook,
		TotalTimeMinutes:    &total,
		TimeConfidence:      "ai_estimate",
		MealTypes:          mealTypes,
		BaseMealPlanEligible: true,
		Ingredients:        ingredients,
		Instructions:       instructions,
	}
}

func stringPtr(s string) *string { return &s }

func joinFoodPrefs(pref meals.FoodPreferences) string {
	var parts []string
	parts = append(parts, pref.Cuisines...)
	parts = append(parts, pref.Ingredients...)
	return strings.Join(parts, ", ")
}
