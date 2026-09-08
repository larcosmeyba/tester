package recipes

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"testing"

	"github.com/helpthehive/server/internal/auth"
	"github.com/helpthehive/server/internal/db"
	"github.com/helpthehive/server/internal/domain/meals"
	"github.com/helpthehive/server/internal/transcriber"
	"github.com/jackc/pgx/v5"
)

// --- fakes -----------------------------------------------------------------

type fakeRepo struct {
	imports  map[string]*meals.RecipeImport
	recipes  map[string]meals.Recipe
	upserts  int
	liveURLs map[string]bool
}

func newFakeRepo() *fakeRepo {
	return &fakeRepo{
		imports:  map[string]*meals.RecipeImport{},
		recipes:  map[string]meals.Recipe{},
		liveURLs: map[string]bool{},
	}
}

// owned mimics the SQL predicate: a row belonging to another user is never
// read, so it is indistinguishable from one that does not exist.
func (f *fakeRepo) owned(userID, importID string) (*meals.RecipeImport, bool) {
	imp, ok := f.imports[importID]
	if !ok || imp.UserID != userID {
		return nil, false
	}
	return imp, true
}

func (f *fakeRepo) CreateRecipeImport(_ context.Context, imp meals.RecipeImport) (meals.RecipeImport, error) {
	key := imp.UserID + "\x00" + imp.SourceURL
	if f.liveURLs[key] {
		return meals.RecipeImport{}, db.ErrImportInProgress
	}
	f.liveURLs[key] = true
	imp.Status = meals.ImportStatusQueued
	f.imports[imp.ID] = &imp
	return imp, nil
}

func (f *fakeRepo) GetRecipeImport(_ context.Context, userID, importID string) (meals.RecipeImport, error) {
	imp, ok := f.owned(userID, importID)
	if !ok {
		return meals.RecipeImport{}, pgx.ErrNoRows
	}
	return *imp, nil
}

func (f *fakeRepo) ListRecipeImports(_ context.Context, userID string, _ int) ([]meals.RecipeImport, error) {
	out := []meals.RecipeImport{}
	for _, imp := range f.imports {
		if imp.UserID == userID {
			out = append(out, *imp)
		}
	}
	return out, nil
}

func (f *fakeRepo) StartRecipeImport(_ context.Context, importID, jobID string) (meals.RecipeImport, error) {
	imp, ok := f.imports[importID]
	if !ok || imp.Status != meals.ImportStatusQueued {
		return meals.RecipeImport{}, pgx.ErrNoRows
	}
	imp.Status = meals.ImportStatusRunning
	imp.ProviderJobID = &jobID
	return *imp, nil
}

func (f *fakeRepo) CompleteRecipeImport(_ context.Context, importID string, draft meals.Recipe) (meals.RecipeImport, error) {
	imp, ok := f.imports[importID]
	if !ok || imp.Settled() {
		return meals.RecipeImport{}, pgx.ErrNoRows
	}
	imp.Status = meals.ImportStatusSucceeded
	imp.Draft = &draft
	delete(f.liveURLs, imp.UserID+"\x00"+imp.SourceURL)
	return *imp, nil
}

func (f *fakeRepo) FailRecipeImport(_ context.Context, importID, code, message string) (meals.RecipeImport, error) {
	imp, ok := f.imports[importID]
	if !ok || imp.Settled() {
		return meals.RecipeImport{}, pgx.ErrNoRows
	}
	imp.Status = meals.ImportStatusFailed
	imp.ErrorCode, imp.ErrorMessage = &code, &message
	delete(f.liveURLs, imp.UserID+"\x00"+imp.SourceURL)
	return *imp, nil
}

func (f *fakeRepo) CancelRecipeImport(_ context.Context, userID, importID string) (meals.RecipeImport, error) {
	imp, ok := f.owned(userID, importID)
	if !ok || imp.Settled() {
		return meals.RecipeImport{}, pgx.ErrNoRows
	}
	imp.Status = meals.ImportStatusCancelled
	delete(f.liveURLs, imp.UserID+"\x00"+imp.SourceURL)
	return *imp, nil
}

