package recipes

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/helpthehive/server/internal/domain/meals"
	"github.com/helpthehive/server/internal/modules/transcriber"
)

func failedJob(code, message string) transcriber.Job {
	return transcriber.Job{
		ID:     "job_1",
		Status: transcriber.StatusFailed,
		RawError: &struct {
			Code    string `json:"code"`
			Message string `json:"message"`
			Detail  string `json:"detail"`
		}{Code: code, Message: message},
	}
}

// --- retries ---------------------------------------------------------------

func TestATransientFailureIsRetried(t *testing.T) {
	repo := newFakeRepo()
	extractor := &fakeExtractor{}
	svc := newTestService(repo, extractor)

	started, _ := svc.Start(context.Background(), identityFor(viewer), "https://youtu.be/abc", "")
	extractor.job = func() (transcriber.Job, error) {
		return failedJob("PROVIDER_ERROR", "The extractor fell over."), nil
	}

	imp, err := svc.Status(context.Background(), identityFor(viewer), started.ID)
	if err != nil {
		t.Fatalf("Status: %v", err)
	}

	if imp.Status != meals.ImportStatusQueued {
		t.Errorf("status = %q, want queued for another attempt", imp.Status)
	}
	if imp.AttemptCount != 2 {
		t.Errorf("attemptCount = %d, want 2", imp.AttemptCount)
	}
	if imp.ProviderJobID != nil {
		t.Error("the dead job id was kept")
	}
	if imp.ErrorCode != nil {
		t.Error("a requeued import still carries an error")
	}
}

// A private video is still private on the second attempt; retrying only spends
// another transcription to learn the same thing.
func TestPermanentFailuresAreNotRetried(t *testing.T) {
	for _, code := range []string{
		"UNSUPPORTED_SOURCE", "VIDEO_UNAVAILABLE", "VIDEO_TOO_LONG",
		"NO_TRANSCRIPT", "NO_RECIPE_FOUND",
	} {
		repo := newFakeRepo()
		extractor := &fakeExtractor{}
		svc := newTestService(repo, extractor)

		started, _ := svc.Start(context.Background(), identityFor(viewer), "https://youtu.be/"+code, "")
		extractor.job = func() (transcriber.Job, error) { return failedJob(code, "nope"), nil }

		imp, err := svc.Status(context.Background(), identityFor(viewer), started.ID)
		if err != nil {
			t.Fatalf("%s Status: %v", code, err)
		}
		if imp.Status != meals.ImportStatusFailed {
			t.Errorf("%s: status = %q, want failed", code, imp.Status)
		}
		if imp.AttemptCount != 1 {
			t.Errorf("%s: attemptCount = %d, want 1 — no retry", code, imp.AttemptCount)
		}
	}
}

func TestRetriesStopAtTheAttemptBudget(t *testing.T) {
	repo := newFakeRepo()
	extractor := &fakeExtractor{}
	policy := DefaultImportPolicy()
	policy.MaxAttempts = 3
	svc := newTestServiceWith(repo, extractor, knownCatalog(), policy)

	started, _ := svc.Start(context.Background(), identityFor(viewer), "https://youtu.be/abc", "")
	extractor.job = func() (transcriber.Job, error) {
		return failedJob("PROVIDER_ERROR", "still broken"), nil
	}

	// Each pass: the queued import is started, fails, and is requeued — until
	// the budget is gone and it settles as failed.
	current := repo.imports[started.ID]
	for i := 0; i < 5 && !current.Settled(); i++ {
		svc.Process(context.Background(), *current)
		current = repo.imports[started.ID]
	}

	if current.Status != meals.ImportStatusFailed {
		t.Fatalf("status = %q, want failed once the budget is spent", current.Status)
	}
	if current.AttemptCount != policy.MaxAttempts {
		t.Errorf("attemptCount = %d, want %d", current.AttemptCount, policy.MaxAttempts)
	}
	if current.ErrorCode == nil || *current.ErrorCode != "PROVIDER_ERROR" {
		t.Errorf("errorCode = %v", current.ErrorCode)
	}
}

// --- durability ------------------------------------------------------------

// The extraction service keeps jobs in memory. A restart there means the work
// is gone and will never finish on its own.
func TestAJobTheExtractorHasForgottenIsRetried(t *testing.T) {
	repo := newFakeRepo()
	extractor := &fakeExtractor{}
	svc := newTestService(repo, extractor)

	started, _ := svc.Start(context.Background(), identityFor(viewer), "https://youtu.be/abc", "")
	extractor.job = func() (transcriber.Job, error) {
		return transcriber.Job{}, transcriber.ErrJobNotFound
	}

	after := svc.Process(context.Background(), *repo.imports[started.ID])

	if after.Status != meals.ImportStatusQueued {
		t.Errorf("status = %q, want queued", after.Status)
	}
	if after.AttemptCount != 2 {
		t.Errorf("attemptCount = %d, want 2", after.AttemptCount)
	}
}

