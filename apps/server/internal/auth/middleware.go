package auth

import (
	"context"
	"net/http"
	"strings"
)

type tokenVerifier interface {
	Verify(ctx context.Context, token string) (Identity, error)
}

func Middleware(verifier tokenVerifier) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			header := strings.TrimSpace(r.Header.Get("Authorization"))
			if header == "" {
				http.Error(w, "missing bearer token", http.StatusUnauthorized)
				return
			}

			prefix := "Bearer "
			if !strings.HasPrefix(header, prefix) {
				http.Error(w, "invalid authorization header", http.StatusUnauthorized)
				return
			}

			identity, err := verifier.Verify(r.Context(), strings.TrimSpace(strings.TrimPrefix(header, prefix)))
			if err != nil {
				http.Error(w, "invalid bearer token", http.StatusUnauthorized)
				return
			}

			next.ServeHTTP(w, r.WithContext(ContextWithIdentity(r.Context(), identity)))
		})
	}
}
