package transcriber

import (
	"strings"

	"github.com/helpthehive/server/internal/domain/meals"
)

// Status values the extraction service reports.
const (
	StatusQueued    = "queued"
	StatusRunning   = "running"
	StatusSucceeded = "succeeded"
	StatusFailed    = "failed"
)

// StartRequest asks for an extraction. OwnerUserID is passed for the service's
// logs only: it has no user table, and nothing it returns is trusted to say
// who an import belongs to. Ownership is the server's, decided from the JWT.
type StartRequest struct {
	URL         string `json:"url"`
	Language    string `json:"language,omitempty"`
	OwnerUserID string `json:"ownerUserId,omitempty"`
}

// Job is the extraction service's view of one import. It is a report, never
// a source of truth — see the package comment.
type Job struct {
	ID     string        `json:"importId"`
	Status string        `json:"status"`
	URL    string        `json:"url"`
	Stage  *string       `json:"stage"`
	Draft  *Draft        `json:"recipe"`
	Error  *ServiceError `json:"-"`

	// The service reports its error as an object; ServiceError has no tags of
	// its own so that the wire shape stays confined to this file.
	RawError *struct {
		Code    string `json:"code"`
		Message string `json:"message"`
		Detail  string `json:"detail"`
	} `json:"error"`
}

// Done reports whether the job has settled and will not change again.
func (j Job) Done() bool {
	return j.Status == StatusSucceeded || j.Status == StatusFailed
}

// Failure returns the job's error, or nil.
func (j Job) Failure() *ServiceError {
	if j.RawError == nil {
		return nil
	}
	return &ServiceError{
		Code:    j.RawError.Code,
		Message: j.RawError.Message,
		Detail:  j.RawError.Detail,
	}
}

// Draft is the extraction service's wire representation of a recipe.
//
// It exists so that the service's JSON never reaches the rest of the server,
// and so that a change to its shape is a change to one file. It is not a
// second Standard HTH Recipe Object: it has no authority, and ToRecipe is the
// only way anything here becomes a recipe.
type Draft struct {
	Title              string             `json:"title"`
	Description        *string            `json:"description"`
	SourceType         string             `json:"sourceType"`
	SourceURL          string             `json:"sourceUrl"`
	SourceName         *string            `json:"sourceName"`
	LicenseID          *string            `json:"licenseId"`
	AttributionText    *string            `json:"attributionText"`
	Servings           *float64           `json:"servings"`
	ServingsConfidence string             `json:"servingsConfidence"`
	ServingSizeText    *string            `json:"servingSizeText"`
	Scalable           bool               `json:"scalable"`
	PrepTimeMinutes    *int               `json:"prepTimeMinutes"`
	CookTimeMinutes    *int               `json:"cookTimeMinutes"`
	TotalTimeMinutes   *int               `json:"totalTimeMinutes"`
	TimeConfidence     string             `json:"timeConfidence"`
	MealTypes          []string           `json:"mealTypes"`
	Cuisine            *string            `json:"cuisine"`
	Difficulty         *int               `json:"difficulty"`
	EquipmentRequired  []string           `json:"equipmentRequired"`
	Tags               []string           `json:"tags"`
	Ingredients        []DraftIngredient  `json:"ingredients"`
	Instructions       []DraftInstruction `json:"instructions"`
	Nutrition          *DraftNutrition    `json:"nutrition"`
	MissingInformation []string           `json:"missingInformation"`
	Provenance         *DraftProvenance   `json:"provenance"`
}

type DraftIngredient struct {
	Position           int      `json:"position"`
	RawText            string   `json:"rawText"`
	DisplayName        *string  `json:"displayName"`
	Quantity           *float64 `json:"quantity"`
	Unit               *string  `json:"unit"`
	Preparation        *string  `json:"preparation"`
	IsOptional         bool     `json:"isOptional"`
	IsToTaste          bool     `json:"isToTaste"`
	MissingInformation *string  `json:"missingInformation"`
}

type DraftInstruction struct {
	Step    int    `json:"step"`
	Text    string `json:"text"`
	Minutes *int   `json:"minutes"`
}

// DraftNutrition is only ever populated when the source stated nutrition.
// Nothing estimates it — not the extraction service, and not this package.
type DraftNutrition struct {
	Basis        string   `json:"basis"`
	PerServing   bool     `json:"perServing"`
	CaloriesKcal *float64 `json:"caloriesKcal"`
	ProteinG     *float64 `json:"proteinG"`
	CarbsG       *float64 `json:"carbsG"`
	FatG         *float64 `json:"fatG"`
	FiberG       *float64 `json:"fiberG"`
	SodiumMg     *float64 `json:"sodiumMg"`
	Confidence   *string  `json:"confidence"`
}

// DraftProvenance records where a recipe came from and how the words were
// obtained. It is kept with the import record so an import can be audited and
// a takedown request answered, and is not part of the recipe.
type DraftProvenance struct {
	Platform         string  `json:"platform"`
	VideoID          *string `json:"videoId"`
	CanonicalURL     string  `json:"canonicalUrl"`
	Channel          *string `json:"channel"`
	ChannelURL       *string `json:"channelUrl"`
	PublishedAt      *string `json:"publishedAt"`
	DurationSeconds  *int    `json:"durationSeconds"`
	TranscriptSource string  `json:"transcriptSource"`
	TranscriptLang   *string `json:"transcriptLanguage"`
	UsedDescription  bool    `json:"usedDescription"`
	Model            *string `json:"model"`
	ExtractedAt      string  `json:"extractedAt"`
}

