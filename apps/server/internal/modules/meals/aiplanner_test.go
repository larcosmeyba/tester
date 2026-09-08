package meals

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"strings"
	"testing"

	"github.com/helpthehive/server/internal/db"
	"github.com/helpthehive/server/internal/modules/meals/generator"
)

// fakeProvider stands in for an AI provider and records what it was asked, so a
// test can assert on the prompt as well as on the plan.
type fakeProvider struct {
	reply string
	err   error
	asked generator.Request
	calls int
}

func (f *fakeProvider) Name() string { return "fake" }

func (f *fakeProvider) Complete(_ context.Context, request generator.Request) (generator.Response, error) {
	f.asked = request
	f.calls++
	if f.err != nil {
		return generator.Response{}, f.err
	}
	return generator.Response{Text: f.reply, Provider: "fake", Model: "fake"}, nil
}

func quietLogger() *slog.Logger {
	return slog.New(slog.NewTextHandler(io.Discard, nil))
}

func dinnerPool() []db.Recipe {
	return []db.Recipe{
		recipe("chicken_rice", 4, []string{"dinner"}, line(1, "chicken", 1), line(2, "rice", 1)),
		recipe("rice_beans", 4, []string{"dinner"}, line(1, "rice", 1), line(2, "beans", 1)),
	}
}

func planRecipeIDs(plan Plan) []string {
	ids := make([]string, 0, len(plan.Meals))
	for _, meal := range plan.Meals {
		ids = append(ids, meal.RecipeID)
	}
	return ids
}

// With no provider configured the meal system still works. This is the default
// in every environment that has not deliberately turned one on.
func TestNoProviderPlansDeterministically(t *testing.T) {
	planner := NewAIPlanner(generator.Disabled{}, testCatalog(), quietLogger())

	plan, source := planner.Build(context.Background(), baseRequest(), dinnerPool(), "plan-1")

	if source != GenerationSourceDeterministic {
		t.Fatalf("source = %q, want %q", source, GenerationSourceDeterministic)
	}
	if len(plan.Meals) != 2 {
		t.Fatalf("meals = %d, want a full week without a provider", len(plan.Meals))
	}
}

func TestProviderSelectionIsHonoured(t *testing.T) {
	provider := &fakeProvider{reply: `{"selections":[
		{"day":1,"meal_type":"dinner","recipe_id":"rice_beans"},
		{"day":2,"meal_type":"dinner","recipe_id":"chicken_rice"}
	]}`}
	planner := NewAIPlanner(provider, testCatalog(), quietLogger())

	plan, source := planner.Build(context.Background(), baseRequest(), dinnerPool(), "plan-1")

	if source != GenerationSourceAI {
		t.Fatalf("source = %q, want %q", source, GenerationSourceAI)
	}
	got := strings.Join(planRecipeIDs(plan), ",")
	if got != "rice_beans,chicken_rice" {
		t.Fatalf("meals = %s, want the provider's own selection", got)
	}
	// The plan is still priced and consolidated by the server.
	if plan.Summary.EstimatedCost.High <= 0 || len(plan.GroceryList) == 0 {
		t.Fatal("an AI-selected plan must still be priced and consolidated server-side")
	}
}

// The provider is asked for structured output, and told the schema.
func TestProviderIsAskedForStructuredOutput(t *testing.T) {
	provider := &fakeProvider{reply: `{"selections":[{"day":1,"meal_type":"dinner","recipe_id":"rice_beans"}]}`}
	planner := NewAIPlanner(provider, testCatalog(), quietLogger())

	planner.Build(context.Background(), baseRequest(), dinnerPool(), "plan-1")

	if provider.asked.Schema == nil {
		t.Fatal("the provider was not given a response schema")
	}
	if provider.asked.Schema.Name != generator.PlanSchemaName {
		t.Fatalf("schema name = %q, want %q", provider.asked.Schema.Name, generator.PlanSchemaName)
	}
	if provider.asked.MaxTokens <= 0 {
		t.Fatal("the reply must be capped")
	}
}

// A model that names something it was not offered costs the user nothing: the
// deterministic planner produces the week instead.
func TestReplyNamingAnUnofferedRecipeFallsBack(t *testing.T) {
	provider := &fakeProvider{reply: `{"selections":[
		{"day":1,"meal_type":"dinner","recipe_id":"peanut_surprise"}
	]}`}
	planner := NewAIPlanner(provider, testCatalog(), quietLogger())

	plan, source := planner.Build(context.Background(), baseRequest(), dinnerPool(), "plan-1")

	if source != GenerationSourceDeterministic {
		t.Fatalf("source = %q, want the fallback", source)
	}
	if len(plan.Meals) != 2 {
		t.Fatalf("meals = %d, want a complete week despite the rejected reply", len(plan.Meals))
	}
}

