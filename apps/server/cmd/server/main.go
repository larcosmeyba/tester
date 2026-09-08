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
	"github.com/helpthehive/server/internal/modules/meals"
	"github.com/helpthehive/server/internal/modules/meals/generator"
	"github.com/helpthehive/server/internal/modules/pantry"
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
	aiProvider, err := generator.New(generator.LoadConfig())
	if err != nil {
		return err
	}

	store := db.NewStore(pool)
	userService := users.NewService(store)
	pantryService := pantry.NewService(store, userService)
	mealsService := meals.NewService(store, userService, aiProvider, logger)
	resolver := hthgraphql.NewResolver(userService, pantryService, mealsService)
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
