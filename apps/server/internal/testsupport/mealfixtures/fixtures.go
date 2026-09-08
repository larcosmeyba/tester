// Package mealfixtures builds the small, explicit meal values the engine tests
// run against.
//
// They are shared because the same catalogue has to price a basket and clear an
// allergy, and two copies of it would drift. They are deliberately tiny: a
// failing test should say which rule broke, not send the reader to a JSON file.
package mealfixtures

import "github.com/helpthehive/server/internal/domain/meals"

func Ingredient(id string, apply ...func(*meals.Ingredient)) meals.Ingredient {
	item := meals.Ingredient{
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

func Price(id string, unit float64, packageSize float64, tier int, divisible bool) meals.IngredientPrice {
	return meals.IngredientPrice{
		IngredientID: id, UnitPrice: unit, PackageSize: packageSize,
		Tier: tier, Divisible: divisible, GeographicScope: "us",
	}
}

func Line(position int, ingredientID string, quantity float64) meals.RecipeIngredient {
	id := ingredientID
	qty := quantity
	unit := "lb"
	return meals.RecipeIngredient{
		Position: position, RawText: ingredientID, IngredientID: &id, Quantity: &qty, Unit: &unit,
	}
}

func Recipe(id string, servings float64, mealTypes []string, lines ...meals.RecipeIngredient) meals.Recipe {
	s := servings
	return meals.Recipe{
		ID: id, Title: id, Servings: &s, Scalable: true, MealTypes: mealTypes,
		BaseMealPlanEligible: true, Ingredients: lines, Visibility: "public", ReviewStatus: "approved",
	}
}

// Ingredients is the catalogue's reviewed data: one ingredient per rule under
// test — a meat, a dairy, a tree nut and its child, and one always-on-hand.
func Ingredients() []meals.Ingredient {
	return []meals.Ingredient{
		Ingredient("chicken", func(i *meals.Ingredient) {
			i.ContainsMeat, i.ContainsPoultry, i.IsAnimalDerived = true, true, true
			i.Aisle = "meat_seafood"
		}),
		Ingredient("milk", func(i *meals.Ingredient) {
			i.ContainsDairy, i.IsAnimalDerived = true, true
			i.Aisle = "dairy_refrigerated"
		}),
		Ingredient("almond", func(i *meals.Ingredient) { i.ContainsTreeNut = true }),
		Ingredient("almond_sliced", func(i *meals.Ingredient) {
			i.ContainsTreeNut = true
			parent := "almond"
			i.ParentIngredientID = &parent
		}),
		Ingredient("rice", func(i *meals.Ingredient) { i.Aisle = "pantry" }),
		Ingredient("beans", func(i *meals.Ingredient) { i.Aisle = "canned" }),
		Ingredient("salt", func(i *meals.Ingredient) { i.AssumedOnHand = true; i.Aisle = "spice" }),
	}
}

// Prices covers every ingredient but salt, which is never bought. Tiers are
// spread across 1-4 so the cost range's confidence can be exercised.
func Prices() []meals.IngredientPrice {
	return []meals.IngredientPrice{
		Price("chicken", 3.00, 1.5, 4, false),
		Price("milk", 1.00, 1, 3, false),
		Price("almond", 6.00, 1, 4, false),
		Price("almond_sliced", 6.00, 1, 4, false),
		Price("rice", 1.00, 2, 1, false),
		Price("beans", 0.50, 1, 2, true),
	}
}

func Catalog() *meals.Catalog { return meals.NewCatalog(Ingredients(), Prices()) }

// BaseRequest is the smallest valid request: four people, two dinners, two
// days, everyday equipment.
func BaseRequest() meals.PlanRequest {
	request := meals.PlanRequest{
		QuestionnaireVersion: "1.0",
		Household:            meals.Household{Size: 4},
		Meals:                meals.MealCounts{Dinner: 2},
		Days:                 2,
		Equipment:            []string{"stovetop", "oven", "microwave"},
		Leftovers:            "sometimes",
	}
	request.Normalize()
	return request
}