func TestAnImportRunningTooLongIsNotLeftRunningForever(t *testing.T) {
	repo := newFakeRepo()
	extractor := &fakeExtractor{}
	policy := DefaultImportPolicy()
	policy.RunningTimeout = time.Minute
	svc := newTestServiceWith(repo, extractor, knownCatalog(), policy)

	started, _ := svc.Start(context.Background(), identityFor(viewer), "https://youtu.be/abc", "")

	// The extractor keeps saying "running" and never finishes.
	extractor.job = func() (transcriber.Job, error) {
		return transcriber.Job{ID: "job_1", Status: transcriber.StatusRunning}, nil
	}
	// Well past the timeout.
	svc.now = func() time.Time { return time.Now().Add(2 * time.Hour) }

	after := svc.Process(context.Background(), *repo.imports[started.ID])

	if after.Status == meals.ImportStatusRunning {
		t.Fatal("a stuck import was left running")
	}
	if after.AttemptCount != 2 {
		t.Errorf("attemptCount = %d, want 2 (retried)", after.AttemptCount)
	}
}

func TestAStuckImportEventuallyFailsRatherThanRetryingForever(t *testing.T) {
	repo := newFakeRepo()
	extractor := &fakeExtractor{}
	policy := DefaultImportPolicy()
	policy.RunningTimeout = time.Minute
	policy.MaxAttempts = 2
	svc := newTestServiceWith(repo, extractor, knownCatalog(), policy)

	started, _ := svc.Start(context.Background(), identityFor(viewer), "https://youtu.be/abc", "")
	extractor.job = func() (transcriber.Job, error) {
		return transcriber.Job{ID: "job_1", Status: transcriber.StatusRunning}, nil
	}
	svc.now = func() time.Time { return time.Now().Add(2 * time.Hour) }

	current := repo.imports[started.ID]
	for i := 0; i < 6 && !current.Settled(); i++ {
		svc.Process(context.Background(), *current)
		current = repo.imports[started.ID]
	}

	if current.Status != meals.ImportStatusFailed {
		t.Errorf("status = %q, want failed", current.Status)
	}
}

// --- sweep -----------------------------------------------------------------

func TestSweepAdvancesImportsNobodyIsWatching(t *testing.T) {
	repo := newFakeRepo()
	extractor := &fakeExtractor{}
	policy := DefaultImportPolicy()
	policy.StaleAfter = time.Second
	svc := newTestServiceWith(repo, extractor, knownCatalog(), policy)

	started, _ := svc.Start(context.Background(), identityFor(viewer), "https://youtu.be/abc", "")
	extractor.job = func() (transcriber.Job, error) {
		return transcriber.Job{ID: "job_1", Status: transcriber.StatusSucceeded, Draft: completeDraft()}, nil
	}

	// Nobody polls; time passes; the worker sweeps.
	svc.now = func() time.Time { return time.Now().Add(time.Hour) }
	touched, err := svc.Sweep(context.Background(), 10)
	if err != nil {
		t.Fatalf("Sweep: %v", err)
	}
	if touched != 1 {
		t.Fatalf("swept %d imports, want 1", touched)
	}

	settled := repo.imports[started.ID]
	if settled.Status != meals.ImportStatusSucceeded || settled.Draft == nil {
		t.Errorf("import = %+v", settled)
	}
}

func TestSweepIgnoresImportsThatAreStillFresh(t *testing.T) {
	repo := newFakeRepo()
	policy := DefaultImportPolicy()
	policy.StaleAfter = time.Hour
	svc := newTestServiceWith(repo, &fakeExtractor{}, knownCatalog(), policy)

	svc.Start(context.Background(), identityFor(viewer), "https://youtu.be/abc", "")

	touched, err := svc.Sweep(context.Background(), 10)
	if err != nil {
		t.Fatalf("Sweep: %v", err)
	}
	if touched != 0 {
		t.Errorf("swept %d imports, want 0 — a fresh import is not stale", touched)
	}
}

