package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/helpthehive/server/internal/auth"
	"github.com/helpthehive/server/internal/config"
	"github.com/helpthehive/server/internal/db"
	hthgraphql "github.com/helpthehive/server/internal/graphql"
	serverhttp "github.com/helpthehive/server/internal/http"
	"github.com/helpthehive/server/internal/modules/benefits"
	"github.com/helpthehive/server/internal/modules/catalog"
	"github.com/helpthehive/server/internal/modules/grocery"
	"github.com/helpthehive/server/internal/modules/mealgen"
	"github.com/helpthehive/server/internal/modules/mealgen/provider"
	"github.com/helpthehive/server/internal/modules/mealplans"
	"github.com/helpthehive/server/internal/modules/mealprep"
	"github.com/helpthehive/server/internal/modules/mealprofile"
	"github.com/helpthehive/server/internal/modules/pantry"
	pennymod "github.com/helpthehive/server/internal/modules/penny"
	pennytools "github.com/helpthehive/server/internal/modules/penny/tools"
	"github.com/helpthehive/server/internal/modules/recipes"
	"github.com/helpthehive/server/internal/modules/transcriber"
	"github.com/helpthehive/server/internal/modules/users"
)

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	if err := run(logger); err != nil {
		logger.Error("server stopped", "error", err)
		os.Exit(1)
	}
}

