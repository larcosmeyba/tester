package meals

import (
	"strings"
	"testing"

	"github.com/helpthehive/server/internal/db"
)

// Fixtures. They are deliberately small and explicit: a test that fails should
// say which rule broke, not send the reader to a JSON file.

func ingredient(id string, apply ...func(*db.Ingredient)) db.Ingredient {
	item := db.Ingredient{
		ID:                 id,
		DisplayName:        id,
		Aisle:              "pantry",
		FoodGroup:          "other",
		PriceReferenceUnit: "lb",
	}
	for _, fn := range apply {
		fn(&item)
	}
	return item
}

func price(id string, unit float64, packageSize float64, tier int, divisible bool) db.IngredientPrice {
	return db.IngredientPrice{
		IngredientID: id, UnitPrice: unit, PackageSize: packageSize,
		Tier: tier, Divisible: divisible, GeographicScope: "us",
	}
}

func line(position int, ingredientID string, quantity float64) db.RecipeIngredient {
	id := ingredientID
	qty := quantity
	unit := "lb"
	return db.RecipeIngredient{
		Position: position, RawText: ingredientID, IngredientID: &id, Quantity: &qty, Unit: &unit,
	}
}

func recipe(id string, servings float64, mealTypes []string, lines ...db.RecipeIngredient) db.Recipe {
	s := servings
	return db.Recipe{
		ID: id, Title: id, Servings: &s, Scalable: true, MealTypes: mealTypes,
		BaseMealPlanEligible: true, Ingredients: lines, Visibility: "public", ReviewStatus: "approved",
	}
}

func testCatalog() *Catalog {
	return NewCatalog(
		[]db.Ingredient{
			ingredient("chicken", func(i *db.Ingredient) {
				i.ContainsMeat, i.ContainsPoultry, i.IsAnimalDerived = true, true, true
				i.Aisle = "meat_seafood"
			}),
			ingredient("milk", func(i *db.Ingredient) {
				i.ContainsDairy, i.IsAnimalDerived = true, true
				i.Aisle = "dairy_refrigerated"
			}),
			ingredient("almond", func(i *db.Ingredient) { i.ContainsTreeNut = true }),
			ingredient("almond_sliced", func(i *db.Ingredient) {
				i.ContainsTreeNut = true
				parent := "almond"
				i.ParentIngredientID = &parent
			}),
			ingredient("rice", func(i *db.Ingredient) { i.Aisle = "pantry" }),
			ingredient("beans", func(i *db.Ingredient) { i.Aisle = "canned" }),
			ingredient("salt", func(i *db.Ingredient) { i.AssumedOnHand = true; i.Aisle = "spice" }),
		},
		[]db.IngredientPrice{
			price("chicken", 3.00, 1.5, 4, false),
			price("milk", 1.00, 1, 3, false),
			price("almond", 6.00, 1, 4, false),
			price("almond_sliced", 6.00, 1, 4, false),
			price("rice", 1.00, 2, 1, false),
			price("beans", 0.50, 1, 2, true),
		},
	)
}

func baseRequest() PlanRequest {
	request := PlanRequest{
		QuestionnaireVersion: "1.0",
		Household:            Household{Size: 4},
		Meals:                MealCounts{Dinner: 2},
		Days:                 2,
		Equipment:            []string{"stovetop", "oven", "microwave"},
		Leftovers:            "sometimes",
	}
	request.Normalize()
	return request
}

// --- Filtering ------------------------------------------------------------

func TestAllergyFilterExcludesRecipeContainingTheAllergen(t *testing.T) {
	catalog := testCatalog()
	request := baseRequest()
	request.Allergies = []AllergyRequirement{{Allergen: "milk", Strength: StrengthRequired}}

	creamy := recipe("creamy", 4, []string{"dinner"}, line(1, "milk", 1), line(2, "rice", 1))
	plain := recipe("plain", 4, []string{"dinner"}, line(1, "rice", 1), line(2, "beans", 1))

	eligible := EligibleRecipes([]db.Recipe{creamy, plain}, request, catalog)
	if len(eligible) != 1 || eligible[0].ID != "plain" {
		t.Fatalf("eligible = %v, want only the recipe without milk", ids(eligible))
	}
}