func (f *fakeRepo) LinkRecipeImportRecipe(_ context.Context, userID, importID, recipeID string) (meals.RecipeImport, error) {
	imp, ok := f.owned(userID, importID)
	if !ok || imp.Status != meals.ImportStatusSucceeded {
		return meals.RecipeImport{}, pgx.ErrNoRows
	}
	imp.RecipeID = &recipeID
	return *imp, nil
}

func (f *fakeRepo) UpsertRecipe(_ context.Context, recipe meals.Recipe) error {
	f.upserts++
	f.recipes[recipe.ID] = recipe
	return nil
}

func (f *fakeRepo) GetRecipe(_ context.Context, userID, recipeID string) (meals.Recipe, error) {
	recipe, ok := f.recipes[recipeID]
	if !ok || recipe.OwnerUserID == nil || *recipe.OwnerUserID != userID {
		return meals.Recipe{}, pgx.ErrNoRows
	}
	return recipe, nil
}

type fakeExtractor struct {
	start    func() (transcriber.Job, error)
	job      func() (transcriber.Job, error)
	startHit int
}

func (f *fakeExtractor) Start(context.Context, transcriber.StartRequest) (transcriber.Job, error) {
	f.startHit++
	if f.start != nil {
		return f.start()
	}
	return transcriber.Job{ID: "job_1", Status: transcriber.StatusQueued}, nil
}

func (f *fakeExtractor) Job(context.Context, string) (transcriber.Job, error) {
	if f.job != nil {
		return f.job()
	}
	return transcriber.Job{ID: "job_1", Status: transcriber.StatusRunning}, nil
}

// --- helpers ---------------------------------------------------------------

const viewer = "user_1"

func newTestService(repo ImportRepository, extractor Extractor) *ImportService {
	ids := 0
	return &ImportService{
		repo:      repo,
		extractor: extractor,
		log:       slog.New(slog.NewTextHandler(io.Discard, nil)),
		newID: func() string {
			ids++
			return "id_" + string(rune('a'+ids-1))
		},
		resolveUser: func(_ context.Context, identity auth.Identity) (string, error) {
			return identity.Subject, nil
		},
	}
}

func identityFor(userID string) auth.Identity { return auth.Identity{Subject: userID} }

func completeDraft() *transcriber.Draft {
	servings := 4.0
	total := 30
	return &transcriber.Draft{
		Title:            "Dal",
		SourceURL:        "https://youtu.be/abc",
		Servings:         &servings,
		TotalTimeMinutes: &total,
		Ingredients: []transcriber.DraftIngredient{
			{Position: 1, RawText: "200g lentils", Quantity: f64(200), Unit: str("g")},
			{Position: 2, RawText: "salt to taste", IsToTaste: true},
		},
		Instructions:       []transcriber.DraftInstruction{{Step: 1, Text: "Simmer."}},
		MissingInformation: []string{},
	}
}

func f64(v float64) *float64 { return &v }
func str(v string) *string   { return &v }

// --- tests -----------------------------------------------------------------

func TestStartRecordsTheImportBeforeCallingTheExtractor(t *testing.T) {
	repo := newFakeRepo()
	extractor := &fakeExtractor{start: func() (transcriber.Job, error) {
		return transcriber.Job{}, errors.New("boom")
	}}
	svc := newTestService(repo, extractor)

	imp, err := svc.Start(context.Background(), identityFor(viewer), "https://youtu.be/abc", "")
	if err != nil {
		t.Fatalf("Start: %v", err)
	}

	if imp.Status != meals.ImportStatusFailed {
		t.Errorf("status = %q, want failed", imp.Status)
	}
	if imp.ErrorCode == nil || *imp.ErrorCode != "PROVIDER_ERROR" {
		t.Errorf("errorCode = %v, want PROVIDER_ERROR", imp.ErrorCode)
	}
	if len(repo.imports) != 1 {
		t.Error("a paid-for import was not recorded")
	}
}

