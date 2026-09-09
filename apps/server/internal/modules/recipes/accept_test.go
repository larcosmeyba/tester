package recipes

import (
	"context"
	"errors"
	"testing"

	"github.com/helpthehive/server/internal/domain/meals"
	"github.com/helpthehive/server/internal/modules/transcriber"
)

// A draft with the two gaps a video most often leaves: no serving count, and
// an ingredient nobody quantified.
func incompleteDraft() *transcriber.Draft {
	return &transcriber.Draft{
		Title:     "Dal",
		SourceURL: "https://youtu.be/abc",
		Ingredients: []transcriber.DraftIngredient{
			{Position: 1, RawText: "200g red lentils", DisplayName: str("red lentils"), Quantity: f64(200), Unit: str("g")},
			{Position: 2, RawText: "a splash of olive oil", DisplayName: str("olive oil")},
			{Position: 3, RawText: "salt to taste", DisplayName: str("salt"), IsToTaste: true},
		},
		Instructions:       []transcriber.DraftInstruction{{Step: 1, Text: "Simmer."}},
		MissingInformation: []string{"servings", "ingredient_quantities"},
	}
}

func succeededImport(t *testing.T, draft *transcriber.Draft) (*fakeRepo, *ImportService, meals.RecipeImport) {
	t.Helper()
	repo := newFakeRepo()
	extractor := &fakeExtractor{}
	svc := newTestService(repo, extractor)

	started, err := svc.Start(context.Background(), identityFor(viewer), "https://youtu.be/abc", "")
	if err != nil {
		t.Fatalf("Start: %v", err)
	}
	extractor.setJob(func() (transcriber.Job, error) {
		return transcriber.Job{ID: "job_1", Status: transcriber.StatusSucceeded, Draft: draft}, nil
	})
	imp, err := svc.Status(context.Background(), identityFor(viewer), started.ID)
	if err != nil {
		t.Fatalf("Status: %v", err)
	}
	return repo, svc, imp
}

func TestADraftStaysUnplannableUntilItsGapsAreClosed(t *testing.T) {
	_, _, imp := succeededImport(t, incompleteDraft())

	if imp.Draft.BaseMealPlanEligible {
		t.Fatal("a draft with no servings and an unquantified line was plannable")
	}
}

// The whole point of review: the person who chose the video supplies what the
// video never said, and the recipe becomes plannable.
func TestTheReviewerCanCloseTheGapsAtAcceptance(t *testing.T) {
	repo, svc, imp := succeededImport(t, incompleteDraft())

	recipe, err := svc.Accept(context.Background(), identityFor(viewer), imp.ID, AcceptPatch{
		Servings: f64(4),
		Ingredients: []IngredientPatch{
			{Position: 2, Quantity: f64(2), Unit: str("oz")},
		},
	})
	if err != nil {
		t.Fatalf("Accept: %v", err)
	}

	if recipe.Servings == nil || *recipe.Servings != 4 {
		t.Errorf("servings = %v, want 4", recipe.Servings)
	}
	// Stated by a person, so neither `source` nor `inferred`.
	if recipe.ServingsConfidence != "human" {
		t.Errorf("servingsConfidence = %q, want human", recipe.ServingsConfidence)
	}

	oil := recipe.Ingredients[1]
	if oil.Quantity == nil || *oil.Quantity != 2 {
		t.Errorf("quantity = %v, want 2", oil.Quantity)
	}
	if oil.MissingInformation != nil {
		t.Errorf("the closed gap still reads %q", *oil.MissingInformation)
	}
	// 2 oz is a mass, so grams follow by arithmetic.
	if oil.Grams == nil {
		t.Error("grams were not recomputed after the correction")
	}
	if !recipe.BaseMealPlanEligible {
		t.Errorf("recipe still unplannable; missing = %v", recipe.MissingInformation)
	}
	if len(recipe.MissingInformation) != 0 {
		t.Errorf("stale notes survived the fix: %v", recipe.MissingInformation)
	}
	if repo.upserts != 1 {
		t.Errorf("upserts = %d, want 1", repo.upserts)
	}
}

func TestAPartialFixLeavesTheRecipeUnplannable(t *testing.T) {
	_, svc, imp := succeededImport(t, incompleteDraft())

	// Servings supplied, but the oil is still unquantified.
	recipe, err := svc.Accept(context.Background(), identityFor(viewer), imp.ID, AcceptPatch{
		Servings: f64(4),
	})
	if err != nil {
		t.Fatalf("Accept: %v", err)
	}

	if recipe.BaseMealPlanEligible {
		t.Error("a recipe with an unquantified line was marked plannable")
	}
	if recipe.Servings == nil {
		t.Error("the supplied serving count was lost")
	}
}

func TestAcceptingWithoutCorrectionsKeepsTheDraftAsExtracted(t *testing.T) {
	_, svc, imp := succeededImport(t, incompleteDraft())

	recipe, err := svc.Accept(context.Background(), identityFor(viewer), imp.ID, AcceptPatch{})
	if err != nil {
		t.Fatalf("Accept: %v", err)
	}
	if recipe.Servings != nil {
		t.Error("a serving count appeared from nowhere")
	}
	if recipe.BaseMealPlanEligible {
		t.Error("an untouched incomplete draft became plannable")
	}
}

