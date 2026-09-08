package mealprep

import (
	"testing"

	"github.com/helpthehive/server/internal/domain/meals"
	fx "github.com/helpthehive/server/internal/testsupport/mealfixtures"
)

// Deriving prep work from a week.
//
// The rules under test: prep is only proposed where the plan already implies
// it, a quantity the recipes never stated is never invented, and the same plan
// always derives the same list.

func plannedMeal(day int, mealType string, recipeID string, scale float64, servings float64) meals.PlannedMeal {
	return meals.PlannedMeal{
		Slot:            meals.Slot{Day: day, MealType: mealType},
		RecipeID:        recipeID,
		ScaleFactor:     scale,
		ServingsPlanned: servings,
	}
}

func prepInput(planned []meals.PlannedMeal, recipes ...meals.Recipe) Input {
	byID := make(map[string]meals.Recipe, len(recipes))
	for _, recipe := range recipes {
		byID[recipe.ID] = recipe
	}
	return Input{
		MealPlanID: "plan-1",
		UserID:     "user-1",
		Meals:      planned,
		Recipes:    byID,
		Catalog:    fx.Catalog(),
	}
}

func TestSharedIngredientBecomesOnePrepTask(t *testing.T) {
	riceBeans := fx.Recipe("rice-beans", 4, []string{"dinner"}, fx.Line(1, "rice", 1), fx.Line(2, "beans", 1))
	chickenRice := fx.Recipe("chicken-rice", 4, []string{"dinner"}, fx.Line(1, "rice", 2), fx.Line(2, "chicken", 1))

	plan := Derive(prepInput([]meals.PlannedMeal{
		plannedMeal(1, "dinner", "rice-beans", 1, 4),
		plannedMeal(2, "dinner", "chicken-rice", 1, 4),
	}, riceBeans, chickenRice))

	rice := findTask(plan, "Prep White Rice")
	if rice == nil {
		rice = findTaskContaining(plan, "rice")
	}
	if rice == nil {
		t.Fatalf("no prep task for rice; tasks = %v", taskTitles(plan))
	}
	if len(rice.ServesSlots) != 2 {
		t.Fatalf("serves %d slots, want 2 — rice is used by both dinners", len(rice.ServesSlots))
	}
	// 1 + 2, both at scale 1.
	if rice.PortionAmount == nil || *rice.PortionAmount != 3 {
		t.Fatalf("portion = %v, want the two recipes' quantities totalled", rice.PortionAmount)
	}

	// Beans appear in one meal only, so there is nothing to save by batching.
	if findTaskContaining(plan, "beans") != nil {
		t.Fatal("an ingredient used by a single meal is not worth a prep task")
	}
}

func TestPrepNeverInventsAQuantityTheRecipesDidNotState(t *testing.T) {
	unquantified := fx.Recipe("stew", 4, []string{"dinner"}, fx.Line(1, "rice", 1))
	unquantified.Ingredients[0].Quantity = nil
	other := fx.Recipe("bowl", 4, []string{"dinner"}, fx.Line(1, "rice", 2))

	plan := Derive(prepInput([]meals.PlannedMeal{
		plannedMeal(1, "dinner", "stew", 1, 4),
		plannedMeal(2, "dinner", "bowl", 1, 4),
	}, unquantified, other))

	rice := findTaskContaining(plan, "rice")
	if rice == nil {
		t.Fatalf("no prep task for rice; tasks = %v", taskTitles(plan))
	}
	if rice.PortionAmount != nil {
		t.Fatalf("portion = %v; one unstated quantity makes the total unknown, and it must not be guessed",
			*rice.PortionAmount)
	}
	if !contains(rice.Instruction, "did not") {
		t.Fatalf("instruction = %q, want it to say the amount is unknown", rice.Instruction)
	}
}

func TestPrepScalesQuantitiesToTheHousehold(t *testing.T) {
	recipe := fx.Recipe("bowl", 4, []string{"dinner"}, fx.Line(1, "rice", 1))

	plan := Derive(prepInput([]meals.PlannedMeal{
		plannedMeal(1, "dinner", "bowl", 2, 8),
		plannedMeal(2, "dinner", "bowl", 2, 8),
	}, recipe))

	rice := findTaskContaining(plan, "rice")
	if rice == nil {
		t.Fatalf("no prep task for rice; tasks = %v", taskTitles(plan))
	}
	// 1 unit × scale 2, twice.
	if rice.PortionAmount == nil || *rice.PortionAmount != 4 {
		t.Fatalf("portion = %v, want 4 — the scale factor must be applied", rice.PortionAmount)
	}
}

func TestAlwaysOnHandIngredientsAreNeverPrepped(t *testing.T) {
	a := fx.Recipe("a", 4, []string{"dinner"}, fx.Line(1, "salt", 1), fx.Line(2, "rice", 1))
	b := fx.Recipe("b", 4, []string{"dinner"}, fx.Line(1, "salt", 1), fx.Line(2, "rice", 1))

	plan := Derive(prepInput([]meals.PlannedMeal{
		plannedMeal(1, "dinner", "a", 1, 4),
		plannedMeal(2, "dinner", "b", 1, 4),
	}, a, b))

	if findTaskContaining(plan, "salt") != nil {
		t.Fatal("salt is always on hand and is added, not prepped")
	}
}

