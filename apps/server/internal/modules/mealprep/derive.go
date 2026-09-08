// Package mealprep works out the batch cooking a week's plan makes possible.
//
// It derives, it does not ask. Everything here is already implied by the plan:
// the same onion diced once instead of four times, the same grain cooked once
// for three dinners, the stew that is worth doubling because it freezes. There
// is no new user input and no new judgement — which is why a prep plan can
// always be thrown away and recomputed rather than kept in sync.
//
// Two rules it shares with the rest of the meal system: a quantity the recipes
// never stated is left nil and said to be missing, never invented; and storage
// guidance comes from the catalogue's food group and the recipe's own tags,
// never from a claim about how long something is safe to keep.
package mealprep

import (
	"fmt"
	"sort"
	"strings"

	"github.com/helpthehive/server/internal/domain/meals"
)

// Thresholds. They are plain numbers so a prep plan can be reasoned about
// rather than emerging from tuning nobody can read.
const (
	// An ingredient is worth prepping ahead when at least this many planned
	// meals use it. Two is the point at which doing it once saves doing it
	// twice.
	minMealsForBatchIngredient = 2

	// A recipe is worth batch cooking when it makes at least this many
	// servings, and the plan says leftovers are welcome.
	minServingsForBatchCook = 4

	// Rough hands-on minutes for preparing one ingredient ahead. It is an
	// estimate of *our* task, not a claim about the recipe.
	minutesPerBatchIngredient = 5
)

// Ingredients never worth a prep task: a spice is added, not prepared.
//
// The values are the catalogue's own food groups — vegetable, protein, spice,
// grain, legume, fruit, fat, dairy. Anything unrecognised is prepped rather
// than skipped, because silently dropping an ingredient from prep is worse
// than proposing one task too many.
var notWorthPrepping = map[string]bool{
	"spice": true,
}

// Input is a plan reduced to what prep derivation needs.
type Input struct {
	MealPlanID string
	UserID     string
	Meals      []meals.PlannedMeal
	// Every recipe the plan refers to, keyed by id.
	Recipes map[string]meals.Recipe
	Catalog *meals.Catalog
}

// Derive turns a plan into its prep work.
//
// The result is deterministic: the same plan always produces the same tasks in
// the same order, so a user who reloads sees the list they had.
func Derive(input Input) meals.PrepPlan {
	plan := meals.PrepPlan{
		MealPlanID: input.MealPlanID,
		UserID:     input.UserID,
	}

	tasks := append(batchIngredientTasks(input), batchCookTasks(input)...)

	// Shared prep first, then batch cooking: you chop before you cook, and a
	// list that reads in the order the work happens is worth more than one
	// sorted by size.
	sort.SliceStable(tasks, func(i, j int) bool {
		if tasks[i].Kind != tasks[j].Kind {
			return tasks[i].Kind == meals.PrepBatchIngredient
		}
		if len(tasks[i].ServesSlots) != len(tasks[j].ServesSlots) {
			return len(tasks[i].ServesSlots) > len(tasks[j].ServesSlots)
		}
		return tasks[i].Title < tasks[j].Title
	})

	for i := range tasks {
		tasks[i].Position = i + 1
		plan.TotalActiveMinutes += tasks[i].ActiveMinutes
	}
	plan.Tasks = tasks
	return plan
}

// usage is one ingredient's part in the week.
type usage struct {
	ingredientID string
	displayName  string
	unit         string
	// Nil once any contributing line had no stated quantity: a total that is
	// missing a term is not a total, and is reported as unknown rather than
	// as the sum of the parts that happened to be stated.
	total         *float64
	quantityKnown bool
	recipeIDs     []string
	slots         []string
	foodGroup     string
}

// batchIngredientTasks finds ingredients several meals share.
func batchIngredientTasks(input Input) []meals.PrepTask {
	byIngredient := map[string]*usage{}

	for _, meal := range input.Meals {
		recipe, ok := input.Recipes[meal.RecipeID]
		if !ok {
			continue
		}
		scale := meal.ScaleFactor
		if scale <= 0 {
			scale = 1
		}
		slot := fmt.Sprintf("%d:%s", meal.Slot.Day, meal.Slot.MealType)

		for _, line := range meals.PurchasableLines(recipe) {
			if line.IngredientID == nil {
				continue
			}
			ingredient, known := input.Catalog.Ingredient(*line.IngredientID)
			if !known || ingredient.AssumedOnHand || notWorthPrepping[ingredient.FoodGroup] {
				continue
			}

			entry := byIngredient[ingredient.ID]
			if entry == nil {
				entry = &usage{
					ingredientID:  ingredient.ID,
					displayName:   ingredient.DisplayName,
					unit:          ingredient.PriceReferenceUnit,
					foodGroup:     ingredient.FoodGroup,
					quantityKnown: true,
				}
				byIngredient[ingredient.ID] = entry
			}
			entry.recipeIDs = appendUnique(entry.recipeIDs, recipe.ID)
			entry.slots = appendUnique(entry.slots, slot)

			if line.Quantity == nil {
				// One unstated quantity makes the whole total unknown.
				entry.quantityKnown = false
				continue
			}
			if entry.quantityKnown {
				running := *line.Quantity * scale
				if entry.total == nil {
					entry.total = &running
				} else {
					sum := *entry.total + running
					entry.total = &sum
				}
			}
		}
	}

	var tasks []meals.PrepTask
	for _, entry := range byIngredient {
		if len(entry.slots) < minMealsForBatchIngredient {
			continue
		}
		task := meals.PrepTask{
			Kind:          meals.PrepBatchIngredient,
			Title:         fmt.Sprintf("Prep %s", entry.displayName),
			ActiveMinutes: minutesPerBatchIngredient,
			Storage:       storageFor(entry.foodGroup),
			KeepsDays:     keepsDaysFor(entry.foodGroup),
			IngredientIDs: []string{entry.ingredientID},
			RecipeIDs:     sortedCopy(entry.recipeIDs),
			ServesSlots:   sortedCopy(entry.slots),
		}
		if entry.quantityKnown && entry.total != nil {
			amount := meals.RoundCents(*entry.total)
			unit := entry.unit
			task.PortionAmount = &amount
			task.PortionUnit = &unit
			task.Instruction = fmt.Sprintf(
				"Prepare about %s %s in one go — it is used by %d meals this week.",
				trimFloat(amount), unit, len(entry.slots))
		} else {
			// The recipes never said how much. It is not guessed at, and the
			// task says so plainly so the user knows to check.
			task.Instruction = fmt.Sprintf(
				"Prepare %s for the whole week — %d meals use it. The recipes did not "+
					"say how much, so check them before you start.",
				strings.ToLower(entry.displayName), len(entry.slots))
		}
		tasks = append(tasks, task)
	}
	return tasks
}

