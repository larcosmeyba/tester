package recipes

import (
	"context"
	"errors"
	"log/slog"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/helpthehive/server/internal/auth"
	"github.com/helpthehive/server/internal/db"
	"github.com/helpthehive/server/internal/domain/meals"
	"github.com/helpthehive/server/internal/modules/transcriber"
	"github.com/helpthehive/server/internal/modules/users"
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

	// Durable processing and spend control.
	CountRecipeImportsSince(ctx context.Context, userID string, since time.Time) (int, error)
	ClaimStaleRecipeImports(ctx context.Context, quietSince time.Time, limit int) ([]meals.RecipeImport, error)
	RetryRecipeImport(ctx context.Context, importID string, maxAttempts int) (meals.RecipeImport, error)

	// The existing recipe write path. Accepting a draft is an ordinary recipe
	// upsert; importing does not get a second way to create a recipe.
	UpsertRecipe(ctx context.Context, recipe meals.Recipe) error
	GetRecipe(ctx context.Context, userID string, recipeID string) (meals.Recipe, error)
}

// Extractor is the extraction service, as this module needs it. The concrete
// client lives in internal/modules/transcriber and nothing else in the
// server may talk to it.
type Extractor interface {
	Start(ctx context.Context, req transcriber.StartRequest) (transcriber.Job, error)
	Job(ctx context.Context, providerJobID string) (transcriber.Job, error)
}

// CatalogLoader supplies the canonical ingredient catalogue. An extracted
// recipe is resolved against it before it is stored, which is the only way a
// draft ever becomes plannable.
type CatalogLoader interface {
	Load(ctx context.Context, scope string) (*meals.Catalog, error)
}

// Everything is priced and resolved against US reference data today, as it is
// everywhere else in the meal system.
const defaultPriceScope = "us"

// ImportPolicy bounds what importing may cost and how long it may take.
type ImportPolicy struct {
	// Extractions one import may pay for, including the first.
	MaxAttempts int
	// Imports one user may start per RateWindow.
	RateLimit  int
	RateWindow time.Duration
	// How quiet an unfinished import must be before the worker picks it up.
	StaleAfter time.Duration
	// How long an import may stay running before it is treated as stuck.
	// The extraction service holds jobs in memory, so a restart there leaves
	// imports that will never finish on their own.
	RunningTimeout time.Duration
}

// DefaultImportPolicy is deliberately tight. Each attempt buys a
// transcription, so the defaults bound spend rather than maximise throughput.
func DefaultImportPolicy() ImportPolicy {
	return ImportPolicy{
		MaxAttempts:    meals.MaxImportAttempts,
		RateLimit:      10,
		RateWindow:     time.Hour,
		StaleAfter:     2 * time.Minute,
		RunningTimeout: 15 * time.Minute,
	}
}

func (p ImportPolicy) withDefaults() ImportPolicy {
	defaults := DefaultImportPolicy()
	if p.MaxAttempts <= 0 {
		p.MaxAttempts = defaults.MaxAttempts
	}
	if p.RateLimit <= 0 {
		p.RateLimit = defaults.RateLimit
	}
	if p.RateWindow <= 0 {
		p.RateWindow = defaults.RateWindow
	}
	if p.StaleAfter <= 0 {
		p.StaleAfter = defaults.StaleAfter
	}
	if p.RunningTimeout <= 0 {
		p.RunningTimeout = defaults.RunningTimeout
	}
	return p
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

	// ErrRateLimited is returned when a user has started too many imports in
	// the policy window. Each one costs a transcription, so this bounds a
	// runaway loop or an abusive client rather than punishing a normal user.
	ErrRateLimited = errors.New("too many recipe imports started recently")
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
	catalog   CatalogLoader
	policy    ImportPolicy
	log       *slog.Logger
	newID     func() string
	now       func() time.Time

	// resolveUser turns the verified token into the viewer's user id. It is a
	// function rather than the users service itself so that the ownership and
	// lifecycle rules below can be tested without a database — they are the
	// part of this module that must not be got wrong.
	resolveUser func(ctx context.Context, identity auth.Identity) (string, error)
}

