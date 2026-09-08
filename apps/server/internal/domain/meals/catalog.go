// Package catalog owns the canonical ingredient catalogue: the reviewed
// allergen and diet facts, the parent/child relationships, and the price rows
// that go with them.
//
// It is its own module because it is shared reference data. The generator asks
// it what is safe, grocery asks it what things cost, and the pantry and allergy
// pickers read it directly — none of which should mean importing another
// module's service.
package meals

import "strings"

// Catalog is an indexed, read-only view of the ingredient catalogue and its
// prices. The planner reads allergen and diet facts from here — never from a
// recipe's text and never from anything a model produced.
//
// It lives in the domain because it decides nothing: it is a lookup over
// reviewed data that the generator, grocery and the pantry all need. Loading it
// from the database is the catalog module's job.
type Catalog struct {
	byID   map[string]Ingredient
	byName map[string]string
	prices map[string]IngredientPrice
}

func NewCatalog(ingredients []Ingredient, prices []IngredientPrice) *Catalog {
	catalog := &Catalog{
		byID:   make(map[string]Ingredient, len(ingredients)),
		byName: make(map[string]string, len(ingredients)),
		prices: make(map[string]IngredientPrice, len(prices)),
	}
	for _, ingredient := range ingredients {
		catalog.byID[ingredient.ID] = ingredient
		if key := NormalizeIngredientName(ingredient.DisplayName); key != "" {
			// First writer wins, so a later duplicate display name cannot
			// silently redirect an established one.
			if _, taken := catalog.byName[key]; !taken {
				catalog.byName[key] = ingredient.ID
			}
		}
	}
	for _, price := range prices {
		catalog.prices[price.IngredientID] = price
	}
	return catalog
}

func (c *Catalog) Ingredient(id string) (Ingredient, bool) {
	ingredient, ok := c.byID[id]
	return ingredient, ok
}

func (c *Catalog) Price(id string) (IngredientPrice, bool) {
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
func ContainsAllergen(ingredient Ingredient, allergen string) bool {
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
func SatisfiesDiet(ingredient Ingredient, diet string) bool {
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
func AllergensOf(ingredient Ingredient) []string {
	all := []string{"milk", "egg", "fish", "shellfish", "tree_nut", "peanut", "wheat", "soy", "sesame"}
	var present []string
	for _, allergen := range all {
		if ContainsAllergen(ingredient, allergen) {
			present = append(present, allergen)
		}
	}
	return present
}

// FindByName resolves a written ingredient name to the catalogue.
//
// The match is exact once case, punctuation and spacing are normalized, and
// the id itself is accepted. It is deliberately not fuzzy: the catalogue is
// where allergens come from, and a near-miss that resolves "almond milk" to
// "milk" — or fails to resolve it at all while looking like it did — is a
// safety failure, not a search-quality one. An unmatched line is reported as
// unmatched and the recipe is held back.
func (c *Catalog) FindByName(name string) (Ingredient, bool) {
	key := NormalizeIngredientName(name)
	if key == "" {
		return Ingredient{}, false
	}
	if ingredient, ok := c.byID[key]; ok {
		return ingredient, true
	}
	id, ok := c.byName[key]
	if !ok {
		return Ingredient{}, false
	}
	ingredient, ok := c.byID[id]
	return ingredient, ok
}

// NormalizeIngredientName lowercases, collapses whitespace and drops
// punctuation so "Olive Oil", "olive  oil" and "olive-oil" are one key.
func NormalizeIngredientName(value string) string {
	var b strings.Builder
	b.Grow(len(value))
	lastWasSep := true
	for _, r := range strings.ToLower(strings.TrimSpace(value)) {
		switch {
		case r >= 'a' && r <= 'z', r >= '0' && r <= '9':
			b.WriteRune(r)
			lastWasSep = false
		default:
			if !lastWasSep {
				b.WriteRune('_')
				lastWasSep = true
			}
		}
	}
	return strings.Trim(b.String(), "_")
}
