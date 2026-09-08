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
	"github.com/helpthehive/server/internal/modules/recipes"
	"github.com/helpthehive/server/internal/modules/users"
	"github.com/helpthehive/server/internal/transcriber"
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
	pantryService := pantry.NewService(store, userService)
	catalogService := catalog.NewService(store)
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
	recipeImportService := recipes.NewImportService(store, userService, extractor, logger)

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
		Handler:           serverhttp.NewRouter(cfg, verifier, serverhttp.StoreReadiness{Store: store}, resolver),
		ReadHeaderTimeout: 5 * time.Second,
	}

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