// Values a caller may never choose. An import is a proposal to the person who
// asked for it: never library content, never public, never anything but an
// import.
const (
	forcedSourceType   = "video_import"
	forcedVisibility   = "private"
	forcedReviewStatus = "draft"
)

// ToRecipe converts a draft into the Standard HTH Recipe Object.
//
// recipeID is minted by the server before the draft is stored, so a draft can
// be referred to before it is saved and so accepting it twice updates one
// recipe rather than creating two.
//
// Three things are deliberately not carried across:
//
//   - IngredientID and Grams stay nil. Resolving an ingredient line to the
//     catalogue, and knowing what a cup of it weighs, needs the ingredients
//     table. That is the server's and is done after this.
//   - Nutrition is copied only when the source stated it. Never estimated.
//   - BaseMealPlanEligible is recomputed rather than trusted, and is only ever
//     narrowed here. The server widens it, if at all, after ingredient
//     resolution — a line this could not quantify may become quantifiable once
//     matched, and only the server can know that.
func (d Draft) ToRecipe(recipeID string, ownerUserID string) meals.Recipe {
	owner := ownerUserID

	recipe := meals.Recipe{
		ID:                 recipeID,
		OwnerUserID:        &owner,
		Title:              strings.TrimSpace(d.Title),
		Description:        d.Description,
		SourceType:         forcedSourceType,
		SourceURL:          nonEmpty(d.SourceURL),
		SourceName:         d.SourceName,
		LicenseID:          d.LicenseID,
		AttributionText:    d.AttributionText,
		Visibility:         forcedVisibility,
		ReviewStatus:       forcedReviewStatus,
		Servings:           d.Servings,
		ServingsConfidence: confidenceOr(d.ServingsConfidence, d.Servings != nil),
		ServingSizeText:    d.ServingSizeText,
		Scalable:           d.Scalable,
		PrepTimeMinutes:    d.PrepTimeMinutes,
		CookTimeMinutes:    d.CookTimeMinutes,
		TotalTimeMinutes:   d.TotalTimeMinutes,
		TimeConfidence:     confidenceOr(d.TimeConfidence, d.TotalTimeMinutes != nil),
		MealTypes:          orEmpty(d.MealTypes),
		Cuisine:            d.Cuisine,
		Difficulty:         d.Difficulty,
		EquipmentRequired:  orEmpty(d.EquipmentRequired),
		IsComponent:        false,
		Tags:               orEmpty(d.Tags),
		MissingInformation: orEmpty(d.MissingInformation),
	}

	recipe.Ingredients = make([]meals.RecipeIngredient, 0, len(d.Ingredients))
	for i, line := range d.Ingredients {
		position := line.Position
		if position <= 0 {
			position = i + 1
		}
		recipe.Ingredients = append(recipe.Ingredients, meals.RecipeIngredient{
			RecipeID:    recipeID,
			Position:    position,
			RawText:     line.RawText,
			DisplayName: line.DisplayName,
			Quantity:    line.Quantity,
			Unit:        line.Unit,
			Preparation: line.Preparation,
			// Owned by Help The Hive; see the doc comment.
			IngredientID:       nil,
			Grams:              nil,
			IsOptional:         line.IsOptional,
			IsToTaste:          line.IsToTaste,
			MissingInformation: line.MissingInformation,
		})
	}

	recipe.Instructions = make([]meals.RecipeInstruction, 0, len(d.Instructions))
	for i, step := range d.Instructions {
		number := step.Step
		if number <= 0 {
			number = i + 1
		}
		recipe.Instructions = append(recipe.Instructions, meals.RecipeInstruction{
			RecipeID: recipeID,
			Step:     number,
			Text:     step.Text,
			Minutes:  step.Minutes,
		})
	}

	if n := d.Nutrition; n != nil {
		basis := n.Basis
		recipe.NutritionBasis = &basis
		recipe.NutritionConfidence = n.Confidence
		recipe.CaloriesKcal = n.CaloriesKcal
		recipe.ProteinG = n.ProteinG
		recipe.CarbsG = n.CarbsG
		recipe.FatG = n.FatG
		recipe.FiberG = n.FiberG
		recipe.SodiumMg = n.SodiumMg
	}

	recipe.BaseMealPlanEligible = len(recipe.MissingInformation) == 0

	return recipe
}

// confidenceOr keeps the service's word when it gave one, and otherwise
// derives it from whether the value is actually there. "missing" is never
// upgraded to a confidence the source did not establish.
func confidenceOr(stated string, present bool) string {
	switch stated {
	case "source", "human", "inferred", "missing":
		return stated
	}
	if present {
		return "source"
	}
	return "missing"
}

func nonEmpty(value string) *string {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return nil
	}
	return &trimmed
}

func orEmpty(values []string) []string {
	if values == nil {
		return []string{}
	}
	return values
}
