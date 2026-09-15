package serverhttp

import (
	"context"
	"log/slog"
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

func NewRouter(cfg config.Config, verifier *auth.Verifier, readiness readinessChecker, resolver *hthgraphql.Resolver, pennyDeps PennyDeps, jobs JobsDeps, logger *slog.Logger) http.Handler {
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
	// Sanitize errors: internal details are logged server-side and replaced
	// with a generic message; only explicitly marked errors reach clients.
	gql.SetErrorPresenter(newErrorPresenter(logger))
	if cfg.IsDevelopment() {
		gql.Use(extension.Introspection{})
	}
	// Rate limiting runs before auth so abusive unauthenticated traffic is
	// throttled too. The bucket key is the client IP (see RealIP above).
	gqlChain := make([]func(http.Handler) http.Handler, 0, 2)
	if limiter := newIPRateLimiter(cfg.RateLimitPerMinute); limiter != nil {
		gqlChain = append(gqlChain, limiter.middleware())
	}
	gqlChain = append(gqlChain, auth.Middleware(verifier))
	router.With(gqlChain...).Handle("/graphql", gql)

	// Generated benefits PDFs are the one thing this API returns as bytes.
	// Behind the same auth middleware as /graphql, and scoped to the viewer by
	// the service — never a public or signed link to somebody's application.
	router.With(auth.Middleware(verifier)).
		Get("/benefits/applications/{applicationID}/pdf", BenefitsDocuments(resolver.Benefits, nil))

	// Magic verification links (signup). Unauthenticated by design: the
	// single-use token in the URL is the credential. No rate limiting beyond
	// the token's own single-use + 24h expiry — a forged token just renders
	// the "link unavailable" page.
	router.Get("/auth/verify", VerifyEmailLink(resolver.Users, cfg.PublicBaseURL, logger))
	// iOS universal-link / Android app-link association files. Scoped to
	// /auth/verified* so the token-bearing /auth/verify link keeps opening
	// in the browser. Served only when the signing identities are
	// configured (APPLE_TEAM_ID / ANDROID_SHA256_FINGERPRINTS).
	router.Get("/.well-known/apple-app-site-association", WellKnownLinks(cfg, logger))
	router.Get("/.well-known/assetlinks.json", WellKnownLinks(cfg, logger))
	// Browser fallback for the universal link: when the app isn't installed
	// the OS leaves https://<host>/auth/verified?flow=signup in the browser.
	router.Get("/auth/verified", VerifyAppFallback(logger))

	// Penny. Two mounts, because the two callers are not the same kind of
	// thing. /penny is a person holding a bearer token. /internal/penny/tools
	// is the agent calling back with a token this server minted for one turn —
	// outside the user auth middleware, because the agent has no user token and
	// must never be given one. The path says "internal" so that anyone reading
	// an access log, a proxy config or an ingress rule can see it is not a
	// client route.
	if pennyDeps.Service != nil {
		router.With(auth.Middleware(verifier)).Route("/penny", PennyRoutes(pennyDeps))
		router.Post("/internal/penny/tools", PennyToolGateway(pennyDeps))
	}

	// Benefits renewal sweep. Internal-only: authenticated with the shared job
	// secret (Cloud Scheduler), never with a user token. The sweep is
	// idempotent, so scheduler retries are safe.
	router.Post("/internal/jobs/benefits-renewal-sweep", BenefitsRenewalSweep(jobs, logger))

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