func TestAllergyFilterFollowsIngredientParents(t *testing.T) {
	catalog := testCatalog()
	request := baseRequest()
	// The user named "almond"; the recipe uses sliced almonds, a child of it.
	request.AllergyIngredients = []string{"almond"}

	nutty := recipe("nutty", 4, []string{"dinner"}, line(1, "almond_sliced", 0.5), line(2, "rice", 1))
	if !ViolatesAllergy(nutty, request, catalog) {
		t.Fatal("a child of a named allergy ingredient must be excluded")
	}
}

func TestAllergyFilterExcludesUnidentifiableIngredients(t *testing.T) {
	catalog := testCatalog()
	request := baseRequest()
	request.Allergies = []AllergyRequirement{{Allergen: "peanut", Strength: StrengthRequired}}

	// A line the catalogue cannot identify cannot be cleared as safe.
	mystery := recipe("mystery", 4, []string{"dinner"}, db.RecipeIngredient{Position: 1, RawText: "sauce"})
	if !ViolatesAllergy(mystery, request, catalog) {
		t.Fatal("an unresolved ingredient must never be assumed safe")
	}
}

func TestRequiredDietExcludesButPreferredDietDoesNot(t *testing.T) {
	catalog := testCatalog()
	meaty := recipe("meaty", 4, []string{"dinner"}, line(1, "chicken", 1), line(2, "rice", 1))

	required := baseRequest()
	required.DietaryRequirements = []DietRequirement{{Diet: "vegan", Strength: StrengthRequired}}
	if !ViolatesDiet(meaty, required, catalog) {
		t.Fatal("a required vegan diet must exclude a recipe containing chicken")
	}

	preferred := baseRequest()
	preferred.DietaryRequirements = []DietRequirement{{Diet: "vegan", Strength: StrengthPreferred}}
	if ViolatesDiet(meaty, preferred, catalog) {
		t.Fatal("a preferred diet is a ranking signal, not an exclusion")
	}
}

func TestEquipmentAndTimeFilters(t *testing.T) {
	request := baseRequest()
	grilled := recipe("grilled", 4, []string{"dinner"}, line(1, "chicken", 1))
	grilled.EquipmentRequired = []string{"grill"}
	if !ViolatesEquipment(grilled, request) {
		t.Fatal("a recipe needing equipment the user does not have must be excluded")
	}

	slow := recipe("slow", 4, []string{"dinner"}, line(1, "rice", 1))
	minutes := 120
	slow.TotalTimeMinutes = &minutes

	limit := 30
	preferred := baseRequest()
	preferred.CookingTime = CookingTime{MaxMinutes: &limit, Strength: StrengthPreferred}
	if ViolatesTime(slow, preferred) {
		t.Fatal("a preferred time limit must not exclude anything")
	}

	required := baseRequest()
	required.CookingTime = CookingTime{MaxMinutes: &limit, Strength: StrengthRequired}
	if !ViolatesTime(slow, required) {
		t.Fatal("a required time limit must exclude a recipe that is too slow")
	}
}

func TestIneligibleRecipesAreNeverPlanned(t *testing.T) {
	catalog := testCatalog()
	incomplete := recipe("incomplete", 4, []string{"dinner"}, line(1, "rice", 1))
	incomplete.BaseMealPlanEligible = false

	if got := EligibleRecipes([]db.Recipe{incomplete}, baseRequest(), catalog); len(got) != 0 {
		t.Fatalf("eligible = %v, want none: an incomplete recipe stays viewable but is never planned", ids(got))
	}
}

// --- Scaling --------------------------------------------------------------