func NewImportService(
	repo ImportRepository,
	usersService *users.Service,
	extractor Extractor,
	catalogService CatalogLoader,
	policy ImportPolicy,
	logger *slog.Logger,
) *ImportService {
	if logger == nil {
		logger = slog.Default()
	}
	return &ImportService{
		repo:      repo,
		extractor: extractor,
		catalog:   catalogService,
		policy:    policy.withDefaults(),
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

	if err := s.checkRateLimit(ctx, userID); err != nil {
		return meals.RecipeImport{}, err
	}

	imp, err := s.repo.CreateRecipeImport(ctx, meals.RecipeImport{
		ID:             s.newID(),
		UserID:         userID,
		SourceURL:      sourceURL,
		SourcePlatform: platform,
		Language:       language,
		AttemptCount:   1,
	})
	if err != nil {
		// A live import of the same video already exists: the unique index
		// refused a second one rather than buying a second transcription.
		return meals.RecipeImport{}, err
	}

	s.log.InfoContext(ctx, "recipe import queued",
		slog.String("import_id", imp.ID),
		slog.String("platform", imp.SourcePlatform),
	)
	return s.startExtraction(ctx, imp), nil
}

// checkRateLimit bounds what one user can spend. The count is of imports
// started, not of imports that succeeded: a video that fails still cost a
// transcription to find that out.
func (s *ImportService) checkRateLimit(ctx context.Context, userID string) error {
	started, err := s.repo.CountRecipeImportsSince(ctx, userID, s.now().Add(-s.policy.RateWindow))
	if err != nil {
		return err
	}
	if started >= s.policy.RateLimit {
		s.log.WarnContext(ctx, "recipe import rate limited",
			slog.String("user_id", userID),
			slog.Int("started_in_window", started),
			slog.Int("limit", s.policy.RateLimit),
		)
		return ErrRateLimited
	}
	return nil
}

// startExtraction asks the extraction service to begin, and records what
// happened. Shared by the first attempt and by every retry, so a retry cannot
// drift from a first attempt in how it is recorded.
func (s *ImportService) startExtraction(ctx context.Context, imp meals.RecipeImport) meals.RecipeImport {
	job, err := s.extractor.Start(ctx, transcriber.StartRequest{
		URL:      imp.SourceURL,
		Language: imp.Language,
		// For the extraction service's logs only. It has no user table, and
		// nothing it returns is trusted to say who an import belongs to.
		OwnerUserID: imp.UserID,
	})
	if err != nil {
		return s.failFrom(ctx, imp, err)
	}

	started, err := s.repo.StartRecipeImport(ctx, imp.ID, job.ID)
	if err != nil {
		// Cancelled while the start request was in flight, or already moved on.
		// Either way the stored record is the truth, not this reply.
		if !db.IsNotFound(err) {
			s.log.ErrorContext(ctx, "could not record import start",
				slog.String("import_id", imp.ID), slog.String("error", err.Error()))
		}
		return imp
	}
	return s.settleFromJob(ctx, started, job)
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
func (s *ImportService) Accept(ctx context.Context, identity auth.Identity, importID string, patch AcceptPatch) (meals.Recipe, error) {
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

	// The reviewer's corrections, then a fresh resolution against the
	// catalogue. Eligibility is never taken from the client and never carried
	// over from extraction: it is recomputed from what is now known.
	if !patch.Empty() {
		catalog, err := s.loadCatalog(ctx)
		if err != nil {
			return meals.Recipe{}, err
		}
		patched, err := applyPatch(draft, patch, catalog)
		if err != nil {
			return meals.Recipe{}, err
		}
		draft = meals.ResolveAgainstCatalog(patched, catalog)
	}
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
			return s.retryOrFail(ctx, imp, "PROVIDER_ERROR", "The extraction finished without returning a recipe.")
		}

		// The recipe id is minted now, so the draft can be referred to before
		// it is saved and so accepting it is an upsert rather than an insert.
		recipe := job.Draft.ToRecipe(s.newID(), imp.UserID)

		resolved, err := s.resolve(ctx, recipe)
		if err != nil {
			// Storing a draft resolved against a catalogue we could not read
			// would record every line as unknown and permanently mark the
			// recipe unplannable. Better to try again.
			s.log.ErrorContext(ctx, "could not load catalogue to resolve import",
				slog.String("import_id", imp.ID), slog.String("error", err.Error()))
			return s.retryOrFail(ctx, imp, "PROVIDER_ERROR", "The recipe could not be checked against the ingredient catalogue.")
		}

		completed, err := s.repo.CompleteRecipeImport(ctx, imp.ID, resolved)
		if err != nil {
			if !db.IsNotFound(err) {
				s.log.ErrorContext(ctx, "could not store recipe draft",
					slog.String("import_id", imp.ID), slog.String("error", err.Error()))
			}
			return imp
		}
		s.log.InfoContext(ctx, "recipe import extracted",
			slog.String("import_id", imp.ID),
			slog.Bool("plannable", resolved.BaseMealPlanEligible),
			slog.Int("missing", len(resolved.MissingInformation)),
		)
		return completed

	case transcriber.StatusFailed:
		if failure := job.Failure(); failure != nil {
			return s.retryOrFail(ctx, imp, failure.Code, failure.Message)
		}
		return s.retryOrFail(ctx, imp, "PROVIDER_ERROR", "The extraction failed without saying why.")

	default:
		return imp
	}
}

