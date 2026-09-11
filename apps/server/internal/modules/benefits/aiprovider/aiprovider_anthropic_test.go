package aiprovider

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestNewAnthropicAppliesDefaults(t *testing.T) {
	p, err := New(Config{Kind: "anthropic", apiKey: "sk-ant-test"})
	if err != nil {
		t.Fatalf("New returned error: %v", err)
	}
	ap, ok := p.(*anthropicProvider)
	if !ok {
		t.Fatalf("expected *anthropicProvider, got %T", p)
	}
	if ap.cfg.BaseURL != "https://api.anthropic.com" {
		t.Errorf("BaseURL default = %q, want https://api.anthropic.com", ap.cfg.BaseURL)
	}
	if ap.cfg.Model != "claude-haiku-4-5" {
		t.Errorf("Model default = %q, want claude-haiku-4-5", ap.cfg.Model)
	}
	if got := p.Name(); got != "anthropic" {
		t.Errorf("Name() = %q, want anthropic", got)
	}
}

func TestNewAnthropicHonorsOverrides(t *testing.T) {
	p, err := New(Config{
		Kind:    "anthropic",
		BaseURL: "https://proxy.example.com/",
		Model:   "claude-sonnet-5",
		apiKey:  "sk-ant-test",
	})
	if err != nil {
		t.Fatalf("New returned error: %v", err)
	}
	ap := p.(*anthropicProvider)
	if ap.cfg.BaseURL != "https://proxy.example.com/" {
		t.Errorf("BaseURL = %q, want the explicit override kept", ap.cfg.BaseURL)
	}
	if ap.cfg.Model != "claude-sonnet-5" {
		t.Errorf("Model = %q, want the explicit override kept", ap.cfg.Model)
	}
}

func TestNewAnthropicRequiresKey(t *testing.T) {
	if _, err := New(Config{Kind: "anthropic"}); err == nil {
		t.Error("expected an error when BENEFITS_AI_API_KEY is missing, got nil")
	}
}

func TestNewProviderSelection(t *testing.T) {
	for _, kind := range []string{"", "disabled"} {
		p, err := New(Config{Kind: kind})
		if err != nil {
			t.Fatalf("New(%q) returned error: %v", kind, err)
		}
		if _, ok := p.(Disabled); !ok {
			t.Errorf("New(%q) = %T, want Disabled", kind, p)
		}
	}
	if _, err := New(Config{Kind: "bogus"}); err == nil {
		t.Error("expected an error for an unknown BENEFITS_AI_PROVIDER, got nil")
	}
}

// anthropicRoundTrip runs Complete against a fake Messages API and records
// what the provider sent.
func anthropicRoundTrip(t *testing.T, request Request, handler http.HandlerFunc) (Response, http.Header, map[string]any) {
	t.Helper()

	var gotHeader http.Header
	var gotBody map[string]any
	var gotMethod, gotPath string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotMethod, gotPath = r.Method, r.URL.Path
		gotHeader = r.Header.Clone()
		if err := json.NewDecoder(r.Body).Decode(&gotBody); err != nil {
			t.Errorf("decoding request body: %v", err)
		}
		handler(w, r)
	}))
	defer srv.Close()

	p, err := New(Config{Kind: "anthropic", apiKey: "sk-ant-test", BaseURL: srv.URL})
	if err != nil {
		t.Fatalf("New returned error: %v", err)
	}
	resp, err := p.Complete(context.Background(), request)
	if err != nil {
		t.Fatalf("Complete returned error: %v", err)
	}
	if gotMethod != http.MethodPost || gotPath != "/v1/messages" {
		t.Errorf("request = %s %s, want POST /v1/messages", gotMethod, gotPath)
	}
	return resp, gotHeader, gotBody
}

func okAnthropicBody(text string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"content": []map[string]string{{"type": "text", "text": text}},
			"model":   "claude-haiku-4-5",
		})
	}
}

func TestAnthropicCompleteRequestShape(t *testing.T) {
	resp, header, body := anthropicRoundTrip(t,
		Request{System: "Propose field mappings.", User: "Map this form.", MaxTokens: 500},
		okAnthropicBody("field -> box 12"))

	if got := header.Get("x-api-key"); got != "sk-ant-test" {
		t.Errorf("x-api-key header = %q, want the configured key", got)
	}
	if got := header.Get("anthropic-version"); got != "2023-06-01" {
		t.Errorf("anthropic-version header = %q, want 2023-06-01", got)
	}
	if got := header.Get("Content-Type"); got != "application/json" {
		t.Errorf("Content-Type header = %q", got)
	}
	if body["model"] != "claude-haiku-4-5" {
		t.Errorf("body model = %v", body["model"])
	}
	if body["max_tokens"] != float64(500) {
		t.Errorf("body max_tokens = %v, want 500", body["max_tokens"])
	}
	// Anthropic takes the system prompt as a top-level field, not a message.
	if body["system"] != "Propose field mappings." {
		t.Errorf("body system = %v, want the system prompt as a top-level field", body["system"])
	}
	messages, ok := body["messages"].([]any)
	if !ok || len(messages) != 1 {
		t.Fatalf("body messages = %v, want a single user message", body["messages"])
	}
	msg, ok := messages[0].(map[string]any)
	if !ok || msg["role"] != "user" || msg["content"] != "Map this form." {
		t.Errorf("body messages[0] = %v, want role=user with the user prompt", messages[0])
	}

	if resp.Text != "field -> box 12" {
		t.Errorf("Text = %q", resp.Text)
	}
	if resp.Provider != "anthropic" || resp.Model != "claude-haiku-4-5" {
		t.Errorf("Provider/Model = %q/%q", resp.Provider, resp.Model)
	}
}

func TestAnthropicCompleteOmitsEmptySystem(t *testing.T) {
	_, _, body := anthropicRoundTrip(t,
		Request{User: "Map this form.", MaxTokens: 500},
		okAnthropicBody("Done."))
	if _, present := body["system"]; present {
		t.Errorf("body contains system = %v, want it omitted when empty", body["system"])
	}
}

func TestAnthropicCompleteErrors(t *testing.T) {
	tests := []struct {
		name   string
		status int
		body   string
	}{
		{"unauthorized", http.StatusUnauthorized, `{"type":"error","error":{"type":"authentication_error","message":"bad key"}}`},
		{"server error", http.StatusInternalServerError, `{"type":"error"}`},
		{"invalid json", http.StatusOK, `this is not json`},
		{"empty content", http.StatusOK, `{"content":[]}`},
		{"non-text first block", http.StatusOK, `{"content":[{"type":"thinking","thinking":"hmm"}]}`},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(tc.status)
				_, _ = w.Write([]byte(tc.body))
			}))
			defer srv.Close()

			p, err := New(Config{Kind: "anthropic", apiKey: "sk-ant-test", BaseURL: srv.URL})
			if err != nil {
				t.Fatalf("New returned error: %v", err)
			}
			if _, err := p.Complete(context.Background(), Request{User: "hi", MaxTokens: 10}); err == nil {
				t.Error("expected an error, got nil")
			}
		})
	}
}
