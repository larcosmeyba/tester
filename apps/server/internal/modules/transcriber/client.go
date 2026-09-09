package transcriber

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"
)

// Config is everything needed to reach the extraction service.
//
// BaseURL is the service's internal address — on Cloud Run it is reachable
// only from inside the VPC, which is what makes it safe for this client to
// assert who an import belongs to.
type Config struct {
	BaseURL      string
	SharedSecret string

	// Starting an import returns as soon as the job is accepted, so this is
	// short. Polling is shorter still.
	StartTimeout time.Duration
	PollTimeout  time.Duration

	// Attempts for reads only. Starting an import is never retried; see Start.
	MaxPollAttempts int
}

const (
	defaultStartTimeout    = 10 * time.Second
	defaultPollTimeout     = 5 * time.Second
	defaultMaxPollAttempts = 3
)

// ConfigFromEnv reads the service's settings.
//
// Both values are server secrets. Neither may ever appear in an EXPO_PUBLIC_*
// variable: anyone who installs the mobile app can read that bundle.
func ConfigFromEnv() Config {
	return Config{
		BaseURL:         strings.TrimSpace(os.Getenv("RECIPE_IMPORT_URL")),
		SharedSecret:    strings.TrimSpace(os.Getenv("IMPORT_SHARED_SECRET")),
		StartTimeout:    durationEnv("RECIPE_IMPORT_START_TIMEOUT", defaultStartTimeout),
		PollTimeout:     durationEnv("RECIPE_IMPORT_POLL_TIMEOUT", defaultPollTimeout),
		MaxPollAttempts: intEnv("RECIPE_IMPORT_POLL_ATTEMPTS", defaultMaxPollAttempts),
	}
}

// Configured reports whether video import is switched on. It is optional:
// with no URL the server runs exactly as it does today, and the resolvers
// report the feature as unavailable rather than failing at boot.
func (c Config) Configured() bool {
	return c.BaseURL != ""
}

func (c Config) validate() error {
	if c.BaseURL == "" {
		return errors.New("RECIPE_IMPORT_URL is required to enable recipe import")
	}
	if _, err := url.Parse(c.BaseURL); err != nil {
		return fmt.Errorf("RECIPE_IMPORT_URL is not a URL: %w", err)
	}
	if c.SharedSecret == "" {
		return errors.New("IMPORT_SHARED_SECRET is required to enable recipe import")
	}
	return nil
}

func (c Config) withDefaults() Config {
	if c.StartTimeout <= 0 {
		c.StartTimeout = defaultStartTimeout
	}
	if c.PollTimeout <= 0 {
		c.PollTimeout = defaultPollTimeout
	}
	if c.MaxPollAttempts <= 0 {
		c.MaxPollAttempts = defaultMaxPollAttempts
	}
	return c
}

type Client struct {
	cfg   Config
	http  *http.Client
	log   *slog.Logger
	sleep func(time.Duration)
}

type Option func(*Client)

// WithHTTPClient replaces the transport. Tests use it; so would a caller
// wanting connection pooling tuned differently.
func WithHTTPClient(hc *http.Client) Option {
	return func(c *Client) { c.http = hc }
}

func WithLogger(l *slog.Logger) Option {
	return func(c *Client) { c.log = l }
}

// withSleep makes backoff instant in tests.
func withSleep(fn func(time.Duration)) Option {
	return func(c *Client) { c.sleep = fn }
}

func New(cfg Config, opts ...Option) (*Client, error) {
	if err := cfg.validate(); err != nil {
		return nil, err
	}
	cfg = cfg.withDefaults()

	client := &Client{
		cfg: cfg,
		// No global timeout: each call sets its own from the context, so a
		// slow start cannot be cut short by a timeout meant for a poll.
		http:  &http.Client{},
		log:   slog.Default(),
		sleep: time.Sleep,
	}
	for _, opt := range opts {
		opt(client)
	}
	return client, nil
}

// Start asks for an extraction and returns as soon as the job is accepted.
//
// It is never retried. Starting an import is not idempotent — it spends a
// transcription — so a request whose response was lost must be resolved by
// looking for the job, not by asking for a second one. The unique index on
// recipe_imports over (user_id, source_url) for live imports is the other half
// of that guarantee.
func (c *Client) Start(ctx context.Context, req StartRequest) (Job, error) {
	ctx, cancel := context.WithTimeout(ctx, c.cfg.StartTimeout)
	defer cancel()

	body, err := json.Marshal(req)
	if err != nil {
		return Job{}, fmt.Errorf("encode import request: %w", err)
	}

	started := time.Now()
	job, err := c.do(ctx, http.MethodPost, "/v1/imports", body)
	if err != nil {
		c.log.ErrorContext(ctx, "recipe import failed to start",
			slog.String("source_url", req.URL),
			slog.Duration("took", time.Since(started)),
			slog.String("error", err.Error()),
		)
		return Job{}, err
	}

	c.log.InfoContext(ctx, "recipe import started",
		slog.String("provider_job_id", job.ID),
		slog.String("source_url", req.URL),
		slog.Duration("took", time.Since(started)),
	)
	return job, nil
}

