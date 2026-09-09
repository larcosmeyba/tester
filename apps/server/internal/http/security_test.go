package serverhttp

import (
	"context"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/helpthehive/server/internal/apperrors"
	"github.com/vektah/gqlparser/v2/gqlerror"
)

func TestRateLimiterAllowsThenRejects(t *testing.T) {
	limiter := newIPRateLimiter(3)
	if limiter == nil {
		t.Fatal("limiter should not be nil")
	}
	next := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusOK) })
	h := limiter.middleware()(next)

	var lastRetryAfter string
	for i := 0; i < 5; i++ {
		req := httptest.NewRequest(http.MethodPost, "/graphql", nil)
		req.RemoteAddr = "203.0.113.7:1234"
		resp := httptest.NewRecorder()
		h.ServeHTTP(resp, req)
		if i < 3 && resp.Code != http.StatusOK {
			t.Fatalf("request %d: status = %d, want 200", i, resp.Code)
		}
		if i >= 3 {
			if resp.Code != http.StatusTooManyRequests {
				t.Fatalf("request %d: status = %d, want 429", i, resp.Code)
			}
			lastRetryAfter = resp.Header().Get("Retry-After")
		}
	}
	if lastRetryAfter == "" {
		t.Fatal("429 response missing Retry-After header")
	}
}

func TestRateLimiterDisabled(t *testing.T) {
	if newIPRateLimiter(0) != nil {
		t.Fatal("perMinute=0 should disable the limiter")
	}
	if newIPRateLimiter(-5) != nil {
		t.Fatal("negative perMinute should disable the limiter")
	}
}

func TestErrorPresenterSanitizesInternal(t *testing.T) {
	presenter := newErrorPresenter(slog.Default())
	ctx := context.Background()

	internal := presenter(ctx, errTestInternal)
	if internal.Message != "internal server error" {
		t.Fatalf("internal error message = %q, want sanitized", internal.Message)
	}

	pub := presenter(ctx, apperrors.Public("name is required"))
	if pub.Message != "name is required" {
		t.Fatalf("public error message = %q, want passthrough", pub.Message)
	}

	curated := presenter(ctx, &gqlerror.Error{Message: "curated", Extensions: map[string]any{"code": "X"}})
	if curated.Message != "curated" {
		t.Fatalf("curated error message = %q, want passthrough", curated.Message)
	}
}

var errTestInternal = &testInternalError{}

type testInternalError struct{}

func (e *testInternalError) Error() string {
	return `failed to connect to db: host=secret user=admin database=prod`
}

func TestErrorPresenterHidesLeakString(t *testing.T) {
	presenter := newErrorPresenter(slog.Default())
	got := presenter(context.Background(), errTestInternal)
	if strings.Contains(got.Message, "secret") || strings.Contains(got.Message, "host=") {
		t.Fatalf("sanitized message leaks internals: %q", got.Message)
	}
}