// resolve matches the extracted lines against the canonical catalogue.
//
// This is where IngredientID and Grams are filled in, and the only place
// BaseMealPlanEligible is ever widened — an extractor's opinion that a recipe
// is complete means nothing until every line it must buy and scale is one the
// system actually knows. Quantities, times and nutrition are untouched here:
// resolution records what is known, it does not supply what is missing.
func (s *ImportService) resolve(ctx context.Context, recipe meals.Recipe) (meals.Recipe, error) {
	catalog, err := s.loadCatalog(ctx)
	if err != nil {
		return meals.Recipe{}, err
	}
	if catalog == nil {
		// No catalogue configured: leave the draft exactly as extracted, which
		// keeps it unplannable rather than falsely complete.
		return recipe, nil
	}
	return meals.ResolveAgainstCatalog(recipe, catalog), nil
}

func (s *ImportService) loadCatalog(ctx context.Context) (*meals.Catalog, error) {
	if s.catalog == nil {
		return nil, nil
	}
	return s.catalog.Load(ctx, defaultPriceScope)
}

// retryOrFail spends another attempt on a transient failure, and settles
// permanently on anything else.
//
// A video that is private stays private and a video that is too long stays too
// long: retrying those buys the same answer twice. Only a provider fault is
// worth another transcription, and only while the attempt budget lasts.
func (s *ImportService) retryOrFail(ctx context.Context, imp meals.RecipeImport, code string, message string) meals.RecipeImport {
	if !retryableCode(code) {
		return s.fail(ctx, imp, code, message)
	}

	requeued, err := s.repo.RetryRecipeImport(ctx, imp.ID, s.policy.MaxAttempts)
	if err != nil {
		if db.IsNotFound(err) {
			// Out of attempts, or already settled. The budget guard is in SQL,
			// so this is the definitive answer rather than a race.
			return s.fail(ctx, imp, code, message)
		}
		s.log.ErrorContext(ctx, "could not requeue import",
			slog.String("import_id", imp.ID), slog.String("error", err.Error()))
		return imp
	}

	s.log.InfoContext(ctx, "recipe import requeued",
		slog.String("import_id", imp.ID),
		slog.String("after", code),
		slog.Int("attempt", requeued.AttemptCount),
	)
	return requeued
}