func TestScaleFactorSizesToHousehold(t *testing.T) {
	four := recipe("four", 4, []string{"dinner"}, line(1, "rice", 1))

	if got := ScaleFactor(four, 4); got != 1 {
		t.Fatalf("ScaleFactor(household 4) = %v, want 1", got)
	}
	if got := ScaleFactor(four, 2); got != 0.5 {
		t.Fatalf("ScaleFactor(household 2) = %v, want 0.5", got)
	}
	if got := ScaleFactor(four, 8); got != 2 {
		t.Fatalf("ScaleFactor(household 8) = %v, want 2", got)
	}
	if got := ServingsPlanned(four, 8, 2); got != 8 {
		t.Fatalf("ServingsPlanned = %v, want 8", got)
	}

	fixed := four
	fixed.Scalable = false
	if got := ScaleFactor(fixed, 8); got != 1 {
		t.Fatalf("ScaleFactor(unscalable) = %v, want 1", got)
	}
}

// --- Pricing and the grocery list ----------------------------------------

func TestBasketRoundsPackagesUpAndBuysLooseGoodsToQuantity(t *testing.T) {
	catalog := testCatalog()
	// 2 lb of chicken sold in 1.5 lb packs at $3.00/lb -> 2 packs, $9.00.
	// 1 lb of beans sold loose at $0.50/lb -> $0.50.
	dish := recipe("dish", 4, []string{"dinner"}, line(1, "chicken", 2), line(2, "beans", 1))

	basket := BuildBasket([]PlannedRecipe{{Recipe: dish, Scale: 1}}, nil, catalog)
	byID := itemsByID(basket.Items)

	chicken := byID["chicken"]
	if chicken.Packages == nil || *chicken.Packages != 2 || chicken.EstimatedPrice != 9.00 {
		t.Fatalf("chicken = %+v, want 2 packages at $9.00", chicken)
	}
	beans := byID["beans"]
	if beans.Packages != nil || beans.EstimatedPrice != 0.50 {
		t.Fatalf("beans = %+v, want loose at $0.50", beans)
	}
}

func TestBasketCountsARepeatedRecipeTwice(t *testing.T) {
	catalog := testCatalog()
	dish := recipe("dish", 4, []string{"dinner"}, line(1, "beans", 1))

	once := BuildBasket([]PlannedRecipe{{Recipe: dish, Scale: 1}}, nil, catalog)
	twice := BuildBasket([]PlannedRecipe{{Recipe: dish, Scale: 1}, {Recipe: dish, Scale: 1}}, nil, catalog)

	if itemsByID(once.Items)["beans"].NeededQty != 1 {
		t.Fatalf("one serving needed %v beans, want 1", itemsByID(once.Items)["beans"].NeededQty)
	}
	if got := itemsByID(twice.Items)["beans"].NeededQty; got != 2 {
		t.Fatalf("a dish cooked twice needed %v beans, want 2", got)
	}
}

func TestPantryItemsStayOnTheListAtZeroCost(t *testing.T) {
	catalog := testCatalog()
	dish := recipe("dish", 4, []string{"dinner"}, line(1, "rice", 2), line(2, "beans", 1))

	basket := BuildBasket([]PlannedRecipe{{Recipe: dish, Scale: 1}}, set("rice"), catalog)
	rice := itemsByID(basket.Items)["rice"]

	if !rice.InPantry {
		t.Fatal("a pantry ingredient must stay on the list, marked as already owned")
	}
	if rice.EstimatedPrice != 0 {
		t.Fatalf("pantry item price = %v, want 0", rice.EstimatedPrice)
	}
	if basket.Cost.Point != 0.50 {
		t.Fatalf("cost = %v, want only the beans at $0.50", basket.Cost.Point)
	}
}

func TestAssumedOnHandIngredientsAreNeverBought(t *testing.T) {
	catalog := testCatalog()
	dish := recipe("dish", 4, []string{"dinner"}, line(1, "salt", 1), line(2, "rice", 1))

	basket := BuildBasket([]PlannedRecipe{{Recipe: dish, Scale: 1}}, nil, catalog)
	if _, found := itemsByID(basket.Items)["salt"]; found {
		t.Fatal("salt is assumed on hand and must never reach a grocery list")
	}
}

