package recipes

import (
	"context"
	"errors"
	"log/slog"
	"net/url"
	"strings"
	"time"

	"github.com/helpthehive/server/internal/auth"
	"github.com/helpthehive/server/internal/db"
	"github.com/helpthehive/server/internal/domain/meals"
	"github.com/helpthehive/server/internal/modules/users"
	"github.com/helpthehive/server/internal/transcriber"
)

// ImportRepository is what importing needs from the database. Declared here so
// the module states its own requirements; *db.Store satisfies it.
type ImportRepository interface {
	CreateRecipeImport(ctx context.Context, imp meals.RecipeImport) (meals.RecipeImport, error)
	GetRecipeImport(ctx context.Context, userID string, importID string) (meals.RecipeImport, error)
	ListRecipeImports(ctx context.Context, userID string, limit int) ([]meals.RecipeImport, error)
	StartRecipeImport(ctx context.Context, importID string, providerJobID string) (meals.RecipeImport, error)
	CompleteRecipeImport(ctx context.Context, importID string, draft meals.Recipe) (meals.RecipeImport, error)
	FailRecipeImport(ctx context.Context, importID string, code string, message string) (meals.RecipeImport, error)
	CancelRecipeImport(ctx context.Context, userID string, importID string) (meals.RecipeImport, error)
	LinkRecipeImportRecipe(ctx context.Context, userID string, importID string, recipeID string) (meals.RecipeImport, error)

	// The existing recipe write path. Accepting a draft is an ordinary recipe
	// upsert; importing does not get a second way to create a recipe.
	UpsertRecipe(ctx context.Context, recipe meals.Recipe) error
	GetRecipe(ctx context.Context, userID string, recipeID string) (meals.Recipe, error)
}

// Extractor is the extraction service, as this module needs it. The concrete
// client lives in internal/transcriber and nothing else in the server may talk
// to it.
type Extractor interface {
	Start(ctx context.Context, req transcriber.StartRequest) (transcriber.Job, error)
	Job(ctx context.Context, providerJobID string) (transcriber.Job, error)
}

var (
	// ErrImportUnavailable is returned when video import is not configured.
	// It is optional: with no extraction service the rest of the server runs
	// exactly as it does today.
	ErrImportUnavailable = errors.New("recipe import is not enabled on this server")

	// ErrImportNotSucceeded is returned when a draft is accepted before there
	// is one.
	ErrImportNotSucceeded = errors.New("this import has not produced a recipe to accept")

	// ErrImportInProgress is re-exported so callers need not import the db
	// package to recognise it.
	ErrImportInProgress = db.ErrImportInProgress

	// ErrInvalidSourceURL is returned for something that is not a video link.
	ErrInvalidSourceURL = errors.New("that does not look like a video link")
)

// ImportService turns cooking videos into recipe drafts.
//
// It is a separate service from the recipe library on purpose: browsing
// recipes is a read of shared reference data, while importing spends money,
// calls another service and has a lifecycle. Nothing in the library has to
// change when importing does.
type ImportService struct {
	repo      ImportRepository
	extractor Extractor
	log       *slog.Logger
	newID     func() string
	now       func() time.Time

	// resolveUser turns the verified token into the viewer's user id. It is a
	// function rather than the users service itself so that the ownership and
	// lifecycle rules below can be tested without a database — they are the
	// part of this module that must not be got wrong.
	resolveUser func(ctx context.Context, identity auth.Identity) (string, error)
}

func NewImportService(repo ImportRepository, usersService *users.Service, extractor Extractor, logger *slog.Logger) *ImportService {
	if logger == nil {
		logger = slog.Default()
	}
	return &ImportService{
		repo:      repo,
		extractor: extractor,
		log:       logger,
		newID:     db.NewID,
		now:       time.Now,
		resolveUser: func(ctx context.Context, identity auth.Identity) (string, error) {
			viewer, err := usersService.Viewer(ctx, identity)
			if err != nil {
				return "", err
			}
			return viewer.User.ID, nil
		},
	}
}

// Enabled reports whether an extraction service is configured.
func (s *ImportService) Enabled() bool {
	return s != nil && s.extractor != nil
}

func (s *ImportService) userID(ctx context.Context, identity auth.Identity) (string, error) {
	return s.resolveUser(ctx, identity)
}