func TestStartMovesQueuedToRunning(t *testing.T) {
	repo := newFakeRepo()
	svc := newTestService(repo, &fakeExtractor{})

	imp, err := svc.Start(context.Background(), identityFor(viewer), "https://youtu.be/abc", "english")
	if err != nil {
		t.Fatalf("Start: %v", err)
	}

	if imp.Status != meals.ImportStatusRunning {
		t.Errorf("status = %q, want running", imp.Status)
	}
	if imp.ProviderJobID == nil || *imp.ProviderJobID != "job_1" {
		t.Errorf("providerJobID = %v", imp.ProviderJobID)
	}
	if imp.SourcePlatform != "youtube" {
		t.Errorf("platform = %q, want youtube", imp.SourcePlatform)
	}
}

func TestStartRefusesASecondLiveImportOfTheSameVideo(t *testing.T) {
	repo := newFakeRepo()
	extractor := &fakeExtractor{}
	svc := newTestService(repo, extractor)

	if _, err := svc.Start(context.Background(), identityFor(viewer), "https://youtu.be/abc", ""); err != nil {
		t.Fatalf("first Start: %v", err)
	}
	_, err := svc.Start(context.Background(), identityFor(viewer), "https://youtu.be/abc", "")

	if !errors.Is(err, ErrImportInProgress) {
		t.Errorf("err = %v, want ErrImportInProgress", err)
	}
	if extractor.startHit != 1 {
		t.Errorf("extractor called %d times: a duplicate bought a transcription", extractor.startHit)
	}
}

func TestStartRejectsThingsThatAreNotLinks(t *testing.T) {
	svc := newTestService(newFakeRepo(), &fakeExtractor{})

	for _, raw := range []string{"", "   ", "not a url", "ftp://example.com/v", "javascript:alert(1)"} {
		if _, err := svc.Start(context.Background(), identityFor(viewer), raw, ""); !errors.Is(err, ErrInvalidSourceURL) {
			t.Errorf("Start(%q) err = %v, want ErrInvalidSourceURL", raw, err)
		}
	}
}

func TestDisabledImportIsReportedNotCrashed(t *testing.T) {
	svc := newTestService(newFakeRepo(), nil)

	if svc.Enabled() {
		t.Error("a service with no extractor reported itself enabled")
	}
	if _, err := svc.Start(context.Background(), identityFor(viewer), "https://youtu.be/a", ""); !errors.Is(err, ErrImportUnavailable) {
		t.Errorf("err = %v, want ErrImportUnavailable", err)
	}
}

func TestStatusStoresTheDraftWhenExtractionSucceeds(t *testing.T) {
	repo := newFakeRepo()
	extractor := &fakeExtractor{}
	svc := newTestService(repo, extractor)

	started, _ := svc.Start(context.Background(), identityFor(viewer), "https://youtu.be/abc", "")
	extractor.job = func() (transcriber.Job, error) {
		return transcriber.Job{ID: "job_1", Status: transcriber.StatusSucceeded, Draft: completeDraft()}, nil
	}

	imp, err := svc.Status(context.Background(), identityFor(viewer), started.ID)
	if err != nil {
		t.Fatalf("Status: %v", err)
	}

	if imp.Status != meals.ImportStatusSucceeded || imp.Draft == nil {
		t.Fatalf("import = %+v", imp)
	}
	if imp.Draft.ID == "" {
		t.Error("the draft has no recipe id, so it cannot be referred to before saving")
	}
	if len(repo.recipes) != 0 {
		t.Error("an unreviewed draft was written to recipes")
	}
}

