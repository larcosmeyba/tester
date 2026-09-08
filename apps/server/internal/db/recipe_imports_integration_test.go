package db

import (
	"context"
	"errors"
	"fmt"
	"os"
	"testing"
	"time"

	"github.com/helpthehive/server/internal/domain/meals"
	"github.com/jackc/pgx/v5"
)

// These tests prove two things about recipe_imports that only real SQL can
// show: that an import is invisible to anybody but its owner, and that the
// status guards in the UPDATE statements actually hold — a cancel racing a
// completion, or a second import of the same video, must lose in the database
// rather than in Go.
func TestRecipeImportsIntegration(t *testing.T) {
	databaseURL := os.Getenv("TEST_DATABASE_URL")
	if databaseURL == "" {
		t.Skip("TEST_DATABASE_URL is not set")
	}

	ctx := context.Background()
	runMigrations(t, databaseURL)

	pool, err := Connect(ctx, databaseURL)
	if err != nil {
		t.Fatalf("Connect() error = %v", err)
	}
	defer pool.Close()
	store := NewStore(pool)

	stamp := time.Now().UnixNano()
	viewerA, err := store.EnsureViewer(ctx, fmt.Sprintf("import-user-a-%d", stamp), stringPtr("a@example.com"))
	if err != nil {
		t.Fatalf("EnsureViewer(A) error = %v", err)
	}
	viewerB, err := store.EnsureViewer(ctx, fmt.Sprintf("import-user-b-%d", stamp), stringPtr("b@example.com"))
	if err != nil {
		t.Fatalf("EnsureViewer(B) error = %v", err)
	}
	userA, userB := viewerA.User.ID, viewerB.User.ID
	sourceURL := fmt.Sprintf("https://youtu.be/test-%d", stamp)

	newImport := func(user string, url string) meals.RecipeImport {
		return meals.RecipeImport{
			ID: NewID(), UserID: user, SourceURL: url,
			SourcePlatform: "youtube", AttemptCount: 1,
		}
	}

	// --- created queued ---------------------------------------------------
	created, err := store.CreateRecipeImport(ctx, newImport(userA, sourceURL))
	if err != nil {
		t.Fatalf("CreateRecipeImport() error = %v", err)
	}
	if created.Status != meals.ImportStatusQueued {
		t.Errorf("status = %q, want queued", created.Status)
	}
	if created.CreatedAt.IsZero() || created.UpdatedAt.IsZero() {
		t.Error("timestamps were not defaulted")
	}
	if created.Language != "english" {
		t.Errorf("language = %q, want the english default", created.Language)
	}

	// --- one live import per video ----------------------------------------
	if _, err := store.CreateRecipeImport(ctx, newImport(userA, sourceURL)); !errors.Is(err, ErrImportInProgress) {
		t.Errorf("second live import error = %v, want ErrImportInProgress", err)
	}
	// Another user importing the same video is not a duplicate: the index is
	// scoped to the user, so one person's import cannot block another's.
	othersImport, err := store.CreateRecipeImport(ctx, newImport(userB, sourceURL))
	if err != nil {
		t.Fatalf("CreateRecipeImport(B, same url) error = %v", err)
	}

	// --- cross-user invisibility ------------------------------------------
	if _, err := store.GetRecipeImport(ctx, userB, created.ID); !errors.Is(err, pgx.ErrNoRows) {
		t.Errorf("B read A's import: err = %v, want ErrNoRows", err)
	}
	listB, err := store.ListRecipeImports(ctx, userB, 50)
	if err != nil {
		t.Fatalf("ListRecipeImports(B) error = %v", err)
	}
	for _, imp := range listB {
		if imp.UserID != userB {
			t.Fatalf("B's list contained an import owned by %q", imp.UserID)
		}
	}

	// --- queued -> running -------------------------------------------------
	running, err := store.StartRecipeImport(ctx, created.ID, "job_1")
	if err != nil {
		t.Fatalf("StartRecipeImport() error = %v", err)
	}
	if running.Status != meals.ImportStatusRunning || running.ProviderJobID == nil {
		t.Fatalf("import = %+v", running)
	}
	if running.StartedAt == nil {
		t.Error("startedAt was not set")
	}
	// Starting twice must not move a running import back.
	if _, err := store.StartRecipeImport(ctx, created.ID, "job_2"); !errors.Is(err, pgx.ErrNoRows) {
		t.Errorf("second StartRecipeImport error = %v, want ErrNoRows", err)
	}

	// --- running -> succeeded, and the draft round-trips through JSONB -----
	draft := draftForImport(userA, fmt.Sprintf("draft-recipe-%d", stamp))
	succeeded, err := store.CompleteRecipeImport(ctx, created.ID, draft)
	if err != nil {
		t.Fatalf("CompleteRecipeImport() error = %v", err)
	}
	if succeeded.Status != meals.ImportStatusSucceeded || succeeded.CompletedAt == nil {
		t.Fatalf("import = %+v", succeeded)
	}

	stored := succeeded.Draft
	if stored == nil {
		t.Fatal("the draft did not survive storage")
	}
	if stored.BaseMealPlanEligible {
		t.Error("an incomplete draft came back plannable")
	}
	if len(stored.MissingInformation) != 1 || stored.MissingInformation[0] != "ingredient_quantities" {
		t.Errorf("missingInformation = %v", stored.MissingInformation)
	}
	if len(stored.Ingredients) != 3 {
		t.Fatalf("ingredients = %d, want 3", len(stored.Ingredients))
	}
	if stored.Ingredients[0].Quantity == nil || *stored.Ingredients[0].Quantity != 200 {
		t.Error("a stated quantity was lost")
	}
	if !stored.Ingredients[1].IsToTaste || stored.Ingredients[1].MissingInformation != nil {
		t.Error("\"to taste\" did not survive as complete")
	}
	if stored.Ingredients[2].Quantity != nil || stored.Ingredients[2].MissingInformation == nil {
		t.Error("an unstated quantity did not survive as missing")
	}
	for _, line := range stored.Ingredients {
		if line.IngredientID != nil || line.Grams != nil {
			t.Error("ingredient identity or grams came back set")
		}
	}
	if stored.CaloriesKcal != nil || stored.NutritionBasis != nil {
		t.Error("nutrition appeared from a draft that had none")
	}

	// --- a settled import is not cancellable ------------------------------
	if _, err := store.CancelRecipeImport(ctx, userA, created.ID); !errors.Is(err, pgx.ErrNoRows) {
		t.Errorf("cancelling a settled import: err = %v, want ErrNoRows", err)
	}

	// --- linking the accepted recipe --------------------------------------
	ingredientID := fmt.Sprintf("import-rice-%d", stamp)
	if err := store.UpsertIngredient(ctx, meals.Ingredient{
		ID: ingredientID, DisplayName: "Rice", Aisle: "pantry",
		FoodGroup: "grain", PriceReferenceUnit: "lb",
	}); err != nil {
		t.Fatalf("UpsertIngredient() error = %v", err)
	}
	if err := store.UpsertRecipe(ctx, testRecipe(draft.ID, &userA, "private", "draft", ingredientID)); err != nil {
		t.Fatalf("UpsertRecipe() error = %v", err)
	}

	linked, err := store.LinkRecipeImportRecipe(ctx, userA, created.ID, draft.ID)
	if err != nil {
		t.Fatalf("LinkRecipeImportRecipe() error = %v", err)
	}
	if linked.RecipeID == nil || *linked.RecipeID != draft.ID {
		t.Errorf("recipeID = %v, want %q", linked.RecipeID, draft.ID)
	}
	// Idempotent: accepting twice writes the same id.
	again, err := store.LinkRecipeImportRecipe(ctx, userA, created.ID, draft.ID)
	if err != nil {
		t.Fatalf("second LinkRecipeImportRecipe() error = %v", err)
	}
	if again.RecipeID == nil || *again.RecipeID != draft.ID {
		t.Errorf("second link produced %v", again.RecipeID)
	}
	// And it is not somebody else's to link.
	if _, err := store.LinkRecipeImportRecipe(ctx, userB, created.ID, draft.ID); !errors.Is(err, pgx.ErrNoRows) {
		t.Errorf("B linked A's import: err = %v, want ErrNoRows", err)
	}

	// --- a settled import frees the video for another attempt -------------
	retry, err := store.CreateRecipeImport(ctx, newImport(userA, sourceURL))
	if err != nil {
		t.Fatalf("re-importing a settled video error = %v", err)
	}

	// --- cancellation ------------------------------------------------------
	cancelled, err := store.CancelRecipeImport(ctx, userA, retry.ID)
	if err != nil {
		t.Fatalf("CancelRecipeImport() error = %v", err)
	}
	if cancelled.Status != meals.ImportStatusCancelled {
		t.Errorf("status = %q, want cancelled", cancelled.Status)
	}

	// --- failure -----------------------------------------------------------
	failing, err := store.CreateRecipeImport(ctx, newImport(userA, sourceURL+"-2"))
	if err != nil {
		t.Fatalf("CreateRecipeImport(failing) error = %v", err)
	}
	failed, err := store.FailRecipeImport(ctx, failing.ID, "VIDEO_UNAVAILABLE", "That video is private.")
	if err != nil {
		t.Fatalf("FailRecipeImport() error = %v", err)
	}
	if failed.Status != meals.ImportStatusFailed {
		t.Errorf("status = %q, want failed", failed.Status)
	}
	if failed.ErrorCode == nil || *failed.ErrorCode != "VIDEO_UNAVAILABLE" {
		t.Errorf("errorCode = %v", failed.ErrorCode)
	}
	if failed.CompletedAt == nil {
		t.Error("completedAt was not set on failure")
	}

	// --- newest first ------------------------------------------------------
	listA, err := store.ListRecipeImports(ctx, userA, 50)
	if err != nil {
		t.Fatalf("ListRecipeImports(A) error = %v", err)
	}
	if len(listA) < 3 {
		t.Fatalf("A has %d imports, want at least 3", len(listA))
	}
	for i := 1; i < len(listA); i++ {
		if listA[i].CreatedAt.After(listA[i-1].CreatedAt) {
			t.Error("imports were not returned newest first")
			break
		}
	}
	for _, imp := range listA {
		if imp.ID == othersImport.ID {
			t.Fatal("A's list contained B's import")
		}
	}

	// B's import is untouched by everything done to A's.
	stillQueued, err := store.GetRecipeImport(ctx, userB, othersImport.ID)
	if err != nil {
		t.Fatalf("GetRecipeImport(B) error = %v", err)
	}
	if stillQueued.Status != meals.ImportStatusQueued {
		t.Errorf("B's import status = %q, want queued", stillQueued.Status)
	}

	// --- rate limiting counts only this user, only in the window ----------
	countA, err := store.CountRecipeImportsSince(ctx, userA, time.Now().Add(-time.Hour))
	if err != nil {
		t.Fatalf("CountRecipeImportsSince() error = %v", err)
	}
	if countA < 3 {
		t.Errorf("A's recent imports = %d, want at least 3", countA)
	}
	future, err := store.CountRecipeImportsSince(ctx, userA, time.Now().Add(time.Hour))
	if err != nil {
		t.Fatalf("CountRecipeImportsSince(future) error = %v", err)
	}
	if future != 0 {
		t.Errorf("imports after a future cutoff = %d, want 0", future)
	}

	// --- the worker claims quiet imports, and claims them once ------------
	pending, err := store.CreateRecipeImport(ctx, newImport(userA, sourceURL+"-worker"))
	if err != nil {
		t.Fatalf("CreateRecipeImport(pending) error = %v", err)
	}

	claimed, err := store.ClaimStaleRecipeImports(ctx, time.Now().Add(time.Minute), 10)
	if err != nil {
		t.Fatalf("ClaimStaleRecipeImports() error = %v", err)
	}
	var found bool
	for _, imp := range claimed {
		if imp.ID == pending.ID {
			found = true
		}
		if imp.Settled() {
			t.Errorf("a settled import was claimed: %s (%s)", imp.ID, imp.Status)
		}
	}
	if !found {
		t.Error("a quiet queued import was not claimed")
	}

	// Claiming bumps updated_at, so an immediately following sweep for rows
	// quiet since before that moment must not see it again.
	secondSweep, err := store.ClaimStaleRecipeImports(ctx, time.Now().Add(-time.Minute), 10)
	if err != nil {
		t.Fatalf("second ClaimStaleRecipeImports() error = %v", err)
	}
	for _, imp := range secondSweep {
		if imp.ID == pending.ID {
			t.Error("a just-claimed import was claimed again by an overlapping sweep")
		}
	}

	// --- retries spend the budget, and stop at it -------------------------
	retried, err := store.RetryRecipeImport(ctx, pending.ID, 3)
	if err != nil {
		t.Fatalf("RetryRecipeImport() error = %v", err)
	}
	if retried.AttemptCount != 2 {
		t.Errorf("attemptCount = %d, want 2", retried.AttemptCount)
	}
	if retried.Status != meals.ImportStatusQueued || retried.ProviderJobID != nil {
		t.Errorf("retried import = %+v", retried)
	}
	if _, err := store.RetryRecipeImport(ctx, pending.ID, 2); !errors.Is(err, pgx.ErrNoRows) {
		t.Errorf("retry past the budget: err = %v, want ErrNoRows", err)
	}

	// A settled import is never retried.
	if _, err := store.RetryRecipeImport(ctx, created.ID, 5); !errors.Is(err, pgx.ErrNoRows) {
		t.Errorf("retrying a settled import: err = %v, want ErrNoRows", err)
	}
}