func run(logger *slog.Logger) error {
	cfg, err := config.Load()
	if err != nil {
		return err
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	pool, err := db.Connect(ctx, cfg.DatabaseURL)
	if err != nil {
		return err
	}
	defer pool.Close()

	// A misconfigured AI provider is a start-up failure, not a surprise on the
	// first meal plan. With no provider configured the meal system still works:
	// plans are built and priced deterministically.
	aiProvider, err := provider.New(provider.LoadConfig())
	if err != nil {
		return err
	}

	// One service per domain, wired here and nowhere else. Each takes only the
	// dependencies it declared, so what a module can reach is visible in this
	// list rather than hidden behind a shared service object.
	store := db.NewStore(pool)
	userService := users.NewService(store)
	catalogService := catalog.NewService(store)
	// The pantry resolves what a person types against the canonical catalogue,
	// server-side, so what they actually keep at home can reach the planner.
	pantryService := pantry.NewService(store, userService).WithResolver(catalogService, logger)
	recipesService := recipes.NewService(store, userService)

	// Video import is optional. With no extraction service configured the
	// server runs exactly as it does today and the import fields report
	// themselves unavailable, rather than the process refusing to start.
	// A configured-but-invalid service is still a start-up failure.
	var extractor recipes.Extractor
	if importCfg := transcriber.ConfigFromEnv(); importCfg.Configured() {
		client, err := transcriber.New(importCfg, transcriber.WithLogger(logger))
		if err != nil {
			return err
		}
		extractor = client
		logger.Info("recipe import enabled", "url", importCfg.BaseURL)
	} else {
		logger.Info("recipe import disabled", "reason", "RECIPE_IMPORT_URL not set")
	}
	recipeImportService := recipes.NewImportService(
		store, userService, extractor, catalogService, recipes.ImportPolicyFromEnv(), logger,
	)

	// No retailer handoff is configured. The grocery list is built entirely on
	// Help The Hive's own terms first, and a retailer — when there is one — is
	// handed that finished list rather than shaping it. Passing nil selects
	// retailer.Unconfigured, which reports the feature as unavailable.
	groceryService := grocery.NewService(store, userService, catalogService, nil)

	mealProfileService := mealprofile.NewService(store, userService)
	generatorService := mealgen.NewService(store, catalogService, aiProvider, logger)

	// The plan service completes a request from the user's saved questionnaire
	// answers and their pantry before generating. Both only ever fill in what
	// the client left unsaid.
	mealPlansService := mealplans.NewService(
		store, userService, generatorService, groceryService,
		mealProfileService, pantryService, logger,
	)
	mealPrepService := mealprep.NewService(store, userService, catalogService, groceryService)

	// A mapping file that does not match its official PDF is a start-up failure,
	// not a surprise halfway through somebody's application.
	benefitsService, err := benefits.New(benefits.LoadConfig(), store, userService, logger)
	if err != nil {
		return err
	}

	// Enforce the draft retention policy. Without this the purge exists on
	// paper only: every abandoned application stays in storage for good.
	benefitsService.StartRetentionSweep(ctx)

	// Penny is off unless an agent is configured, and Help The Hive runs
	// correctly with her off: the chat reports itself unavailable and nothing
	// else changes. A half-configured Penny is a start-up failure rather than a
	// surprise on somebody's first message.
	pennyDeps, err := buildPenny(cfg.Penny, store, userService, pantryService,
		mealPlansService, groceryService, benefitsService, logger)
	if err != nil {
		return err
	}

	resolver := hthgraphql.NewResolver(
		userService,
		pantryService,
		recipesService,
		recipeImportService,
		catalogService,
		mealPlansService,
		mealProfileService,
		mealPrepService,
		groceryService,
	).WithBenefits(benefitsService)
	verifier := auth.NewVerifier(auth.VerifierConfig{
		Issuer:   cfg.Auth.Issuer,
		Audience: cfg.Auth.Audience,
		JWKSURL:  cfg.Auth.JWKSURL,
	})

	server := &http.Server{
		Addr:              cfg.HTTPAddr,
		Handler:           serverhttp.NewRouter(cfg, verifier, serverhttp.StoreReadiness{Store: store}, resolver, pennyDeps, logger),
		ReadHeaderTimeout: 5 * time.Second,
	}

	// Probe the extraction service once at start-up so a misconfigured URL or
	// a bad secret is visible in the logs immediately, rather than on somebody's
	// first import. It is deliberately not fatal and deliberately not part of
	// /readyz: import is optional, and the rest of the API works without it.
	if recipeImportService.Enabled() {
		if err := recipeImportService.Ready(ctx); err != nil {
			logger.Warn("recipe import service is not ready", "error", err)
		} else {
			logger.Info("recipe import service is ready")
		}
	}

	// Imports must finish whether or not anybody is watching them. Without
	// this, closing the app mid-import leaves a row running forever, and an
	// extraction service restart strands every job it was holding.
	go recipes.NewImportWorker(recipeImportService, logger).Run(ctx)

	errCh := make(chan error, 1)
	go func() {
		logger.Info("starting server", "addr", cfg.HTTPAddr, "env", cfg.AppEnv)
		errCh <- server.ListenAndServe()
	}()

	select {
	case <-ctx.Done():
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		return server.Shutdown(shutdownCtx)
	case err := <-errCh:
		if errors.Is(err, http.ErrServerClosed) {
			return nil
		}
		return err
	}
}

// buildPenny wires the assistant, or reports that she is switched off.
//
// The list of services passed to the tool gateway is the list of things Penny
// can reach. It is written out here, one by one, rather than handed a shared
// container, so that widening what she can do is a visible line in this
// function instead of a side effect of adding a field somewhere else.
func buildPenny(
	cfg config.PennyConfig,
	store *db.Store,
	userService *users.Service,
	pantryService *pantry.Service,
	mealPlansService *mealplans.Service,
	groceryService *grocery.Service,
	benefitsService *benefits.Service,
	logger *slog.Logger,
) (serverhttp.PennyDeps, error) {
	if !cfg.Enabled() {
		logger.Info("penny disabled", "reason", "PENNY_AGENT_URL not set")
		return serverhttp.PennyDeps{}, nil
	}

	signer, err := pennymod.NewSigner(cfg.ToolTokenSecret)
	if err != nil {
		return serverhttp.PennyDeps{}, err
	}
	agent, err := pennymod.NewHTTPAgent(pennymod.AgentConfig{
		BaseURL:      cfg.AgentURL,
		ServiceToken: cfg.ServiceToken,
	})
	if err != nil {
		return serverhttp.PennyDeps{}, err
	}

	gateway := pennytools.NewGateway(pennytools.Services{
		Users:     userService,
		Pantry:    pantryService,
		MealPlans: mealPlansService,
		Grocery:   groceryService,
		Benefits:  benefitsService,
		Store:     store,
	}, logger)

	service := pennymod.NewService(
		store, userService, agent, signer,
		pennymod.NewLimiter(pennymod.DefaultLimits(), store),
		gateway, logger,
	)

	logger.Info("penny enabled", "agent", cfg.AgentURL)
	return serverhttp.PennyDeps{
		Service:      service,
		Store:        store,
		ServiceToken: cfg.ServiceToken,
		Logger:       logger,
	}, nil
}