func TestBatchCookIsProposedForARepeatedRecipe(t *testing.T) {
	recipe := fx.Recipe("chili", 4, []string{"dinner"}, fx.Line(1, "beans", 2))
	recipe.Tags = []string{"method.freezer_friendly"}
	minutes := 45
	recipe.TotalTimeMinutes = &minutes

	plan := Derive(prepInput([]meals.PlannedMeal{
		plannedMeal(1, "dinner", "chili", 1, 4),
		plannedMeal(3, "dinner", "chili", 1, 4),
	}, recipe))

	var batch *meals.PrepTask
	for i := range plan.Tasks {
		if plan.Tasks[i].Kind == meals.PrepBatchCook {
			batch = &plan.Tasks[i]
		}
	}
	if batch == nil {
		t.Fatalf("no batch cook task; tasks = %v", taskTitles(plan))
	}
	if batch.Storage != meals.StorageFreeze {
		t.Fatalf("storage = %q, want freeze for a freezer-friendly recipe", batch.Storage)
	}
	if batch.ActiveMinutes != 45 {
		t.Fatalf("active minutes = %d, want the recipe's own 45", batch.ActiveMinutes)
	}
	if len(batch.ServesSlots) != 2 {
		t.Fatalf("serves %d slots, want 2", len(batch.ServesSlots))
	}
}

func TestPrepIsDeterministic(t *testing.T) {
	riceBeans := fx.Recipe("rice-beans", 4, []string{"dinner"}, fx.Line(1, "rice", 1), fx.Line(2, "beans", 1))
	chickenRice := fx.Recipe("chicken-rice", 4, []string{"dinner"}, fx.Line(1, "rice", 2), fx.Line(2, "chicken", 1))
	planned := []meals.PlannedMeal{
		plannedMeal(1, "dinner", "rice-beans", 1, 4),
		plannedMeal(2, "dinner", "chicken-rice", 1, 4),
	}

	first := Derive(prepInput(planned, riceBeans, chickenRice))
	second := Derive(prepInput(planned, riceBeans, chickenRice))

	if len(first.Tasks) != len(second.Tasks) {
		t.Fatalf("task counts differ: %d vs %d", len(first.Tasks), len(second.Tasks))
	}
	for i := range first.Tasks {
		if first.Tasks[i].Title != second.Tasks[i].Title {
			t.Fatalf("task %d differs: %q vs %q", i, first.Tasks[i].Title, second.Tasks[i].Title)
		}
	}
}

func TestTotalActiveMinutesIsTheSumOfTheTasks(t *testing.T) {
	a := fx.Recipe("a", 4, []string{"dinner"}, fx.Line(1, "rice", 1))
	b := fx.Recipe("b", 4, []string{"dinner"}, fx.Line(1, "rice", 1))

	plan := Derive(prepInput([]meals.PlannedMeal{
		plannedMeal(1, "dinner", "a", 1, 4),
		plannedMeal(2, "dinner", "b", 1, 4),
	}, a, b))

	var sum int
	for _, task := range plan.Tasks {
		sum += task.ActiveMinutes
	}
	if plan.TotalActiveMinutes != sum {
		t.Fatalf("total = %d, want %d", plan.TotalActiveMinutes, sum)
	}
}

func TestAnEmptyPlanDerivesNoPrep(t *testing.T) {
	plan := Derive(prepInput(nil))

	if len(plan.Tasks) != 0 || plan.TotalActiveMinutes != 0 {
		t.Fatalf("plan = %+v, want nothing to do", plan)
	}
}

func findTask(plan meals.PrepPlan, title string) *meals.PrepTask {
	for i := range plan.Tasks {
		if plan.Tasks[i].Title == title {
			return &plan.Tasks[i]
		}
	}
	return nil
}

func findTaskContaining(plan meals.PrepPlan, substring string) *meals.PrepTask {
	for i := range plan.Tasks {
		if contains(lower(plan.Tasks[i].Title), substring) ||
			containsAny(plan.Tasks[i].IngredientIDs, substring) {
			return &plan.Tasks[i]
		}
	}
	return nil
}

func taskTitles(plan meals.PrepPlan) []string {
	out := make([]string, 0, len(plan.Tasks))
	for _, task := range plan.Tasks {
		out = append(out, task.Title)
	}
	return out
}

func contains(haystack string, needle string) bool {
	return len(needle) == 0 || indexOf(haystack, needle) >= 0
}

func containsAny(values []string, needle string) bool {
	for _, value := range values {
		if contains(value, needle) {
			return true
		}
	}
	return false
}

func indexOf(haystack string, needle string) int {
	for i := 0; i+len(needle) <= len(haystack); i++ {
		if haystack[i:i+len(needle)] == needle {
			return i
		}
	}
	return -1
}

func lower(value string) string {
	out := []byte(value)
	for i, b := range out {
		if b >= 'A' && b <= 'Z' {
			out[i] = b + 32
		}
	}
	return string(out)
}