func TestASucceededDraftKeepsTheMissingInformationRules(t *testing.T) {
	repo := newFakeRepo()
	extractor := &fakeExtractor{}
	svc := newTestService(repo, extractor)

	draft := completeDraft()
	draft.Ingredients = append(draft.Ingredients, transcriber.DraftIngredient{
		Position:           3,
		RawText:            "a splash of oil",
		MissingInformation: str("The video never stated a quantity for this ingredient."),
	})
	draft.MissingInformation = []string{"ingredient_quantities"}

	started, _ := svc.Start(context.Background(), identityFor(viewer), "https://youtu.be/abc", "")
	extractor.job = func() (transcriber.Job, error) {
		return transcriber.Job{ID: "job_1", Status: transcriber.StatusSucceeded, Draft: draft}, nil
	}

	imp, _ := svc.Status(context.Background(), identityFor(viewer), started.ID)
	stored := *imp.Draft

	if stored.BaseMealPlanEligible {
		t.Error("an incomplete draft must not be plannable")
	}
	if stored.Ingredients[2].Quantity != nil {
		t.Error("a quantity was invented")
	}
	if stored.Ingredients[1].MissingInformation != nil {
		t.Error("\"to taste\" was counted as missing information")
	}
	for _, line := range stored.Ingredients {
		if line.IngredientID != nil || line.Grams != nil {
			t.Error("ingredient identity or grams were set outside Help The Hive")
		}
	}
	if stored.CaloriesKcal != nil || stored.NutritionBasis != nil {
		t.Error("nutrition was invented")
	}
}

func TestStatusRecordsANamedExtractionFailure(t *testing.T) {
	repo := newFakeRepo()
	extractor := &fakeExtractor{}
	svc := newTestService(repo, extractor)

	started, _ := svc.Start(context.Background(), identityFor(viewer), "https://youtu.be/abc", "")
	extractor.job = func() (transcriber.Job, error) {
		return transcriber.Job{
			ID:     "job_1",
			Status: transcriber.StatusFailed,
			RawError: &struct {
				Code    string `json:"code"`
				Message string `json:"message"`
				Detail  string `json:"detail"`
			}{Code: "VIDEO_UNAVAILABLE", Message: "That video is private."},
		}, nil
	}

	imp, err := svc.Status(context.Background(), identityFor(viewer), started.ID)
	if err != nil {
		t.Fatalf("Status: %v", err)
	}
	if imp.Status != meals.ImportStatusFailed {
		t.Errorf("status = %q, want failed", imp.Status)
	}
	if imp.ErrorCode == nil || *imp.ErrorCode != "VIDEO_UNAVAILABLE" {
		t.Errorf("errorCode = %v", imp.ErrorCode)
	}
}

func TestAnUnreachableExtractorDoesNotFailTheRead(t *testing.T) {
	repo := newFakeRepo()
	extractor := &fakeExtractor{}
	svc := newTestService(repo, extractor)

	started, _ := svc.Start(context.Background(), identityFor(viewer), "https://youtu.be/abc", "")
	extractor.job = func() (transcriber.Job, error) {
		return transcriber.Job{}, transcriber.ErrUnavailable
	}

	imp, err := svc.Status(context.Background(), identityFor(viewer), started.ID)
	if err != nil {
		t.Fatalf("Status: %v", err)
	}
	if imp.Status != meals.ImportStatusRunning {
		t.Errorf("status = %q: the stored record should have been returned unchanged", imp.Status)
	}
}

func TestASettledImportIsNeverPolledAgain(t *testing.T) {
	repo := newFakeRepo()
	polls := 0
	extractor := &fakeExtractor{job: func() (transcriber.Job, error) {
		polls++
		return transcriber.Job{ID: "job_1", Status: transcriber.StatusSucceeded, Draft: completeDraft()}, nil
	}}
	svc := newTestService(repo, extractor)

	started, _ := svc.Start(context.Background(), identityFor(viewer), "https://youtu.be/abc", "")
	svc.Status(context.Background(), identityFor(viewer), started.ID)
	svc.Status(context.Background(), identityFor(viewer), started.ID)

	if polls != 1 {
		t.Errorf("polled %d times, want 1: a settled import is the answer", polls)
	}
}

