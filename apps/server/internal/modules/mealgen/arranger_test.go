package mealgen

import (
	"context"
	"errors"
	"testing"

	"github.com/helpthehive/server/internal/domain/meals"
	"github.com/helpthehive/server/internal/modules/mealgen/provider"
	fx "github.com/helpthehive/server/internal/testsupport/mealfixtures"
)

// The AI arrangement step, and the guarantee that matters about it: a model can
// reorder what the filters already allowed, and can do nothing else.

type scriptedProvider struct {
	reply string
	err   error
	// What the provider was actually sent, so the tests can assert on what
	// leaves the server as well as on what comes back.
	sawSystem string
	sawUser   string
}

func (p *scriptedProvider) Name() string { return "scripted" }

func (p *scriptedProvider) Complete(_ context.Context, request provider.Request) (provider.Response, error) {
	p.sawSystem = request.System
	p.sawUser = request.User
	if p.err != nil {
		return provider.Response{}, p.err
	}
	return provider.Response{Text: p.reply, Provider: "scripted"}, nil
}

func arrangeFixtures() (request meals.PlanRequest, pool []meals.Recipe, slots []meals.Slot, catalog *meals.Catalog) {
	catalog = fx.Catalog()
	request = fx.BaseRequest()
	pool = []meals.Recipe{
		fx.Recipe("rice-beans", 4, []string{"dinner"}, fx.Line(1, "rice", 1), fx.Line(2, "beans", 1)),
		fx.Recipe("chicken-rice", 4, []string{"dinner"}, fx.Line(1, "chicken", 1), fx.Line(2, "rice", 1)),
	}
	slots = []meals.Slot{
		{Day: 1, MealType: "dinner"},
		{Day: 2, MealType: "dinner"},
	}
	return request, pool, slots, catalog
}

func TestArrangeAcceptsAValidAssignment(t *testing.T) {
	request, pool, slots, catalog := arrangeFixtures()
	p := &scriptedProvider{reply: `{"assignments":[
		{"day":1,"mealType":"dinner","recipeId":"chicken-rice"},
		{"day":2,"mealType":"dinner","recipeId":"rice-beans"}]}`}

	got := NewArranger(p, nil).Arrange(context.Background(), request, pool, slots, nil, catalog)

	if len(got) != 2 {
		t.Fatalf("arrangement = %v, want both slots filled", got)
	}
	if got[meals.Slot{Day: 1, MealType: "dinner"}] != "chicken-rice" {
		t.Fatalf("day 1 = %q, want chicken-rice", got[meals.Slot{Day: 1, MealType: "dinner"}])
	}
}

// The central safety property. A model that names a recipe outside the pool —
// invented, misremembered, or from another user's week — must be ignored.
func TestArrangeDiscardsRecipesOutsideTheEligiblePool(t *testing.T) {
	request, pool, slots, catalog := arrangeFixtures()
	p := &scriptedProvider{reply: `{"assignments":[
		{"day":1,"mealType":"dinner","recipeId":"peanut-stew"},
		{"day":2,"mealType":"dinner","recipeId":"rice-beans"}]}`}

	got := NewArranger(p, nil).Arrange(context.Background(), request, pool, slots, nil, catalog)

	if _, filled := got[meals.Slot{Day: 1, MealType: "dinner"}]; filled {
		t.Fatal("a recipe that is not in the eligible pool must never be accepted")
	}
	if got[meals.Slot{Day: 2, MealType: "dinner"}] != "rice-beans" {
		t.Fatal("the valid half of the reply should still be used")
	}
}

func TestArrangeDiscardsSlotsThatWereNotAskedFor(t *testing.T) {
	request, pool, slots, catalog := arrangeFixtures()
	p := &scriptedProvider{reply: `{"assignments":[
		{"day":6,"mealType":"dinner","recipeId":"rice-beans"},
		{"day":1,"mealType":"breakfast","recipeId":"rice-beans"}]}`}

	got := NewArranger(p, nil).Arrange(context.Background(), request, pool, slots, nil, catalog)

	if got != nil {
		t.Fatalf("arrangement = %v, want nothing: neither slot was requested", got)
	}
}

func TestArrangeDiscardsARecipeWrongForTheSlotsMealType(t *testing.T) {
	request, pool, slots, catalog := arrangeFixtures()
	breakfastOnly := fx.Recipe("oats", 4, []string{"breakfast"}, fx.Line(1, "rice", 1))
	pool = append(pool, breakfastOnly)
	p := &scriptedProvider{reply: `{"assignments":[{"day":1,"mealType":"dinner","recipeId":"oats"}]}`}

	got := NewArranger(p, nil).Arrange(context.Background(), request, pool, slots, nil, catalog)

	if len(got) != 0 {
		t.Fatalf("arrangement = %v; a breakfast recipe must not be accepted for a dinner slot", got)
	}
}