// Start begins an import for the viewer.
//
// The row is written before the extraction service is called, so an import
// that is paid for is always recorded — a crash between the two would
// otherwise spend a transcription nobody can see.
func (s *ImportService) Start(ctx context.Context, identity auth.Identity, rawURL string, language string) (meals.RecipeImport, error) {
	if !s.Enabled() {
		return meals.RecipeImport{}, ErrImportUnavailable
	}

	userID, err := s.userID(ctx, identity)
	if err != nil {
		return meals.RecipeImport{}, err
	}

	sourceURL, platform, err := normalizeSourceURL(rawURL)
	if err != nil {
		return meals.RecipeImport{}, err
	}

	imp, err := s.repo.CreateRecipeImport(ctx, meals.RecipeImport{
		ID:             s.newID(),
		UserID:         userID,
		SourceURL:      sourceURL,
		SourcePlatform: platform,
		AttemptCount:   1,
	})
	if err != nil {
		// A live import of the same video already exists: the unique index
		// refused a second one rather than buying a second transcription.
		return meals.RecipeImport{}, err
	}

	job, err := s.extractor.Start(ctx, transcriber.StartRequest{
		URL:      sourceURL,
		Language: language,
		// For the extraction service's logs only. It has no user table, and
		// nothing it returns is trusted to say who an import belongs to.
		OwnerUserID: userID,
	})
	if err != nil {
		return s.failFrom(ctx, imp, err), nil
	}

	started, err := s.repo.StartRecipeImport(ctx, imp.ID, job.ID)
	if db.IsNotFound(err) {
		// Cancelled while the start request was in flight. The cancellation
		// wins; the record already says so.
		return s.get(ctx, userID, imp.ID)
	}
	if err != nil {
		return meals.RecipeImport{}, err
	}

	s.log.InfoContext(ctx, "recipe import queued",
		slog.String("import_id", started.ID),
		slog.String("platform", started.SourcePlatform),
	)
	return s.settleFromJob(ctx, started, job), nil
}

// Status returns an import, refreshing it from the extraction service while it
// is still in flight.
//
// The stored row is the answer. The service is consulted only to move an
// unfinished import along, and if it cannot be reached the record is returned
// unchanged rather than the read failing.
func (s *ImportService) Status(ctx context.Context, identity auth.Identity, importID string) (meals.RecipeImport, error) {
	userID, err := s.userID(ctx, identity)
	if err != nil {
		return meals.RecipeImport{}, err
	}

	imp, err := s.get(ctx, userID, importID)
	if err != nil {
		return meals.RecipeImport{}, err
	}
	if imp.Settled() || !s.Enabled() || imp.ProviderJobID == nil {
		return imp, nil
	}

	job, err := s.extractor.Job(ctx, *imp.ProviderJobID)
	if err != nil {
		// The extraction service being unreachable is not the user's problem
		// and is not this import's outcome. Report what is stored.
		s.log.WarnContext(ctx, "could not refresh recipe import",
			slog.String("import_id", imp.ID),
			slog.String("error", err.Error()),
		)
		return imp, nil
	}
	return s.settleFromJob(ctx, imp, job), nil
}

// List returns the viewer's imports, newest first.
func (s *ImportService) List(ctx context.Context, identity auth.Identity, limit int) ([]meals.RecipeImport, error) {
	userID, err := s.userID(ctx, identity)
	if err != nil {
		return nil, err
	}
	return s.repo.ListRecipeImports(ctx, userID, limit)
}

// Cancel stops an import that has not settled. An already-settled import is
// returned unchanged rather than being an error: the caller's intent — "do not
// continue this" — is already satisfied.
func (s *ImportService) Cancel(ctx context.Context, identity auth.Identity, importID string) (meals.RecipeImport, error) {
	userID, err := s.userID(ctx, identity)
	if err != nil {
		return meals.RecipeImport{}, err
	}

	cancelled, err := s.repo.CancelRecipeImport(ctx, userID, importID)
	if db.IsNotFound(err) {
		// Either not the viewer's, or already settled. Reading it decides
		// which, and reports somebody else's import as not found.
		return s.get(ctx, userID, importID)
	}
	if err != nil {
		return meals.RecipeImport{}, err
	}
	return cancelled, nil
}

// Accept saves a finished import's draft as one of the viewer's recipes.
//
// Idempotent: the draft carries the id the recipe will have, so accepting
// twice updates one recipe rather than creating two.
func (s *ImportService) Accept(ctx context.Context, identity auth.Identity, importID string) (meals.Recipe, error) {
	userID, err := s.userID(ctx, identity)
	if err != nil {
		return meals.Recipe{}, err
	}

	imp, err := s.get(ctx, userID, importID)
	if err != nil {
		return meals.Recipe{}, err
	}
	if imp.Status != meals.ImportStatusSucceeded || imp.Draft == nil {
		return meals.Recipe{}, ErrImportNotSucceeded
	}

	draft := *imp.Draft
	// The draft was converted once, when it was stored. Ownership is
	// re-asserted here rather than trusted, because this is the moment it
	// becomes a real recipe.
	owner := userID
	draft.OwnerUserID = &owner
	draft.Visibility = "private"
	draft.ReviewStatus = "draft"

	if err := s.repo.UpsertRecipe(ctx, draft); err != nil {
		return meals.Recipe{}, err
	}
	if _, err := s.repo.LinkRecipeImportRecipe(ctx, userID, imp.ID, draft.ID); err != nil && !db.IsNotFound(err) {
		return meals.Recipe{}, err
	}

	s.log.InfoContext(ctx, "recipe import accepted",
		slog.String("import_id", imp.ID),
		slog.String("recipe_id", draft.ID),
	)

	// Read it back so the caller gets the stored recipe, not the draft — the
	// two differ once the server has resolved ingredients.
	saved, err := s.repo.GetRecipe(ctx, userID, draft.ID)
	if db.IsNotFound(err) {
		return draft, nil
	}
	if err != nil {
		return meals.Recipe{}, err
	}
	return saved, nil
}