// retryableCode mirrors transcriber.ServiceError.Retryable for a code that has
// already been stored, so the rule lives in one place conceptually even though
// the value has crossed the database.
func retryableCode(code string) bool {
	return (&transcriber.ServiceError{Code: code}).Retryable()
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

// Process advances one import as far as it can go right now.
//
// This is the durable path: the worker calls it for imports that have gone
// quiet, so an import finishes whether or not anybody is watching it. It is
// safe to call repeatedly and safe to call concurrently — every state change
// it makes is a guarded UPDATE, so a second caller doing the same work loses
// harmlessly rather than double-settling the import.
func (s *ImportService) Process(ctx context.Context, imp meals.RecipeImport) meals.RecipeImport {
	if !s.Enabled() || imp.Settled() {
		return imp
	}

	// Queued: either never started, or requeued by a retry.
	if imp.ProviderJobID == nil {
		return s.startExtraction(ctx, imp)
	}

	job, err := s.extractor.Job(ctx, *imp.ProviderJobID)
	if err != nil {
		if errors.Is(err, transcriber.ErrJobNotFound) {
			// The extraction service has no record of this job. Its store is
			// in memory, so this is what a restart there looks like from here:
			// the work is gone and will never finish on its own.
			return s.retryOrFail(ctx, imp, "PROVIDER_ERROR",
				"The extraction was interrupted. Trying again.")
		}
		// Unreachable for now. Leave it; the next sweep will try again, and
		// the running timeout below is the backstop if it never recovers.
		if s.stuck(imp) {
			return s.retryOrFail(ctx, imp, "PROVIDER_ERROR",
				"The extraction did not finish in time.")
		}
		return imp
	}

	settled := s.settleFromJob(ctx, imp, job)

	// Still running after the poll, and running for too long: the extraction
	// service is answering but not progressing, so nothing will change on its
	// own. Deterministic outcome rather than a row that stays running forever.
	if settled.Live() && s.stuck(settled) {
		return s.retryOrFail(ctx, settled, "PROVIDER_ERROR",
			"The extraction did not finish in time.")
	}
	return settled
}

// stuck reports whether an import has been running longer than the policy
// allows. It measures from when the attempt started, not from updated_at,
// because the worker touches updated_at when it claims a row — timing
// stuckness by that would reset the clock every sweep.
func (s *ImportService) stuck(imp meals.RecipeImport) bool {
	since := imp.CreatedAt
	if imp.StartedAt != nil {
		since = *imp.StartedAt
	}
	if since.IsZero() {
		return false
	}
	return s.now().Sub(since) > s.policy.RunningTimeout
}

// Sweep advances every import that has gone quiet, and reports how many it
// touched. One pass, so it can be driven by a worker or called directly.
func (s *ImportService) Sweep(ctx context.Context, batch int) (int, error) {
	if !s.Enabled() {
		return 0, nil
	}

	claimed, err := s.repo.ClaimStaleRecipeImports(ctx, s.now().Add(-s.policy.StaleAfter), batch)
	if err != nil {
		return 0, err
	}

	for _, imp := range claimed {
		// One slow import must not hold up the rest of the sweep, and a
		// cancelled context must stop it promptly.
		if ctx.Err() != nil {
			break
		}
		s.Process(ctx, imp)
	}
	return len(claimed), nil
}

// ImportPolicyFromEnv reads the tunable limits, falling back to the defaults
// for anything unset. The defaults are deliberately conservative: every
// attempt buys a transcription.
func ImportPolicyFromEnv() ImportPolicy {
	return ImportPolicy{
		MaxAttempts:    intEnv("RECIPE_IMPORT_MAX_ATTEMPTS", 0),
		RateLimit:      intEnv("RECIPE_IMPORT_RATE_LIMIT", 0),
		RateWindow:     durationEnv("RECIPE_IMPORT_RATE_WINDOW", 0),
		StaleAfter:     durationEnv("RECIPE_IMPORT_STALE_AFTER", 0),
		RunningTimeout: durationEnv("RECIPE_IMPORT_RUNNING_TIMEOUT", 0),
	}.withDefaults()
}

func intEnv(key string, fallback int) int {
	parsed, err := strconv.Atoi(strings.TrimSpace(os.Getenv(key)))
	if err != nil || parsed <= 0 {
		return fallback
	}
	return parsed
}

func durationEnv(key string, fallback time.Duration) time.Duration {
	parsed, err := time.ParseDuration(strings.TrimSpace(os.Getenv(key)))
	if err != nil || parsed <= 0 {
		return fallback
	}
	return parsed
}

// Ready probes the extraction service.
//
// A disabled import is ready by definition: the server is expected to run
// without one, and reports the feature unavailable rather than failing.
func (s *ImportService) Ready(ctx context.Context) error {
	if !s.Enabled() {
		return nil
	}
	prober, ok := s.extractor.(interface{ Ready(context.Context) error })
	if !ok {
		return nil
	}
	return prober.Ready(ctx)
}