func TestSweepDoesNothingWhenImportIsDisabled(t *testing.T) {
	svc := newTestServiceWith(newFakeRepo(), nil, knownCatalog(), DefaultImportPolicy())

	touched, err := svc.Sweep(context.Background(), 10)
	if err != nil || touched != 0 {
		t.Errorf("Sweep = (%d, %v), want (0, nil)", touched, err)
	}
}

// --- rate limiting ---------------------------------------------------------

func TestRateLimitBoundsWhatOneUserCanSpend(t *testing.T) {
	repo := newFakeRepo()
	extractor := &fakeExtractor{}
	policy := DefaultImportPolicy()
	policy.RateLimit = 3
	svc := newTestServiceWith(repo, extractor, knownCatalog(), policy)

	for i := 0; i < policy.RateLimit; i++ {
		url := "https://youtu.be/video-" + string(rune('a'+i))
		if _, err := svc.Start(context.Background(), identityFor(viewer), url, ""); err != nil {
			t.Fatalf("import %d: %v", i, err)
		}
	}

	_, err := svc.Start(context.Background(), identityFor(viewer), "https://youtu.be/one-too-many", "")
	if !errors.Is(err, ErrRateLimited) {
		t.Errorf("err = %v, want ErrRateLimited", err)
	}
	if extractor.startHit != policy.RateLimit {
		t.Errorf("extractor called %d times, want %d — a limited import still spent", extractor.startHit, policy.RateLimit)
	}
}

func TestRateLimitIsPerUser(t *testing.T) {
	repo := newFakeRepo()
	policy := DefaultImportPolicy()
	policy.RateLimit = 1
	svc := newTestServiceWith(repo, &fakeExtractor{}, knownCatalog(), policy)

	if _, err := svc.Start(context.Background(), identityFor(viewer), "https://youtu.be/a", ""); err != nil {
		t.Fatalf("A: %v", err)
	}
	if _, err := svc.Start(context.Background(), identityFor("user_2"), "https://youtu.be/b", ""); err != nil {
		t.Errorf("B was limited by A's usage: %v", err)
	}
}

func TestRateLimitOnlyCountsTheWindow(t *testing.T) {
	repo := newFakeRepo()
	policy := DefaultImportPolicy()
	policy.RateLimit = 1
	policy.RateWindow = time.Hour
	svc := newTestServiceWith(repo, &fakeExtractor{}, knownCatalog(), policy)

	if _, err := svc.Start(context.Background(), identityFor(viewer), "https://youtu.be/a", ""); err != nil {
		t.Fatalf("first: %v", err)
	}

	// A day later the earlier import is outside the window.
	svc.now = func() time.Time { return time.Now().Add(24 * time.Hour) }
	if _, err := svc.Start(context.Background(), identityFor(viewer), "https://youtu.be/b", ""); err != nil {
		t.Errorf("import outside the window was limited: %v", err)
	}
}

// --- resolution ------------------------------------------------------------

func resolvableDraft() *transcriber.Draft {
	servings := 4.0
	total := 30
	return &transcriber.Draft{
		Title:            "Dal",
		SourceURL:        "https://youtu.be/abc",
		Servings:         &servings,
		TotalTimeMinutes: &total,
		Ingredients: []transcriber.DraftIngredient{
			{Position: 1, RawText: "200g red lentils", DisplayName: str("red lentils"), Quantity: f64(200), Unit: str("g")},
			{Position: 2, RawText: "salt to taste", DisplayName: str("salt"), IsToTaste: true},
		},
		Instructions:       []transcriber.DraftInstruction{{Step: 1, Text: "Simmer."}},
		MissingInformation: []string{},
	}
}

func importWithDraft(t *testing.T, draft *transcriber.Draft, catalog CatalogLoader) meals.RecipeImport {
	t.Helper()
	repo := newFakeRepo()
	extractor := &fakeExtractor{}
	svc := newTestServiceWith(repo, extractor, catalog, DefaultImportPolicy())

	started, _ := svc.Start(context.Background(), identityFor(viewer), "https://youtu.be/abc", "")
	extractor.job = func() (transcriber.Job, error) {
		return transcriber.Job{ID: "job_1", Status: transcriber.StatusSucceeded, Draft: draft}, nil
	}
	imp, err := svc.Status(context.Background(), identityFor(viewer), started.ID)
	if err != nil {
		t.Fatalf("Status: %v", err)
	}
	return imp
}

