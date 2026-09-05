package serverhttp

import (
	"context"
	"net/http"
	"strings"

	"github.com/99designs/gqlgen/graphql/handler"
	"github.com/99designs/gqlgen/graphql/handler/extension"
	"github.com/99designs/gqlgen/graphql/playground"
	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/helpthehive/server/internal/auth"
	"github.com/helpthehive/server/internal/config"
	hthgraphql "github.com/helpthehive/server/internal/graphql"
	"github.com/helpthehive/server/internal/graphql/generated"
)

type readinessChecker interface {
	Ping(ctx context.Context) error
}

func NewRouter(cfg config.Config, verifier *auth.Verifier, readiness readinessChecker, resolver *hthgraphql.Resolver) http.Handler {
	router := chi.NewRouter()
	router.Use(middleware.RequestID)
	router.Use(middleware.RealIP)
	router.Use(middleware.Recoverer)
	router.Use(corsMiddleware(cfg.CORSAllowedOrigins))

	router.Get("/healthz", func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok\n"))
	})

	router.Get("/readyz", func(w http.ResponseWriter, r *http.Request) {
		if err := readiness.Ping(r.Context()); err != nil {
			http.Error(w, "not ready", http.StatusServiceUnavailable)
			return
		}
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ready\n"))
	})

	if cfg.IsDevelopment() {
		router.Get("/playground", playground.Handler("Help The Hive GraphQL", "/graphql"))
	}

	gql := handler.NewDefaultServer(generated.NewExecutableSchema(generated.Config{Resolvers: resolver}))
	if cfg.IsDevelopment() {
		gql.Use(extension.Introspection{})
	}
	router.With(auth.Middleware(verifier)).Handle("/graphql", gql)

	return router
}

func corsMiddleware(allowedOrigins []string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			origin := r.Header.Get("Origin")
			if origin != "" && originAllowed(origin, allowedOrigins) {
				w.Header().Set("Access-Control-Allow-Origin", origin)
				w.Header().Set("Vary", "Origin")
				w.Header().Set("Access-Control-Allow-Credentials", "true")
				w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type")
				w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
			}
			if r.Method == http.MethodOptions {
				w.WriteHeader(http.StatusNoContent)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

func originAllowed(origin string, allowedOrigins []string) bool {
	for _, allowed := range allowedOrigins {
		switch {
		case allowed == "*":
			return true
		case allowed == origin:
			return true
		case strings.HasSuffix(allowed, "*") && strings.HasPrefix(origin, strings.TrimSuffix(allowed, "*")):
			return true
		}
	}
	return false
}