func TestCostIsARangeAndUnpricedIngredientsLowerConfidence(t *testing.T) {
	catalog := testCatalog()
	priced := recipe("priced", 4, []string{"dinner"}, line(1, "rice", 2))

	basket := BuildBasket([]PlannedRecipe{{Recipe: priced, Scale: 1}}, nil, catalog)
	if !(basket.Cost.Low < basket.Cost.Point && basket.Cost.Point < basket.Cost.High) {
		t.Fatalf("cost = %+v, want low < point < high", basket.Cost)
	}
	// Rice is tier 1, the tightest band.
	if basket.Cost.Confidence != ConfidenceHigh {
		t.Fatalf("confidence = %q, want high for a tier 1 basket", basket.Cost.Confidence)
	}

	unpriced := recipe("unpriced", 4, []string{"dinner"},
		line(1, "rice", 2), line(2, "almond_unknown", 1))
	catalogWithGap := NewCatalog(
		append(catalogIngredients(catalog), ingredient("almond_unknown")),
		catalogPrices(catalog),
	)
	gapped := BuildBasket([]PlannedRecipe{{Recipe: unpriced, Scale: 1}}, nil, catalogWithGap)
	if gapped.Cost.Confidence != ConfidenceLow {
		t.Fatalf("confidence = %q, want low when something could not be priced", gapped.Cost.Confidence)
	}
	if !mentions(gapped.Assumptions, "could not be priced") {
		t.Fatalf("assumptions = %v, want the unpriced ingredient disclosed", gapped.Assumptions)
	}
}

func TestGroceryListIsGroupedInShoppingOrder(t *testing.T) {
	catalog := testCatalog()
	dish := recipe("dish", 4, []string{"dinner"}, line(1, "rice", 1), line(2, "chicken", 1), line(3, "beans", 1))

	basket := BuildBasket([]PlannedRecipe{{Recipe: dish, Scale: 1}}, nil, catalog)
	sections := GroupByAisle(basket.Items, catalog)

	var order []string
	for _, section := range sections {
		order = append(order, section.Aisle)
	}
	want := []string{"meat_seafood", "pantry", "canned"}
	if len(order) != len(want) {
		t.Fatalf("sections = %v, want %v", order, want)
	}
	for i := range want {
		if order[i] != want[i] {
			t.Fatalf("sections = %v, want %v", order, want)
		}
	}
}

// --- Planning -------------------------------------------------------------

func TestPlannerFillsRequestedSlotsAndPricesTheWeek(t *testing.T) {
	catalog := testCatalog()
	request := baseRequest()

	pool := []db.Recipe{
		recipe("a", 4, []string{"dinner"}, line(1, "rice", 1)),
		recipe("b", 4, []string{"dinner"}, line(1, "beans", 1)),
	}
	plan := NewPlanner(catalog).Build(request, pool, "plan-1")

	if len(plan.Meals) != 2 {
		t.Fatalf("meals = %d, want 2", len(plan.Meals))
	}
	if plan.Meals[0].Slot != (Slot{Day: 1, MealType: "dinner"}) {
		t.Fatalf("first slot = %+v, want day 1 dinner", plan.Meals[0].Slot)
	}
	if plan.Summary.MealsPlanned != 2 || plan.Summary.HouseholdSize != 4 {
		t.Fatalf("summary = %+v", plan.Summary)
	}
	if plan.Summary.EstimatedCost.Point <= 0 {
		t.Fatalf("estimated cost = %+v, want a priced basket", plan.Summary.EstimatedCost)
	}
}

func TestPlannerIsDeterministic(t *testing.T) {
	catalog := testCatalog()
	request := baseRequest()
	pool := []db.Recipe{
		recipe("b", 4, []string{"dinner"}, line(1, "rice", 1)),
		recipe("a", 4, []string{"dinner"}, line(1, "rice", 1)),
	}

	first := NewPlanner(catalog).Build(request, pool, "plan-1")
	second := NewPlanner(catalog).Build(request, reverse(pool), "plan-2")

	for i := range first.Meals {
		if first.Meals[i].RecipeID != second.Meals[i].RecipeID {
			t.Fatalf("same request produced different weeks: %v vs %v",
				mealIDs(first.Meals), mealIDs(second.Meals))
		}
	}
}