func TestResolutionFillsIngredientIdentityAndGrams(t *testing.T) {
	imp := importWithDraft(t, resolvableDraft(), knownCatalog())

	if imp.Draft == nil {
		t.Fatal("no draft")
	}
	lentils := imp.Draft.Ingredients[0]
	if lentils.IngredientID == nil || *lentils.IngredientID != "ing_lentils" {
		t.Errorf("ingredientID = %v, want ing_lentils", lentils.IngredientID)
	}
	if lentils.Grams == nil || *lentils.Grams != 200 {
		t.Errorf("grams = %v, want 200", lentils.Grams)
	}
	if !imp.Draft.BaseMealPlanEligible {
		t.Errorf("a fully resolved recipe should be plannable; missing = %v", imp.Draft.MissingInformation)
	}
}

func TestAnUnknownIngredientKeepsTheRecipeUnplannable(t *testing.T) {
	draft := resolvableDraft()
	draft.Ingredients = append(draft.Ingredients, transcriber.DraftIngredient{
		Position: 3, RawText: "2 cups nduja", DisplayName: str("nduja"),
		Quantity: f64(2), Unit: str("cups"),
	})

	imp := importWithDraft(t, draft, knownCatalog())

	unknown := imp.Draft.Ingredients[2]
	if unknown.IngredientID != nil {
		t.Error("an ingredient not in the catalogue was given an id")
	}
	if unknown.MissingInformation == nil {
		t.Error("an unresolved ingredient was not marked")
	}
	if imp.Draft.BaseMealPlanEligible {
		t.Error("a recipe with an unknown ingredient must not be plannable")
	}
}

// A cup of flour and a cup of oil do not weigh the same, and the catalogue
// holds no densities.
func TestVolumesAreNotConvertedToGrams(t *testing.T) {
	draft := resolvableDraft()
	draft.Ingredients[0] = transcriber.DraftIngredient{
		Position: 1, RawText: "2 cups red lentils", DisplayName: str("red lentils"),
		Quantity: f64(2), Unit: str("cups"),
	}

	imp := importWithDraft(t, draft, knownCatalog())

	line := imp.Draft.Ingredients[0]
	if line.Grams != nil {
		t.Errorf("grams = %v for a volume unit, want nil", line.Grams)
	}
	if line.Quantity == nil || *line.Quantity != 2 {
		t.Error("the stated quantity was disturbed")
	}
	if line.IngredientID == nil {
		t.Error("a known ingredient failed to resolve just because its unit is a volume")
	}
}

// Storing a draft resolved against a catalogue we could not read would mark
// every line unknown and the recipe permanently unplannable.
func TestACatalogueFailureRetriesRatherThanStoringABadDraft(t *testing.T) {
	repo := newFakeRepo()
	extractor := &fakeExtractor{}
	broken := testCatalog{err: errors.New("database down")}
	svc := newTestServiceWith(repo, extractor, broken, DefaultImportPolicy())

	started, _ := svc.Start(context.Background(), identityFor(viewer), "https://youtu.be/abc", "")
	extractor.job = func() (transcriber.Job, error) {
		return transcriber.Job{ID: "job_1", Status: transcriber.StatusSucceeded, Draft: resolvableDraft()}, nil
	}

	imp, err := svc.Status(context.Background(), identityFor(viewer), started.ID)
	if err != nil {
		t.Fatalf("Status: %v", err)
	}
	if imp.Status == meals.ImportStatusSucceeded {
		t.Fatal("a draft was stored despite the catalogue being unreadable")
	}
	if imp.Status != meals.ImportStatusQueued {
		t.Errorf("status = %q, want queued for another attempt", imp.Status)
	}
}

// --- language --------------------------------------------------------------

func TestTheRequestedLanguageSurvivesARetry(t *testing.T) {
	repo := newFakeRepo()
	languages := []string{}
	extractor := &fakeExtractor{}
	extractor.start = func() (transcriber.Job, error) {
		return transcriber.Job{ID: "job_1", Status: transcriber.StatusQueued}, nil
	}
	svc := newTestService(repo, extractor)

	started, _ := svc.Start(context.Background(), identityFor(viewer), "https://youtu.be/abc", "french")
	if started.Language != "french" {
		t.Fatalf("language = %q, want french", started.Language)
	}

	// Requeue it, then watch what the next start asks for.
	repo.RetryRecipeImport(context.Background(), started.ID, 3)
	svc.extractor = &fakeExtractor{start: func() (transcriber.Job, error) {
		languages = append(languages, "captured")
		return transcriber.Job{ID: "job_2", Status: transcriber.StatusQueued}, nil
	}}
	retried := svc.Process(context.Background(), *repo.imports[started.ID])

	if retried.Language != "french" {
		t.Errorf("language after retry = %q, want french", retried.Language)
	}
}