// --- ownership -------------------------------------------------------------

func TestAnotherUsersImportIsNotFound(t *testing.T) {
	repo := newFakeRepo()
	svc := newTestService(repo, &fakeExtractor{})

	mine, _ := svc.Start(context.Background(), identityFor(viewer), "https://youtu.be/abc", "")
	intruder := identityFor("user_2")

	if _, err := svc.Status(context.Background(), intruder, mine.ID); !errors.Is(err, meals.ErrNotFound) {
		t.Errorf("Status err = %v, want ErrNotFound", err)
	}
	if _, err := svc.Cancel(context.Background(), intruder, mine.ID); !errors.Is(err, meals.ErrNotFound) {
		t.Errorf("Cancel err = %v, want ErrNotFound", err)
	}
	if _, err := svc.Accept(context.Background(), intruder, mine.ID); !errors.Is(err, meals.ErrNotFound) {
		t.Errorf("Accept err = %v, want ErrNotFound", err)
	}
}

func TestListOnlyReturnsTheViewersImports(t *testing.T) {
	repo := newFakeRepo()
	svc := newTestService(repo, &fakeExtractor{})

	svc.Start(context.Background(), identityFor(viewer), "https://youtu.be/abc", "")
	svc.Start(context.Background(), identityFor("user_2"), "https://youtu.be/def", "")

	mine, err := svc.List(context.Background(), identityFor(viewer), 10)
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	if len(mine) != 1 || mine[0].UserID != viewer {
		t.Errorf("List returned %d imports: %+v", len(mine), mine)
	}
}

// --- cancel ----------------------------------------------------------------

func TestCancelStopsALiveImport(t *testing.T) {
	repo := newFakeRepo()
	svc := newTestService(repo, &fakeExtractor{})

	started, _ := svc.Start(context.Background(), identityFor(viewer), "https://youtu.be/abc", "")
	cancelled, err := svc.Cancel(context.Background(), identityFor(viewer), started.ID)
	if err != nil {
		t.Fatalf("Cancel: %v", err)
	}
	if cancelled.Status != meals.ImportStatusCancelled {
		t.Errorf("status = %q, want cancelled", cancelled.Status)
	}
}

func TestCancellingASettledImportLeavesItAlone(t *testing.T) {
	repo := newFakeRepo()
	extractor := &fakeExtractor{}
	svc := newTestService(repo, extractor)

	started, _ := svc.Start(context.Background(), identityFor(viewer), "https://youtu.be/abc", "")
	extractor.job = func() (transcriber.Job, error) {
		return transcriber.Job{ID: "job_1", Status: transcriber.StatusSucceeded, Draft: completeDraft()}, nil
	}
	svc.Status(context.Background(), identityFor(viewer), started.ID)

	after, err := svc.Cancel(context.Background(), identityFor(viewer), started.ID)
	if err != nil {
		t.Fatalf("Cancel: %v", err)
	}
	if after.Status != meals.ImportStatusSucceeded {
		t.Errorf("status = %q: a finished import was undone", after.Status)
	}
}

// --- accept ----------------------------------------------------------------

func acceptedImport(t *testing.T) (*fakeRepo, *ImportService, meals.RecipeImport) {
	t.Helper()
	repo := newFakeRepo()
	extractor := &fakeExtractor{}
	svc := newTestService(repo, extractor)

	started, _ := svc.Start(context.Background(), identityFor(viewer), "https://youtu.be/abc", "")
	extractor.job = func() (transcriber.Job, error) {
		return transcriber.Job{ID: "job_1", Status: transcriber.StatusSucceeded, Draft: completeDraft()}, nil
	}
	imp, _ := svc.Status(context.Background(), identityFor(viewer), started.ID)
	return repo, svc, imp
}