func TestPlannerLeavesSlotsEmptyRatherThanInventingMeals(t *testing.T) {
	catalog := testCatalog()
	request := baseRequest()
	request.Meals = MealCounts{Dinner: 2, Breakfast: 2}

	// Nothing in the pool is a breakfast.
	pool := []db.Recipe{recipe("a", 4, []string{"dinner"}, line(1, "rice", 1))}
	plan := NewPlanner(catalog).Build(request, pool, "plan-1")

	for _, meal := range plan.Meals {
		if meal.Slot.MealType == "breakfast" {
			t.Fatal("a breakfast slot was filled with a recipe that is not a breakfast")
		}
	}
	if plan.Status != "partial" {
		t.Fatalf("status = %q, want partial when slots could not be filled", plan.Status)
	}
}

func TestNoLeftoversMeansNoRepeatedRecipe(t *testing.T) {
	catalog := testCatalog()
	request := baseRequest()
	request.Leftovers = "no"
	request.Meals = MealCounts{Dinner: 2}

	pool := []db.Recipe{
		recipe("a", 4, []string{"dinner"}, line(1, "rice", 1)),
		recipe("b", 4, []string{"dinner"}, line(1, "beans", 1)),
	}
	plan := NewPlanner(catalog).Build(request, pool, "plan-1")

	if len(plan.Meals) != 2 || plan.Meals[0].RecipeID == plan.Meals[1].RecipeID {
		t.Fatalf("meals = %v, want two different recipes", mealIDs(plan.Meals))
	}
}

func TestHeadroomIsMeasuredAgainstTheUpperBound(t *testing.T) {
	catalog := testCatalog()
	request := baseRequest()
	request.Budget = Budget{Amount: 100, Currency: "USD", Mode: "balanced"}

	pool := []db.Recipe{recipe("a", 4, []string{"dinner"}, line(1, "rice", 1))}
	plan := NewPlanner(catalog).Build(request, pool, "plan-1")

	if plan.Summary.Headroom == nil || plan.Summary.Budget == nil {
		t.Fatal("a plan with a budget must report headroom")
	}
	want := roundCents(100 - plan.Summary.EstimatedCost.High)
	if *plan.Summary.Headroom != want {
		t.Fatalf("headroom = %v, want %v (budget minus the range's high end)", *plan.Summary.Headroom, want)
	}
}

func TestDeterministicMessageQuotesOnlyComputedNumbers(t *testing.T) {
	catalog := testCatalog()
	pool := []db.Recipe{recipe("a", 4, []string{"dinner"}, line(1, "rice", 1))}
	plan := NewPlanner(catalog).Build(baseRequest(), pool, "plan-1")

	message := DeterministicMessage(plan)
	if message == "" {
		t.Fatal("a plan must always come with a message")
	}
	if !mentions([]string{message}, "estimated") {
		t.Fatalf("message = %q, want costs described as estimates", message)
	}
}

// --- Helpers --------------------------------------------------------------

func ids(recipes []db.Recipe) []string {
	out := make([]string, 0, len(recipes))
	for _, recipe := range recipes {
		out = append(out, recipe.ID)
	}
	return out
}

func mealIDs(meals []PlannedMeal) []string {
	out := make([]string, 0, len(meals))
	for _, meal := range meals {
		out = append(out, meal.RecipeID)
	}
	return out
}

func itemsByID(items []GroceryItem) map[string]GroceryItem {
	out := make(map[string]GroceryItem, len(items))
	for _, item := range items {
		out[item.IngredientID] = item
	}
	return out
}

func mentions(values []string, substring string) bool {
	for _, value := range values {
		if strings.Contains(value, substring) {
			return true
		}
	}
	return false
}

func reverse(recipes []db.Recipe) []db.Recipe {
	out := make([]db.Recipe, len(recipes))
	for i, recipe := range recipes {
		out[len(recipes)-1-i] = recipe
	}
	return out
}

func catalogIngredients(catalog *Catalog) []db.Ingredient {
	out := make([]db.Ingredient, 0, len(catalog.byID))
	for _, ingredient := range catalog.byID {
		out = append(out, ingredient)
	}
	return out
}

func catalogPrices(catalog *Catalog) []db.IngredientPrice {
	out := make([]db.IngredientPrice, 0, len(catalog.prices))
	for _, price := range catalog.prices {
		out = append(out, price)
	}
	return out
}
