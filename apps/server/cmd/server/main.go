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

	store := db.NewStore(pool)
	userService := users.NewService(store)
	pantryService := pantry.NewService(store, userService)
	resolver := hthgraphql.NewResolver(userService, pantryService)
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