// Job reports the current state of an import.
//
// This is a plain read, so it is safe to retry: transport failures and 5xx
// responses are retried with backoff, and everything else is returned as-is.
func (c *Client) Job(ctx context.Context, providerJobID string) (Job, error) {
	if strings.TrimSpace(providerJobID) == "" {
		return Job{}, ErrJobNotFound
	}
	path := "/v1/imports/" + url.PathEscape(providerJobID)

	var lastErr error
	for attempt := 1; attempt <= c.cfg.MaxPollAttempts; attempt++ {
		attemptCtx, cancel := context.WithTimeout(ctx, c.cfg.PollTimeout)
		job, err := c.do(attemptCtx, http.MethodGet, path, nil)
		cancel()

		if err == nil {
			return job, nil
		}
		lastErr = err

		if !worthRetrying(err) || attempt == c.cfg.MaxPollAttempts {
			break
		}
		// The parent context being done means the caller has given up; there
		// is no point sleeping to try again.
		if ctx.Err() != nil {
			break
		}
		c.sleep(backoff(attempt))
	}

	c.log.WarnContext(ctx, "recipe import status unavailable",
		slog.String("provider_job_id", providerJobID),
		slog.String("error", lastErr.Error()),
	)
	return Job{}, lastErr
}

// worthRetrying is true only for faults that are plausibly transient. A video
// that is unavailable will still be unavailable on the second ask.
func worthRetrying(err error) bool {
	if errors.Is(err, ErrUnavailable) {
		return true
	}
	var svcErr *ServiceError
	if errors.As(err, &svcErr) {
		return svcErr.Retryable()
	}
	return false
}

func backoff(attempt int) time.Duration {
	return time.Duration(attempt) * 250 * time.Millisecond
}

func (c *Client) do(ctx context.Context, method string, path string, body []byte) (Job, error) {
	var reader io.Reader
	if body != nil {
		reader = bytes.NewReader(body)
	}

	req, err := http.NewRequestWithContext(ctx, method, strings.TrimRight(c.cfg.BaseURL, "/")+path, reader)
	if err != nil {
		return Job{}, fmt.Errorf("build request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+c.cfg.SharedSecret)
	req.Header.Set("Accept", "application/json")
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}

	resp, err := c.http.Do(req)
	if err != nil {
		// Includes timeouts and connection failures: the service being
		// unreachable is not the video's fault, and is worth another try.
		return Job{}, fmt.Errorf("%w: %s", ErrUnavailable, err)
	}
	defer resp.Body.Close()

	// Bounded: a compromised or confused service must not be able to make the
	// API server read an unbounded body into memory.
	payload, err := io.ReadAll(io.LimitReader(resp.Body, 4<<20))
	if err != nil {
		return Job{}, fmt.Errorf("%w: reading response: %s", ErrUnavailable, err)
	}

	switch {
	case resp.StatusCode == http.StatusUnauthorized, resp.StatusCode == http.StatusForbidden:
		return Job{}, ErrUnauthorized
	case resp.StatusCode == http.StatusNotFound:
		return Job{}, ErrJobNotFound
	case resp.StatusCode >= 500:
		return Job{}, fmt.Errorf("%w: transcriber returned %d", ErrUnavailable, resp.StatusCode)
	case resp.StatusCode >= 400:
		if svcErr := decodeServiceError(payload); svcErr != nil {
			return Job{}, svcErr
		}
		return Job{}, fmt.Errorf("transcriber returned %d", resp.StatusCode)
	}

	var job Job
	if err := json.Unmarshal(payload, &job); err != nil {
		return Job{}, fmt.Errorf("%w: decoding response: %s", ErrUnavailable, err)
	}
	return job, nil
}

func decodeServiceError(payload []byte) *ServiceError {
	var envelope struct {
		Error struct {
			Code    string `json:"code"`
			Message string `json:"message"`
			Detail  string `json:"detail"`
		} `json:"error"`
	}
	if err := json.Unmarshal(payload, &envelope); err != nil || envelope.Error.Code == "" {
		return nil
	}
	return &ServiceError{
		Code:    envelope.Error.Code,
		Message: envelope.Error.Message,
		Detail:  envelope.Error.Detail,
	}
}

func durationEnv(key string, fallback time.Duration) time.Duration {
	raw := strings.TrimSpace(os.Getenv(key))
	if raw == "" {
		return fallback
	}
	parsed, err := time.ParseDuration(raw)
	if err != nil || parsed <= 0 {
		return fallback
	}
	return parsed
}

func intEnv(key string, fallback int) int {
	raw := strings.TrimSpace(os.Getenv(key))
	if raw == "" {
		return fallback
	}
	parsed, err := strconv.Atoi(raw)
	if err != nil || parsed <= 0 {
		return fallback
	}
	return parsed
}

// Ready reports whether the extraction service can currently do work.
//
// It is a probe, not a gate on this server's own readiness: recipe import is
// optional, and the API degrades to "import unavailable" rather than failing.
// Taking the whole server out of rotation because an optional dependency is
// down would turn a small outage into a total one.
func (c *Client) Ready(ctx context.Context) error {
	ctx, cancel := context.WithTimeout(ctx, c.cfg.PollTimeout)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, strings.TrimRight(c.cfg.BaseURL, "/")+"/readyz", nil)
	if err != nil {
		return err
	}
	req.Header.Set("Accept", "application/json")

	resp, err := c.http.Do(req)
	if err != nil {
		return fmt.Errorf("%w: %s", ErrUnavailable, err)
	}
	defer resp.Body.Close()
	_, _ = io.Copy(io.Discard, io.LimitReader(resp.Body, 1<<16))

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("%w: transcriber readiness returned %d", ErrUnavailable, resp.StatusCode)
	}
	return nil
}
