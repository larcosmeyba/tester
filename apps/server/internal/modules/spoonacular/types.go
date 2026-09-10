package spoonacular

import "errors"

// ErrNotConfigured is returned when no Spoonacular key is configured. It is a
// normal state, not a fault: the recipe database keeps working on its own
// library, and features that need Spoonacular report themselves unavailable.
var ErrNotConfigured = errors.New("spoonacular is not configured: SPOONACULAR_API_KEY is unset")

// Provenance values, mirroring the mobile client's SpoonacularRecipe type so
// the UI can say where a record came from.
const (
	ProvenanceSpoonacular = "spoonacular"
	ProvenanceMock        = "mock"
)

// Recipe is the mapped shape every consumer uses. It mirrors the mobile
// client's SpoonacularRecipe interface field for field (see
// apps/mobile/src/features/meals/spoonacular-types.ts) so that wiring the
// GraphQL layer later is a copy, not a translation.
//
// PricePerServingUSD is Spoonacular's pricePerServing divided by 100, in
// dollars. Nil means Spoonacular had no price data, not that the recipe is
// free. ImageURL and ReadyInMinutes are nil when Spoonacular did not supply
// them, which the mobile client renders as its own fallbacks.
type Recipe struct {
	ID                  int          `json:"id"`
	Title               string       `json:"title"`
	ImageURL            *string      `json:"imageUrl"`
	ReadyInMinutes      *int         `json:"readyInMinutes"`
	Servings            int          `json:"servings"`
	PricePerServingUSD  *float64     `json:"pricePerServingUsd"`
	DishTypes           []string     `json:"dishTypes"`
	Cuisines            []string     `json:"cuisines"`
	Diets               []string     `json:"diets"`
	ExtendedIngredients []Ingredient `json:"extendedIngredients"`
	Instructions        *string      `json:"instructions"`
	Provenance          string       `json:"provenance"`
	// SourceURL is kept for attribution. omitempty keeps the mirrored shape
	// byte-identical when no source link was supplied.
	SourceURL string `json:"sourceUrl,omitempty"`
}

// Ingredient is one line of a recipe's extended ingredients list, mirroring
// the mobile client's SpoonacularIngredient.
type Ingredient struct {
	ID        int     `json:"id"`
	Original  string  `json:"original"`
	NameClean *string `json:"nameClean"`
	Amount    float64 `json:"amount"`
	Unit      string  `json:"unit"`
}

// SearchParams is what the mobile client sends when it wants recipe images
// and price-per-serving data for its recipe database views.
type SearchParams struct {
	Query string
	// Type filters to a Spoonacular meal type ("main course", "dessert", ...).
	// Empty means no filter.
	Type string
	// Diet filters to a diet ("vegetarian", "vegan", ...). Empty means no filter.
	Diet      string
	MaxResult int
}

// wireIngredient is one entry of /recipes/{id}/information's
// extendedIngredients array.
type wireIngredient struct {
	ID        int     `json:"id"`
	NameClean *string `json:"nameClean"`
	Amount    float64 `json:"amount"`
	Unit      string  `json:"unit"`
	Original  string  `json:"original"`
}

// wireRecipe is the /recipes/{id}/information payload. Only the fields Help
// The Hive uses are decoded; the rest are ignored so additive changes on
// their side do not break us.
type wireRecipe struct {
	ID              int              `json:"id"`
	Title           string           `json:"title"`
	Image           string           `json:"image"`
	ReadyInMinutes  int              `json:"readyInMinutes"`
	Servings        int              `json:"servings"`
	PricePerServing float64          `json:"pricePerServing"`
	DishTypes       []string         `json:"dishTypes"`
	Cuisines        []string         `json:"cuisines"`
	Diets           []string         `json:"diets"`
	Ingredients     []wireIngredient `json:"extendedIngredients"`
	Instructions    string           `json:"instructions"`
	SourceURL       string           `json:"sourceUrl"`
}

// wireSearchResponse is the /recipes/complexSearch payload. With
// addRecipeInformation=true each entry carries the full recipe fields, so
// one call serves the database grid without a follow-up per recipe.
type wireSearchResponse struct {
	Results []wireRecipe `json:"results"`
	Total   int          `json:"totalResults"`
}

// toRecipe maps one wire payload onto the consumer-facing type. It is the
// only path by which Spoonacular JSON becomes a Recipe.
func (w wireRecipe) toRecipe() Recipe {
	dishTypes := append([]string(nil), w.DishTypes...)
	cuisines := append([]string(nil), w.Cuisines...)
	diets := append([]string(nil), w.Diets...)

	ingredients := make([]Ingredient, 0, len(w.Ingredients))
	for _, in := range w.Ingredients {
		ingredients = append(ingredients, Ingredient{
			ID:        in.ID,
			Original:  in.Original,
			NameClean: in.NameClean,
			Amount:    in.Amount,
			Unit:      in.Unit,
		})
	}

	r := Recipe{
		ID:                  w.ID,
		Title:               w.Title,
		Servings:            w.Servings,
		DishTypes:           dishTypes,
		Cuisines:            cuisines,
		Diets:               diets,
		ExtendedIngredients: ingredients,
		Provenance:          ProvenanceSpoonacular,
		SourceURL:           w.SourceURL,
	}
	if w.Image != "" {
		image := w.Image
		r.ImageURL = &image
	}
	if w.ReadyInMinutes > 0 {
		minutes := w.ReadyInMinutes
		r.ReadyInMinutes = &minutes
	}
	if w.PricePerServing > 0 {
		usd := w.PricePerServing / 100
		r.PricePerServingUSD = &usd
	}
	if w.Instructions != "" {
		instructions := w.Instructions
		r.Instructions = &instructions
	}
	return r
}