// draftForImport is a draft as the import service stores one: a stated
// quantity, a to-taste line, and a line the video never quantified.
func draftForImport(ownerUserID string, recipeID string) meals.Recipe {
	owner := ownerUserID
	quantity := 200.0
	unit := "g"
	note := "The video never stated a quantity for this ingredient."
	sourceURL := "https://youtu.be/abc"

	return meals.Recipe{
		ID:                 recipeID,
		OwnerUserID:        &owner,
		Title:              "Weeknight Dal",
		SourceType:         "video_import",
		SourceURL:          &sourceURL,
		Visibility:         "private",
		ReviewStatus:       "draft",
		ServingsConfidence: "missing",
		TimeConfidence:     "missing",
		Scalable:           true,
		MealTypes:          []string{"dinner"},
		EquipmentRequired:  []string{"stovetop"},
		Tags:               []string{},
		Ingredients: []meals.RecipeIngredient{
			{Position: 1, RawText: "200g red lentils", Quantity: &quantity, Unit: &unit},
			{Position: 2, RawText: "salt to taste", IsToTaste: true},
			{Position: 3, RawText: "a splash of oil", MissingInformation: &note},
		},
		Instructions:         []meals.RecipeInstruction{{Step: 1, Text: "Simmer the lentils."}},
		BaseMealPlanEligible: false,
		MissingInformation:   []string{"ingredient_quantities"},
	}
}