// batchCookTasks finds whole recipes worth cooking once for several servings.
func batchCookTasks(input Input) []meals.PrepTask {
	type cook struct {
		recipe   meals.Recipe
		servings float64
		slots    []string
	}
	byRecipe := map[string]*cook{}

	for _, meal := range input.Meals {
		recipe, ok := input.Recipes[meal.RecipeID]
		if !ok {
			continue
		}
		entry := byRecipe[recipe.ID]
		if entry == nil {
			entry = &cook{recipe: recipe}
			byRecipe[recipe.ID] = entry
		}
		entry.servings += meal.ServingsPlanned
		entry.slots = appendUnique(entry.slots, fmt.Sprintf("%d:%s", meal.Slot.Day, meal.Slot.MealType))
	}

	var tasks []meals.PrepTask
	for _, entry := range byRecipe {
		batchable := len(entry.slots) >= minMealsForBatchIngredient ||
			hasTag(entry.recipe, "method.meal_prep") ||
			hasTag(entry.recipe, "method.freezer_friendly")
		if !batchable || entry.servings < minServingsForBatchCook {
			continue
		}

		servings := meals.RoundCents(entry.servings)
		unit := "servings"
		minutes := 0
		if entry.recipe.TotalTimeMinutes != nil {
			minutes = *entry.recipe.TotalTimeMinutes
		}
		storage := meals.StorageRefrigerate
		if hasTag(entry.recipe, "method.freezer_friendly") {
			storage = meals.StorageFreeze
		}
		keeps := 4
		if storage == meals.StorageFreeze {
			keeps = 60
		}

		tasks = append(tasks, meals.PrepTask{
			Kind:  meals.PrepBatchCook,
			Title: fmt.Sprintf("Batch cook %s", entry.recipe.Title),
			Instruction: fmt.Sprintf(
				"Cook %s once for about %s servings, then portion it for %d meals.",
				entry.recipe.Title, trimFloat(servings), len(entry.slots)),
			ActiveMinutes: minutes,
			PortionAmount: &servings,
			PortionUnit:   &unit,
			Storage:       storage,
			KeepsDays:     &keeps,
			RecipeIDs:     []string{entry.recipe.ID},
			ServesSlots:   sortedCopy(entry.slots),
		})
	}
	return tasks
}

// storageFor is guidance from the catalogue's food group, not a food-safety
// claim: where this kind of thing usually lives, so a prepped item is not left
// out by accident.
func storageFor(foodGroup string) string {
	switch foodGroup {
	case "vegetable", "fruit", "dairy", "protein":
		return meals.StorageRefrigerate
	default:
		// Grains, legumes and fats keep in a cupboard, and so does anything the
		// catalogue groups in a way this does not recognise.
		return meals.StoragePantry
	}
}

// keepsDaysFor is conservative on purpose: it is better to be told to use
// something sooner than it strictly needs to be used.
func keepsDaysFor(foodGroup string) *int {
	var days int
	switch foodGroup {
	case "protein":
		days = 2
	case "vegetable", "fruit", "dairy":
		days = 3
	case "grain", "legume":
		days = 5
	default:
		// No guidance rather than a guess. A number nobody can stand behind is
		// worse than saying nothing.
		return nil
	}
	return &days
}

func hasTag(recipe meals.Recipe, tag string) bool {
	for _, existing := range recipe.Tags {
		if existing == tag {
			return true
		}
	}
	return false
}

func appendUnique(values []string, value string) []string {
	for _, existing := range values {
		if existing == value {
			return values
		}
	}
	return append(values, value)
}

func sortedCopy(values []string) []string {
	out := make([]string, len(values))
	copy(out, values)
	sort.Strings(out)
	return out
}

func trimFloat(value float64) string {
	return strings.TrimSuffix(strings.TrimRight(fmt.Sprintf("%.2f", value), "0"), ".")
}