func TestAReviewerCanResolveAnUnknownIngredient(t *testing.T) {
	draft := incompleteDraft()
	draft.Ingredients[1].DisplayName = str("some obscure oil")

	_, svc, imp := succeededImport(t, draft)

	recipe, err := svc.Accept(context.Background(), identityFor(viewer), imp.ID, AcceptPatch{
		Servings: f64(2),
		Ingredients: []IngredientPatch{
			{Position: 2, Quantity: f64(1), Unit: str("oz"), IngredientID: str("ing_oil")},
		},
	})
	if err != nil {
		t.Fatalf("Accept: %v", err)
	}

	line := recipe.Ingredients[1]
	if line.IngredientID == nil || *line.IngredientID != "ing_oil" {
		t.Errorf("ingredientID = %v, want ing_oil", line.IngredientID)
	}
	if !recipe.BaseMealPlanEligible {
		t.Errorf("still unplannable; missing = %v", recipe.MissingInformation)
	}
}

// A reviewer may choose from the catalogue. They may not invent an entry in it.
func TestAReviewerCannotInventAnIngredient(t *testing.T) {
	_, svc, imp := succeededImport(t, incompleteDraft())

	_, err := svc.Accept(context.Background(), identityFor(viewer), imp.ID, AcceptPatch{
		Ingredients: []IngredientPatch{{Position: 2, IngredientID: str("ing_does_not_exist")}},
	})
	if !errors.Is(err, ErrUnknownIngredient) {
		t.Errorf("err = %v, want ErrUnknownIngredient", err)
	}
}

func TestCorrectionsMustFitTheDraft(t *testing.T) {
	_, svc, imp := succeededImport(t, incompleteDraft())
	identity := identityFor(viewer)

	cases := map[string]AcceptPatch{
		"a line that does not exist": {Ingredients: []IngredientPatch{{Position: 99, Quantity: f64(1)}}},
		"a negative quantity":        {Ingredients: []IngredientPatch{{Position: 2, Quantity: f64(-5)}}},
		"zero servings":              {Servings: f64(0)},
	}
	for name, patch := range cases {
		if _, err := svc.Accept(context.Background(), identity, imp.ID, patch); !errors.Is(err, ErrInvalidPatch) {
			t.Errorf("%s: err = %v, want ErrInvalidPatch", name, err)
		}
	}
}

func TestAFailedCorrectionSavesNothing(t *testing.T) {
	repo, svc, imp := succeededImport(t, incompleteDraft())

	svc.Accept(context.Background(), identityFor(viewer), imp.ID, AcceptPatch{
		Ingredients: []IngredientPatch{{Position: 99, Quantity: f64(1)}},
	})

	if repo.upserts != 0 {
		t.Error("a rejected correction still wrote a recipe")
	}
	if stored := repo.snapshot(imp.ID); stored.RecipeID != nil {
		t.Error("a rejected correction linked a recipe")
	}
}

// Corrections must not become a second way to author a recipe.
func TestCorrectionsCannotChangeOwnershipOrVisibility(t *testing.T) {
	_, svc, imp := succeededImport(t, incompleteDraft())

	recipe, err := svc.Accept(context.Background(), identityFor(viewer), imp.ID, AcceptPatch{Servings: f64(4)})
	if err != nil {
		t.Fatalf("Accept: %v", err)
	}
	if recipe.Visibility != "private" || recipe.ReviewStatus != "draft" {
		t.Errorf("visibility/reviewStatus = %q/%q", recipe.Visibility, recipe.ReviewStatus)
	}
	if recipe.OwnerUserID == nil || *recipe.OwnerUserID != viewer {
		t.Errorf("ownerUserID = %v", recipe.OwnerUserID)
	}
	if recipe.SourceType != "video_import" {
		t.Errorf("sourceType = %q", recipe.SourceType)
	}
}

func TestCorrectedAcceptanceIsStillIdempotent(t *testing.T) {
	repo, svc, imp := succeededImport(t, incompleteDraft())
	patch := AcceptPatch{Servings: f64(4), Ingredients: []IngredientPatch{{Position: 2, Quantity: f64(2), Unit: str("oz")}}}

	first, err := svc.Accept(context.Background(), identityFor(viewer), imp.ID, patch)
	if err != nil {
		t.Fatalf("first Accept: %v", err)
	}
	second, err := svc.Accept(context.Background(), identityFor(viewer), imp.ID, patch)
	if err != nil {
		t.Fatalf("second Accept: %v", err)
	}

	if first.ID != second.ID {
		t.Errorf("two recipes: %q and %q", first.ID, second.ID)
	}
	if len(repo.recipes) != 1 {
		t.Errorf("recipes stored = %d, want 1", len(repo.recipes))
	}
}

// Nothing a reviewer does may reach another user's import.
func TestCorrectionsCannotReachAnotherUsersImport(t *testing.T) {
	_, svc, imp := succeededImport(t, incompleteDraft())

	_, err := svc.Accept(context.Background(), identityFor("user_2"), imp.ID, AcceptPatch{Servings: f64(4)})
	if !errors.Is(err, meals.ErrNotFound) {
		t.Errorf("err = %v, want ErrNotFound", err)
	}
}
