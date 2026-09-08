package meals

import "github.com/helpthehive/server/internal/db"

// Catalog is an indexed view of the ingredient catalogue and its prices. The
// planner reads allergen and diet facts from here — never from a recipe's text
// and never from anything a model produced.
type Catalog struct {
	byID   map[string]db.Ingredient
	prices map[string]db.IngredientPrice
}

func NewCatalog(ingredients []db.Ingredient, prices []db.IngredientPrice) *Catalog {
	catalog := &Catalog{
		byID:   make(map[string]db.Ingredient, len(ingredients)),
		prices: make(map[string]db.IngredientPrice, len(prices)),
	}
	for _, ingredient := range ingredients {
		catalog.byID[ingredient.ID] = ingredient
	}
	for _, price := range prices {
		catalog.prices[price.IngredientID] = price
	}
	return catalog
}

func (c *Catalog) Ingredient(id string) (db.Ingredient, bool) {
	ingredient, ok := c.byID[id]
	return ingredient, ok
}

func (c *Catalog) Price(id string) (db.IngredientPrice, bool) {
	price, ok := c.prices[id]
	return price, ok
}

func (c *Catalog) IDs() []string {
	ids := make([]string, 0, len(c.byID))
	for id := range c.byID {
		ids = append(ids, id)
	}
	return ids
}

// Matches reports whether an ingredient id is covered by a selection, either
// directly or through its parent. "Tree nuts" selected as an allergy therefore
// covers almonds and walnuts without either being listed.
func (c *Catalog) Matches(ingredientID string, selection map[string]bool) bool {
	if ingredientID == "" || len(selection) == 0 {
		return false
	}
	if selection[ingredientID] {
		return true
	}
	ingredient, ok := c.byID[ingredientID]
	if !ok || ingredient.ParentIngredientID == nil {
		return false
	}
	return selection[*ingredient.ParentIngredientID]
}

// ContainsAllergen reads the catalogue's reviewed flags. Sesame, coconut and
// the rest are data, not inference.
func ContainsAllergen(ingredient db.Ingredient, allergen string) bool {
	switch allergen {
	case "milk":
		return ingredient.ContainsDairy
	case "egg":
		return ingredient.ContainsEgg
	case "fish":
		return ingredient.ContainsFish
	case "shellfish":
		return ingredient.ContainsShellfish
	case "tree_nut":
		return ingredient.ContainsTreeNut
	case "peanut":
		return ingredient.ContainsPeanut
	case "wheat":
		return ingredient.ContainsWheat
	case "soy":
		return ingredient.ContainsSoy
	case "sesame":
		return ingredient.ContainsSesame
	}
	return false
}

// SatisfiesDiet reads the same reviewed flags. A diet the catalogue cannot
// prove is treated as unsatisfied, so an unverifiable recipe is never planned
// for someone who requires that diet.
func SatisfiesDiet(ingredient db.Ingredient, diet string) bool {
	switch diet {
	case "vegan":
		return !ingredient.IsAnimalDerived
	case "vegetarian":
		return !ingredient.ContainsMeat && !ingredient.ContainsPoultry &&
			!ingredient.ContainsFish && !ingredient.ContainsShellfish
	case "pescatarian":
		return !ingredient.ContainsMeat && !ingredient.ContainsPoultry
	case "gluten_free":
		return !ingredient.ContainsGluten
	case "dairy_free":
		return !ingredient.ContainsDairy
	case "egg_free":
		return !ingredient.ContainsEgg
	case "nut_free":
		return !ingredient.ContainsPeanut && !ingredient.ContainsTreeNut
	}
	return false
}

// AllergensOf lists the allergens an ingredient carries, for display.
func AllergensOf(ingredient db.Ingredient) []string {
	all := []string{"milk", "egg", "fish", "shellfish", "tree_nut", "peanut", "wheat", "soy", "sesame"}
	var present []string
	for _, allergen := range all {
		if ContainsAllergen(ingredient, allergen) {
			present = append(present, allergen)
		}
	}
	return present
}
