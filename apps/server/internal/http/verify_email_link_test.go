package serverhttp

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// The verify-link handler's edge paths, without a database: a missing token
// and a missing service both render the branded error page instead of
// crashing or leaking internals.

func TestVerifyEmailLinkMissingToken(t *testing.T) {
	request := httptest.NewRequest(http.MethodGet, "/auth/verify", nil)
	recorder := httptest.NewRecorder()

	VerifyEmailLink(nil, "https://example.com", nil)(recorder, request)

	if recorder.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want %d", recorder.Code, http.StatusBadRequest)
	}
	body := recorder.Body.String()
	if !strings.Contains(body, "Link unavailable") {
		t.Fatalf("body does not explain the missing token: %q", body)
	}
	if contentType := recorder.Header().Get("Content-Type"); !strings.Contains(contentType, "text/html") {
		t.Fatalf("Content-Type = %q, want text/html", contentType)
	}
}

func TestVerifyEmailLinkMissingService(t *testing.T) {
	request := httptest.NewRequest(http.MethodGet, "/auth/verify?token=abc123", nil)
	recorder := httptest.NewRecorder()

	VerifyEmailLink(nil, "https://example.com", nil)(recorder, request)

	if recorder.Code != http.StatusServiceUnavailable {
		t.Fatalf("status = %d, want %d", recorder.Code, http.StatusServiceUnavailable)
	}
	if strings.Contains(recorder.Body.String(), "postgres") || strings.Contains(recorder.Body.String(), "panic") {
		t.Fatalf("body leaks internals: %q", recorder.Body.String())
	}
}

func TestVerifyEmailLinkRejectsPost(t *testing.T) {
	request := httptest.NewRequest(http.MethodPost, "/auth/verify?token=abc123", nil)
	recorder := httptest.NewRecorder()

	VerifyEmailLink(nil, "https://example.com", nil)(recorder, request)

	if recorder.Code != http.StatusMethodNotAllowed {
		t.Fatalf("status = %d, want %d", recorder.Code, http.StatusMethodNotAllowed)
	}
}
