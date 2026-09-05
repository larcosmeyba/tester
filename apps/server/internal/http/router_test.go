package serverhttp

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/helpthehive/server/internal/config"
	hthgraphql "github.com/helpthehive/server/internal/graphql"
)

func TestOriginAllowed(t *testing.T) {
	allowed := []string{"http://localhost:8081", "exp://*", "https://app.example.com"}
	tests := []struct {
		origin string
		want   bool
	}{
		{origin: "http://localhost:8081", want: true},
		{origin: "exp://192.168.1.10:8081", want: true},
		{origin: "https://app.example.com", want: true},
		{origin: "https://evil.example.com", want: false},
	}

	for _, tt := range tests {
		if got := originAllowed(tt.origin, allowed); got != tt.want {
			t.Fatalf("originAllowed(%q) = %v, want %v", tt.origin, got, tt.want)
		}
	}
}

func TestGraphQLRequiresBearerToken(t *testing.T) {
	router := NewRouter(
		config.Config{AppEnv: "test"},
		nil,
		readyFunc(func(context.Context) error { return nil }),
		&hthgraphql.Resolver{},
	)

	req := httptest.NewRequest(http.MethodPost, "/graphql", strings.NewReader(`{"query":"{ viewer { user { id } } }"}`))
	req.Header.Set("Content-Type", "application/json")
	resp := httptest.NewRecorder()

	router.ServeHTTP(resp, req)

	if resp.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want %d", resp.Code, http.StatusUnauthorized)
	}
}

type readyFunc func(context.Context) error

func (f readyFunc) Ping(ctx context.Context) error {
	return f(ctx)
}