func TestAcceptSavesTheDraftThroughTheOrdinaryRecipePath(t *testing.T) {
	repo, svc, imp := acceptedImport(t)

	recipe, err := svc.Accept(context.Background(), identityFor(viewer), imp.ID)
	if err != nil {
		t.Fatalf("Accept: %v", err)
	}

	if repo.upserts != 1 {
		t.Errorf("upserts = %d, want 1", repo.upserts)
	}
	if recipe.ID != imp.Draft.ID {
		t.Errorf("recipe id %q != draft id %q", recipe.ID, imp.Draft.ID)
	}
	if recipe.OwnerUserID == nil || *recipe.OwnerUserID != viewer {
		t.Errorf("ownerUserID = %v", recipe.OwnerUserID)
	}
	if recipe.Visibility != "private" || recipe.ReviewStatus != "draft" {
		t.Errorf("visibility/reviewStatus = %q/%q", recipe.Visibility, recipe.ReviewStatus)
	}
	if recipe.SourceType != "video_import" {
		t.Errorf("sourceType = %q", recipe.SourceType)
	}
}

func TestAcceptIsIdempotent(t *testing.T) {
	repo, svc, imp := acceptedImport(t)

	first, err := svc.Accept(context.Background(), identityFor(viewer), imp.ID)
	if err != nil {
		t.Fatalf("first Accept: %v", err)
	}
	second, err := svc.Accept(context.Background(), identityFor(viewer), imp.ID)
	if err != nil {
		t.Fatalf("second Accept: %v", err)
	}

	if first.ID != second.ID {
		t.Errorf("accepting twice produced two recipes: %q and %q", first.ID, second.ID)
	}
	if len(repo.recipes) != 1 {
		t.Errorf("recipes stored = %d, want 1", len(repo.recipes))
	}
}

func TestAcceptLinksTheRecipeBackToTheImport(t *testing.T) {
	repo, svc, imp := acceptedImport(t)

	recipe, _ := svc.Accept(context.Background(), identityFor(viewer), imp.ID)

	stored := repo.imports[imp.ID]
	if stored.RecipeID == nil || *stored.RecipeID != recipe.ID {
		t.Errorf("import.recipeID = %v, want %q", stored.RecipeID, recipe.ID)
	}
}

func TestAcceptRefusesAnImportThatHasNoDraft(t *testing.T) {
	repo := newFakeRepo()
	svc := newTestService(repo, &fakeExtractor{})

	started, _ := svc.Start(context.Background(), identityFor(viewer), "https://youtu.be/abc", "")

	if _, err := svc.Accept(context.Background(), identityFor(viewer), started.ID); !errors.Is(err, ErrImportNotSucceeded) {
		t.Errorf("err = %v, want ErrImportNotSucceeded", err)
	}
	if repo.upserts != 0 {
		t.Error("an unfinished import wrote a recipe")
	}
}

func TestUnknownImportIsNotFound(t *testing.T) {
	svc := newTestService(newFakeRepo(), &fakeExtractor{})

	if _, err := svc.Status(context.Background(), identityFor(viewer), "nope"); !errors.Is(err, meals.ErrNotFound) {
		t.Errorf("err = %v, want ErrNotFound", err)
	}
}

func TestPlatformIsDerivedFromTheHost(t *testing.T) {
	cases := map[string]string{
		"https://www.youtube.com/watch?v=a": "youtube",
		"https://youtu.be/a":                "youtube",
		"https://www.instagram.com/reel/a/": "instagram",
		"https://vm.tiktok.com/a":           "tiktok",
		"https://example.com/a":             "example.com",
	}
	for raw, want := range cases {
		_, platform, err := normalizeSourceURL(raw)
		if err != nil {
			t.Fatalf("normalizeSourceURL(%q): %v", raw, err)
		}
		if platform != want {
			t.Errorf("platform(%q) = %q, want %q", raw, platform, want)
		}
	}
}