func TestArrangeFallsBackWhenTheProviderFailsOrIsAbsent(t *testing.T) {
	request, pool, slots, catalog := arrangeFixtures()

	for name, p := range map[string]provider.Provider{
		"no provider":    provider.Disabled{},
		"provider error": &scriptedProvider{err: errors.New("upstream down")},
		"unparseable":    &scriptedProvider{reply: "I have arranged your week!"},
		"empty":          &scriptedProvider{reply: `{"assignments":[]}`},
	} {
		t.Run(name, func(t *testing.T) {
			if got := NewArranger(p, nil).Arrange(context.Background(), request, pool, slots, nil, catalog); got != nil {
				t.Fatalf("arrangement = %v, want nil so the deterministic planner is used", got)
			}
		})
	}
}

// The fact sheet is aggregate and anonymous by construction. Nothing the user
// typed, and nothing about their health, may reach a provider.
func TestArrangeSendsNoUserIdentityOrHealthInformation(t *testing.T) {
	request, pool, slots, catalog := arrangeFixtures()
	freeText := "no shellfish, my daughter is allergic"
	request.Allergies = []meals.AllergyRequirement{{Allergen: "shellfish", Strength: meals.StrengthRequired}}
	request.DietaryRequirements = []meals.DietRequirement{{Diet: "vegan", Strength: meals.StrengthRequired}}
	request.Dislikes.FreeText = &freeText
	request.Household = meals.Household{Size: 4, SizeIsPlus: false}

	p := &scriptedProvider{reply: `{"assignments":[{"day":1,"mealType":"dinner","recipeId":"rice-beans"}]}`}
	NewArranger(p, nil).Arrange(context.Background(), request, pool, slots, nil, catalog)

	for _, forbidden := range []string{"shellfish", "vegan", "allergic", "daughter", "household"} {
		if containsFold(p.sawUser, forbidden) {
			t.Fatalf("the fact sheet contained %q; it must carry no allergy, diet, health or free-text information", forbidden)
		}
	}
}

func TestPlannerIsUnchangedByAnEmptyArrangement(t *testing.T) {
	request, pool, _, catalog := arrangeFixtures()
	request.Meals = meals.MealCounts{Dinner: 2}
	request.Days = 2

	withNil := NewPlanner(catalog).BuildWith(request, pool, "plan-1", nil)
	withEmpty := NewPlanner(catalog).BuildWith(request, pool, "plan-1", map[meals.Slot]string{})

	if len(withNil.Meals) != len(withEmpty.Meals) {
		t.Fatalf("meal counts differ: %d vs %d", len(withNil.Meals), len(withEmpty.Meals))
	}
	for i := range withNil.Meals {
		if withNil.Meals[i].RecipeID != withEmpty.Meals[i].RecipeID {
			t.Fatal("an empty arrangement must produce exactly the deterministic week")
		}
	}
}

// "No leftovers" is a property of the whole week, which a model cannot be
// trusted to have tracked, so the planner re-checks it as it builds.
func TestArrangementCannotRepeatARecipeWhenLeftoversAreRefused(t *testing.T) {
	request, pool, _, catalog := arrangeFixtures()
	request.Meals = meals.MealCounts{Dinner: 2}
	request.Days = 2
	request.Leftovers = "no"

	arrangement := map[meals.Slot]string{
		{Day: 1, MealType: "dinner"}: "rice-beans",
		{Day: 2, MealType: "dinner"}: "rice-beans",
	}
	plan := NewPlanner(catalog).BuildWith(request, pool, "plan-1", arrangement)

	if len(plan.Meals) != 2 {
		t.Fatalf("meals = %d, want 2", len(plan.Meals))
	}
	if plan.Meals[0].RecipeID == plan.Meals[1].RecipeID {
		t.Fatal("a repeated recipe must be refused when the user said no leftovers")
	}
}

func containsFold(haystack string, needle string) bool {
	return len(needle) > 0 && len(haystack) >= len(needle) &&
		indexFold(haystack, needle) >= 0
}

func indexFold(haystack string, needle string) int {
	lower := func(r byte) byte {
		if r >= 'A' && r <= 'Z' {
			return r + 32
		}
		return r
	}
	for i := 0; i+len(needle) <= len(haystack); i++ {
		match := true
		for j := 0; j < len(needle); j++ {
			if lower(haystack[i+j]) != lower(needle[j]) {
				match = false
				break
			}
		}
		if match {
			return i
		}
	}
	return -1
}
