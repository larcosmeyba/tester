package spoonacular

import (
	"context"
	"errors"
	"sync"
)

// Mock is a Recipes implementation that answers from fixtures instead of the
// network. It exists so the mobile UI can be built, laid out and
// screenshotted against real-shaped data before any API key is provisioned,
// and so feature code can be tested without spending daily quota.
//
// Mock is safe for concurrent use.
type Mock struct {
	mu      sync.Mutex
	Recipes []Recipe

	SearchErr error
	DetailErr error

	SearchCalls []SearchParams
	DetailCalls []int
}

var _ Recipes = (*Mock)(nil)

func (m *Mock) Available() bool { return true }

func (m *Mock) Search(_ context.Context, params SearchParams) ([]Recipe, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.SearchCalls = append(m.SearchCalls, params)
	if m.SearchErr != nil {
		return nil, m.SearchErr
	}
	return append([]Recipe(nil), m.Recipes...), nil
}

func (m *Mock) Detail(_ context.Context, id int) (Recipe, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.DetailCalls = append(m.DetailCalls, id)
	if m.DetailErr != nil {
		return Recipe{}, m.DetailErr
	}
	for _, r := range m.Recipes {
		if r.ID == id {
			return r, nil
		}
	}
	return Recipe{}, ErrNotFound
}

// ErrNotFound reports a recipe id the mock does not hold. The live client
// lets Spoonacular's status code surface instead.
var ErrNotFound = errors.New("spoonacular: recipe not found")

// NewMock seeds a Mock with the sample fixtures.
func NewMock() *Mock { return &Mock{Recipes: SampleRecipes()} }

// SampleRecipes returns Spoonacular-shaped fixture data: real ids, real
// titles, real image URLs, ready-in minutes, servings, price-per-serving,
// dish types, cuisines, diets and extended ingredients, in exactly the shape
// the mobile client's SpoonacularRecipe interface describes. These are
// fixtures for UI development and tests — they are not a licensed copy of
// anything.
func SampleRecipes() []Recipe {
	return []Recipe{
		{
			ID:                 654959,
			Title:              "Pasta With Chicken and Mushrooms",
			ImageURL:           strptr("https://img.spoonacular.com/recipes/654959-556x370.jpg"),
			ReadyInMinutes:     intptr(45),
			Servings:           6,
			PricePerServingUSD: floatptr(1.75),
			DishTypes:          []string{"main course", "dinner"},
			Cuisines:           []string{"italian"},
			Diets:              []string{},
			ExtendedIngredients: []Ingredient{
				{ID: 1001, Original: "1.5 lb chicken breast", NameClean: strptr("chicken breast"), Amount: 1.5, Unit: "lb"},
				{ID: 1002, Original: "8 oz mushrooms, sliced", NameClean: strptr("mushrooms"), Amount: 8, Unit: "oz"},
				{ID: 1003, Original: "12 oz pasta", NameClean: strptr("pasta"), Amount: 12, Unit: "oz"},
			},
			Instructions: strptr("Cook the pasta. Sear the chicken. Add mushrooms and combine."),
			Provenance:   ProvenanceMock,
			SourceURL:    "https://spoonacular.com/pasta-with-chicken-and-mushrooms-654959",
		},
		{
			ID:                 716426,
			Title:              "Cauliflower, Brown Rice, and Vegetable Fried Rice",
			ImageURL:           strptr("https://img.spoonacular.com/recipes/716426-556x370.jpg"),
			ReadyInMinutes:     intptr(30),
			Servings:           4,
			PricePerServingUSD: floatptr(0.92),
			DishTypes:          []string{"main course", "side dish"},
			Cuisines:           []string{"chinese"},
			Diets:              []string{"vegetarian", "gluten free"},
			ExtendedIngredients: []Ingredient{
				{ID: 2001, Original: "1 head cauliflower, riced", NameClean: strptr("cauliflower"), Amount: 1, Unit: "head"},
				{ID: 2002, Original: "2 cups cooked brown rice", NameClean: strptr("brown rice"), Amount: 2, Unit: "cups"},
				{ID: 2003, Original: "1 cup frozen peas", NameClean: strptr("frozen peas"), Amount: 1, Unit: "cup"},
			},
			Instructions: strptr("Rice the cauliflower. Stir-fry with rice and peas until heated through."),
			Provenance:   ProvenanceMock,
			SourceURL:    "https://spoonacular.com/cauliflower-brown-rice-and-vegetable-fried-rice-716426",
		},
		{
			ID:                 652153,
			Title:              "Moroccan Chickpea and Lentil Stew",
			ImageURL:           strptr("https://img.spoonacular.com/recipes/652153-556x370.jpg"),
			ReadyInMinutes:     intptr(50),
			Servings:           8,
			PricePerServingUSD: floatptr(0.64),
			DishTypes:          []string{"soup", "main course"},
			Cuisines:           []string{"african"},
			Diets:              []string{"vegan", "gluten free"},
			ExtendedIngredients: []Ingredient{
				{ID: 3001, Original: "2 cans chickpeas, drained", NameClean: strptr("chickpeas"), Amount: 2, Unit: "cans"},
				{ID: 3002, Original: "1 cup red lentils", NameClean: strptr("red lentils"), Amount: 1, Unit: "cup"},
				{ID: 3003, Original: "28 oz crushed tomatoes", NameClean: strptr("crushed tomatoes"), Amount: 28, Unit: "oz"},
			},
			Instructions: strptr("Simmer lentils and chickpeas in spiced tomato broth until tender."),
			Provenance:   ProvenanceMock,
			SourceURL:    "https://spoonacular.com/moroccan-chickpea-and-lentil-stew-652153",
		},
	}
}

func strptr(s string) *string { return &s }

func intptr(i int) *int { return &i }

func floatptr(f float64) *float64 { return &f }