func TestProviderFailureFallsBack(t *testing.T) {
	provider := &fakeProvider{err: errors.New("provider is down")}
	planner := NewAIPlanner(provider, testCatalog(), quietLogger())

	plan, source := planner.Build(context.Background(), baseRequest(), dinnerPool(), "plan-1")

	if source != GenerationSourceDeterministic {
		t.Fatalf("source = %q, want the fallback", source)
	}
	if len(plan.Meals) != 2 {
		t.Fatal("an AI outage must never cost someone their meal plan")
	}
}

// The second safety check. The pool is already filtered, so this should never
// fire in production — which is exactly why it is worth a test: it is what
// stands between a pool-construction bug and an allergen on someone's plate.
func TestUnsafeRecipeSurvivingIntoThePoolIsRejected(t *testing.T) {
	request := baseRequest()
	request.Allergies = []AllergyRequirement{{Allergen: "milk", Strength: StrengthRequired}}

	// A pool built wrongly: the milk recipe should never have reached it.
	unsafe := recipe("creamy", 4, []string{"dinner"}, line(1, "milk", 1), line(2, "rice", 1))
	pool := append(dinnerPool(), unsafe)

	provider := &fakeProvider{reply: `{"selections":[
		{"day":1,"meal_type":"dinner","recipe_id":"creamy"},
		{"day":2,"meal_type":"dinner","recipe_id":"rice_beans"}
	]}`}
	planner := NewAIPlanner(provider, testCatalog(), quietLogger())

	_, source := planner.Build(context.Background(), request, pool, "plan-1")

	if source != GenerationSourceDeterministic {
		t.Fatalf("source = %q: a recipe carrying a declared allergen must not be accepted from a provider, even when it was in the pool", source)
	}
}

// A provider that fills four slots of five does not get to shorten the user's
// week: the rest are filled deterministically.
func TestSlotsLeftEmptyByTheProviderAreFilled(t *testing.T) {
	provider := &fakeProvider{reply: `{"selections":[
		{"day":1,"meal_type":"dinner","recipe_id":"rice_beans"}
	]}`}
	planner := NewAIPlanner(provider, testCatalog(), quietLogger())

	plan, source := planner.Build(context.Background(), baseRequest(), dinnerPool(), "plan-1")

	if source != GenerationSourceAI {
		t.Fatalf("source = %q, want %q", source, GenerationSourceAI)
	}
	if len(plan.Meals) != 2 {
		t.Fatalf("meals = %d, want both requested slots filled", len(plan.Meals))
	}
	if plan.Meals[0].RecipeID != "rice_beans" {
		t.Fatalf("meal 1 = %q, want the provider's choice kept", plan.Meals[0].RecipeID)
	}
	if plan.Status != "ok" {
		t.Fatalf("status = %q, want a completed plan", plan.Status)
	}
}

// The brief a provider sees contains only recipes that already passed every
// hard filter, so an unsafe recipe is not merely rejected on the way back — it
// is never offered on the way out.
func TestBriefOffersOnlyRecipesThatPassedTheHardFilters(t *testing.T) {
	catalog := testCatalog()
	request := baseRequest()
	request.Allergies = []AllergyRequirement{{Allergen: "milk", Strength: StrengthRequired}}

	library := []db.Recipe{
		recipe("creamy", 4, []string{"dinner"}, line(1, "milk", 1), line(2, "rice", 1)),
		recipe("rice_beans", 4, []string{"dinner"}, line(1, "rice", 1), line(2, "beans", 1)),
	}
	pool := EligibleRecipes(library, request, catalog)

	provider := &fakeProvider{reply: `{"selections":[{"day":1,"meal_type":"dinner","recipe_id":"rice_beans"}]}`}
	NewAIPlanner(provider, catalog, quietLogger()).Build(context.Background(), request, pool, "plan-1")

	if strings.Contains(provider.asked.User, "creamy") {
		t.Fatal("a recipe excluded by an allergy was offered to the provider")
	}
	if !strings.Contains(provider.asked.User, "rice_beans") {
		t.Fatal("the safe recipe was not offered to the provider")
	}
	if strings.Contains(strings.ToLower(provider.asked.User), "milk") {
		t.Fatal("the prompt named the user's allergen; a provider is never told why a recipe is safe")
	}
}

// The pantry is a signal the provider is given, without being told whose it is.
func TestBriefReportsPantryOverlapWithoutNamingThePantry(t *testing.T) {
	request := baseRequest()
	request.PantryItems = []string{"rice"}

	provider := &fakeProvider{reply: `{"selections":[{"day":1,"meal_type":"dinner","recipe_id":"rice_beans"}]}`}
	NewAIPlanner(provider, testCatalog(), quietLogger()).Build(context.Background(), request, dinnerPool(), "plan-1")

	if !strings.Contains(provider.asked.User, `"pantry_overlap":1`) {
		t.Fatalf("the brief did not report pantry overlap: %s", provider.asked.User)
	}
}