func (s *ImportService) get(ctx context.Context, userID string, importID string) (meals.RecipeImport, error) {
	imp, err := s.repo.GetRecipeImport(ctx, userID, strings.TrimSpace(importID))
	if db.IsNotFound(err) {
		return meals.RecipeImport{}, meals.ErrNotFound
	}
	return imp, err
}

// settleFromJob applies whatever the extraction service now says. Anything it
// cannot settle is left as it was: a job still running is not news.
func (s *ImportService) settleFromJob(ctx context.Context, imp meals.RecipeImport, job transcriber.Job) meals.RecipeImport {
	switch job.Status {
	case transcriber.StatusSucceeded:
		if job.Draft == nil {
			return s.fail(ctx, imp, "PROVIDER_ERROR", "The extraction finished without returning a recipe.")
		}
		// The recipe id is minted now, so the draft can be referred to before
		// it is saved and so accepting it is an upsert rather than an insert.
		recipe := job.Draft.ToRecipe(s.newID(), imp.UserID)
		completed, err := s.repo.CompleteRecipeImport(ctx, imp.ID, recipe)
		if err != nil {
			if !db.IsNotFound(err) {
				s.log.ErrorContext(ctx, "could not store recipe draft",
					slog.String("import_id", imp.ID), slog.String("error", err.Error()))
			}
			return imp
		}
		return completed

	case transcriber.StatusFailed:
		if failure := job.Failure(); failure != nil {
			return s.fail(ctx, imp, failure.Code, failure.Message)
		}
		return s.fail(ctx, imp, "PROVIDER_ERROR", "The extraction failed without saying why.")

	default:
		return imp
	}
}

// failFrom turns a client-level error into a recorded failure. A named service
// error keeps its code; anything else is a provider fault, which is the one
// failure worth retrying.
func (s *ImportService) failFrom(ctx context.Context, imp meals.RecipeImport, err error) meals.RecipeImport {
	var svcErr *transcriber.ServiceError
	if errors.As(err, &svcErr) {
		return s.fail(ctx, imp, svcErr.Code, svcErr.Message)
	}
	s.log.ErrorContext(ctx, "recipe import could not be started",
		slog.String("import_id", imp.ID), slog.String("error", err.Error()))
	return s.fail(ctx, imp, "PROVIDER_ERROR", "The recipe extractor could not be reached. Please try again.")
}

func (s *ImportService) fail(ctx context.Context, imp meals.RecipeImport, code string, message string) meals.RecipeImport {
	failed, err := s.repo.FailRecipeImport(ctx, imp.ID, code, message)
	if err != nil {
		if !db.IsNotFound(err) {
			s.log.ErrorContext(ctx, "could not record import failure",
				slog.String("import_id", imp.ID), slog.String("error", err.Error()))
		}
		return imp
	}
	return failed
}

// normalizeSourceURL checks the link is one and names the platform.
//
// Which hosts are actually supported is the extraction service's to decide —
// it is configured with the allowlist — so this only rejects what is plainly
// not a video link, and reports UNSUPPORTED_SOURCE from the service otherwise.
func normalizeSourceURL(raw string) (string, string, error) {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return "", "", ErrInvalidSourceURL
	}

	parsed, err := url.Parse(trimmed)
	if err != nil || parsed.Host == "" {
		return "", "", ErrInvalidSourceURL
	}
	if parsed.Scheme != "http" && parsed.Scheme != "https" {
		return "", "", ErrInvalidSourceURL
	}
	return trimmed, platformOf(parsed.Host), nil
}

func platformOf(host string) string {
	host = strings.ToLower(host)
	if idx := strings.IndexByte(host, ':'); idx >= 0 {
		host = host[:idx]
	}
	switch {
	case strings.HasSuffix(host, "youtube.com"), host == "youtu.be":
		return "youtube"
	case strings.HasSuffix(host, "instagram.com"):
		return "instagram"
	case strings.HasSuffix(host, "tiktok.com"):
		return "tiktok"
	default:
		return host
	}
}
