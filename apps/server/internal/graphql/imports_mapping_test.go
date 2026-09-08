package graphql

import (
	"errors"
	"testing"
	"time"

	"github.com/helpthehive/server/internal/domain/meals"
	"github.com/helpthehive/server/internal/graphql/model"
	"github.com/helpthehive/server/internal/modules/recipes"
	"github.com/vektah/gqlparser/v2/gqlerror"
)

func draftRecipe() meals.Recipe {
	owner := "user_1"
	quantity := 200.0
	unit := "g"
	note := "The video never stated a quantity for this ingredient."
	return meals.Recipe{
		ID:                 "recipe_1",
		OwnerUserID:        &owner,
		Title:              "Dal",
		SourceType:         "video_import",
		Visibility:         "private",
		ReviewStatus:       "draft",
		ServingsConfidence: "missing",
		TimeConfidence:     "missing",
		MealTypes:          []string{},
		EquipmentRequired:  []string{},
		Tags:               []string{},
		Ingredients: []meals.RecipeIngredient{
			{Position: 1, RawText: "200g lentils", Quantity: &quantity, Unit: &unit},
			{Position: 2, RawText: "salt to taste", IsToTaste: true},
			{Position: 3, RawText: "a splash of oil", MissingInformation: &note},
		},
		Instructions:         []meals.RecipeInstruction{{Step: 1, Text: "Simmer."}},
		BaseMealPlanEligible: false,
		MissingInformation:   []string{"ingredient_quantities", "servings"},
	}
}

func TestRecipeImportModelRendersTheDraftAsAnOrdinaryRecipe(t *testing.T) {
	draft := draftRecipe()
	completed := time.Date(2026, 9, 8, 12, 0, 0, 0, time.UTC)

	out := recipeImportModel(meals.RecipeImport{
		ID:             "import_1",
		SourceURL:      "https://youtu.be/abc",
		SourcePlatform: "youtube",
		Status:         meals.ImportStatusSucceeded,
		Draft:          &draft,
		CreatedAt:      time.Date(2026, 9, 8, 11, 0, 0, 0, time.UTC),
		CompletedAt:    &completed,
	})

	if out.Status != model.RecipeImportStatusSucceeded {
		t.Errorf("status = %q", out.Status)
	}
	if out.Draft == nil {
		t.Fatal("a succeeded import rendered no draft")
	}

	// The draft goes through the same recipeModel as any other recipe, so the
	// rules cannot drift between an imported recipe and a library one.
	if out.Draft.BaseMealPlanEligible {
		t.Error("an incomplete draft rendered as plannable")
	}
	if len(out.Draft.MissingInformation) != 2 {
		t.Errorf("missingInformation = %v", out.Draft.MissingInformation)
	}
	if out.Draft.Ingredients[1].MissingInformation != nil {
		t.Error("\"to taste\" rendered as missing information")
	}
	if out.Draft.Ingredients[2].Quantity != nil {
		t.Error("a quantity was rendered where the video stated none")
	}
	if out.Draft.Nutrition != nil {
		t.Error("nutrition rendered for a recipe that states none")
	}
	if out.CompletedAt == nil {
		t.Error("completedAt was dropped")
	}
}

func TestRecipeImportModelOmitsAnAbsentDraft(t *testing.T) {
	code, message := "VIDEO_UNAVAILABLE", "That video is private."

	out := recipeImportModel(meals.RecipeImport{
		ID:           "import_1",
		Status:       meals.ImportStatusFailed,
		ErrorCode:    &code,
		ErrorMessage: &message,
		CreatedAt:    time.Now(),
	})

	if out.Draft != nil {
		t.Error("a failed import rendered a draft")
	}
	if out.CompletedAt != nil {
		t.Error("completedAt rendered for an import that never completed")
	}
	if out.ErrorCode == nil || *out.ErrorCode != "VIDEO_UNAVAILABLE" {
		t.Errorf("errorCode = %v", out.ErrorCode)
	}
}

func TestRecipeImportModelsMapsEveryStatus(t *testing.T) {
	statuses := []string{
		meals.ImportStatusQueued, meals.ImportStatusRunning, meals.ImportStatusSucceeded,
		meals.ImportStatusFailed, meals.ImportStatusCancelled,
	}
	imports := make([]meals.RecipeImport, 0, len(statuses))
	for _, status := range statuses {
		imports = append(imports, meals.RecipeImport{ID: status, Status: status, CreatedAt: time.Now()})
	}

	out := recipeImportModels(imports)

	if len(out) != len(statuses) {
		t.Fatalf("mapped %d imports, want %d", len(out), len(statuses))
	}
	for i, status := range statuses {
		if string(out[i].Status) != status {
			t.Errorf("status[%d] = %q, want %q", i, out[i].Status, status)
		}
	}
}

func TestImportErrorGivesEachFailureItsOwnCode(t *testing.T) {
	cases := map[error]string{
		recipes.ErrImportUnavailable:  "IMPORT_UNAVAILABLE",
		recipes.ErrInvalidSourceURL:   "INVALID_SOURCE_URL",
		recipes.ErrImportInProgress:   "IMPORT_IN_PROGRESS",
		recipes.ErrImportNotSucceeded: "IMPORT_NOT_READY",
		meals.ErrNotFound:             "NOT_FOUND",
	}

	for err, wantCode := range cases {
		var gqlErr *gqlerror.Error
		if !errors.As(importError(err), &gqlErr) {
			t.Errorf("%v did not map to a gqlerror", err)
			continue
		}
		if got := gqlErr.Extensions["code"]; got != wantCode {
			t.Errorf("%v mapped to code %v, want %q", err, got, wantCode)
		}
	}
}

func TestImportErrorPassesNilThrough(t *testing.T) {
	if importError(nil) != nil {
		t.Error("nil became an error")
	}
}

// A wrapped error must still be recognised: services return errors from deeper
// calls, and a code that only works on the exact sentinel is a code that stops
// working the first time somebody adds context.
func TestImportErrorSeesThroughWrapping(t *testing.T) {
	wrapped := errors.Join(errors.New("while starting import"), recipes.ErrImportInProgress)

	var gqlErr *gqlerror.Error
	if !errors.As(importError(wrapped), &gqlErr) {
		t.Fatal("wrapped error did not map to a gqlerror")
	}
	if gqlErr.Extensions["code"] != "IMPORT_IN_PROGRESS" {
		t.Errorf("code = %v", gqlErr.Extensions["code"])
	}
}
