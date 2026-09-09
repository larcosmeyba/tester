// Package generator is the seam between the meal system and whichever AI
// provider Help The Hive uses.
//
// The architecture is deliberate: the mobile app talks to the Help The Hive
// backend, the backend talks to this package, and only this package talks to a
// provider. The app never holds a provider key, never sees a prompt, and never
// calls a model directly.
//
// Nothing here decides what a user may eat. The deterministic engine has
// already chosen and priced the week before a provider is called; a provider
// only writes the sentence that explains it, and its output is validated before
// anyone sees it.
package provider

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"time"
)

// Request is what a provider is asked for. It carries no user identity: see
// prompt.go for what a fact sheet is allowed to contain.
type Request struct {
	System string
	User   string
	// Hard cap on the reply, enforced again on the response.
	MaxTokens int
}

type Response struct {
	Text string
	// Which provider and model answered, for logs and support. Never a key.
	Provider string
	Model    string
}

// Provider is the only interface the meal service knows about. Adding a vendor
// means adding an implementation here, not changing the service.
type Provider interface {
	Name() string
	Complete(ctx context.Context, request Request) (Response, error)
}

// ErrNoProvider means no provider is configured. It is not a failure: the
// service falls back to its deterministic text and the plan is unaffected.
var ErrNoProvider = errors.New("no AI provider configured")

// Disabled is the default. Help The Hive runs correctly with no AI provider at
// all — the plan, its costs and its grocery list are computed without one.
type Disabled struct{}

func (Disabled) Name() string { return "disabled" }

func (Disabled) Complete(context.Context, Request) (Response, error) {
	return Response{}, ErrNoProvider
}

// Config selects and configures a provider from the environment. The key is
// read here, on the server, and is never returned, logged or sent anywhere but
// the provider's own endpoint.
type Config struct {
	// "disabled" (default) or "openai_compatible".
	Kind    string
	BaseURL string
	Model   string
	apiKey  string
	Timeout time.Duration
}

// LoadConfig reads the provider settings. MEAL_AI_PROVIDER is unset in every
// environment that has not deliberately turned a provider on.
func LoadConfig() Config {
	timeout := 20 * time.Second
	return Config{
		Kind:    strings.TrimSpace(os.Getenv("MEAL_AI_PROVIDER")),
		BaseURL: strings.TrimSpace(os.Getenv("MEAL_AI_BASE_URL")),
		Model:   strings.TrimSpace(os.Getenv("MEAL_AI_MODEL")),
		apiKey:  strings.TrimSpace(os.Getenv("MEAL_AI_API_KEY")),
		Timeout: timeout,
	}
}

// New builds the configured provider. A misconfigured provider is reported as
// an error at start-up rather than failing silently on the first plan.
func New(cfg Config) (Provider, error) {
	switch cfg.Kind {
	case "", "disabled":
		return Disabled{}, nil
	case "openai_compatible":
		if cfg.BaseURL == "" || cfg.Model == "" || cfg.apiKey == "" {
			return nil, errors.New("MEAL_AI_BASE_URL, MEAL_AI_MODEL and MEAL_AI_API_KEY are required when MEAL_AI_PROVIDER is set")
		}
		return &httpProvider{cfg: cfg, client: &http.Client{Timeout: cfg.Timeout}}, nil
	default:
		return nil, fmt.Errorf("unknown MEAL_AI_PROVIDER %q", cfg.Kind)
	}
}

// httpProvider speaks the widely implemented chat-completions shape, so the
// vendor is a base URL and a model name rather than a code change. Help The
// Hive is not bound to any one AI company by this file.
type httpProvider struct {
	cfg    Config
	client *http.Client
}

func (p *httpProvider) Name() string { return "openai_compatible" }

func (p *httpProvider) Complete(ctx context.Context, request Request) (Response, error) {
	body, err := json.Marshal(map[string]any{
		"model": p.cfg.Model,
		"messages": []map[string]string{
			{"role": "system", "content": request.System},
			{"role": "user", "content": request.User},
		},
		"max_tokens":  request.MaxTokens,
		"temperature": 0.2,
	})
	if err != nil {
		return Response{}, err
	}

	endpoint := strings.TrimSuffix(p.cfg.BaseURL, "/") + "/chat/completions"
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(body))
	if err != nil {
		return Response{}, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+p.cfg.apiKey)

	res, err := p.client.Do(req)
	if err != nil {
		return Response{}, err
	}
	defer res.Body.Close()

	// The body is capped: a provider is not trusted to bound its own reply.
	raw, err := io.ReadAll(io.LimitReader(res.Body, 64*1024))
	if err != nil {
		return Response{}, err
	}
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		// The provider's body may echo the prompt, so it is not included.
		return Response{}, fmt.Errorf("ai provider returned status %d", res.StatusCode)
	}

	var decoded struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
	}
	if err := json.Unmarshal(raw, &decoded); err != nil {
		return Response{}, errors.New("ai provider returned a response that could not be parsed")
	}
	if len(decoded.Choices) == 0 {
		return Response{}, errors.New("ai provider returned no content")
	}
	return Response{
		Text:     decoded.Choices[0].Message.Content,
		Provider: p.Name(),
		Model:    p.cfg.Model,
	}, nil
}
