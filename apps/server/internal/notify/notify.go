// Package notify sends push notifications through the Expo Push API.
//
// It is deliberately benefits-agnostic — one sender, many future callers
// (pantry, meal plans, renewals). The only thing this package knows about a
// notification is its title, body and data payload. What those say is the
// caller's decision, and each caller's tests enforce the content rules: no
// program names, no PII and no eligibility language in the visible text.
package notify

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"time"
)

// expoPushEndpoint is the Expo Push API. Basic sends need no server key.
const expoPushEndpoint = "https://exp.host/--/api/v2/push/send"

// expoChunkLimit is the maximum number of messages per Expo Push API request.
const expoChunkLimit = 100

// Message is one push notification.
//
// Title and Body are what the lock screen shows: they must never carry PII,
// program names or eligibility language. Data rides along for deep-linking and
// is where identifiers (renewal ids, program names) belong.
type Message struct {
	Title string
	Body  string
	// Data is delivered to the app on tap. Keys and values are plain strings;
	// nothing in here is shown on the lock screen.
	Data map[string]string
}

// expoMessage is the wire shape for one push ticket request.
type expoMessage struct {
	To    string            `json:"to"`
	Title string            `json:"title"`
	Body  string            `json:"body"`
	Data  map[string]string `json:"data,omitempty"`
}

// expoTicket is one entry of the Expo Push API ticket response.
type expoTicket struct {
	Status  string `json:"status"`
	ID      string `json:"id,omitempty"`
	Message string `json:"message,omitempty"`
	Details *struct {
		Error string `json:"error,omitempty"`
	} `json:"details,omitempty"`
}

// Client sends push notifications through the Expo Push API.
type Client struct {
	endpoint string
	http     *http.Client
	logger   *slog.Logger
}

// Option configures a Client.
type Option func(*Client)

// WithEndpoint overrides the Expo Push API endpoint (tests).
func WithEndpoint(endpoint string) Option {
	return func(c *Client) { c.endpoint = endpoint }
}

// WithHTTPClient overrides the HTTP client.
func WithHTTPClient(httpClient *http.Client) Option {
	return func(c *Client) { c.http = httpClient }
}

// WithLogger overrides the logger.
func WithLogger(logger *slog.Logger) Option {
	return func(c *Client) { c.logger = logger }
}

// NewClient builds a Client with sane defaults.
func NewClient(opts ...Option) *Client {
	c := &Client{
		endpoint: expoPushEndpoint,
		http: &http.Client{
			Timeout: 15 * time.Second,
		},
		logger: slog.Default(),
	}
	for _, opt := range opts {
		opt(c)
	}
	return c
}

// Send delivers msg to every token, in chunks of 100 (the Expo limit). It
// returns the tokens Expo reported as DeviceNotRegistered so the caller can
// delete them. A transport-level failure aborts the send and returns an error;
// per-ticket errors are logged and, for DeviceNotRegistered, collected.
//
// The log lines carry counts only — never user ids, token values or program
// names.
func (c *Client) Send(ctx context.Context, tokens []string, msg Message) (unregistered []string, err error) {
	if len(tokens) == 0 {
		return nil, nil
	}
	sent := 0
	for _, chunk := range chunkTokens(tokens, expoChunkLimit) {
		dead, err := c.sendChunk(ctx, chunk, msg)
		if err != nil {
			c.logger.Error("push chunk failed",
				"chunk_size", len(chunk),
				"sent_before_failure", sent,
				"error", err,
			)
			return unregistered, err
		}
		sent += len(chunk)
		unregistered = append(unregistered, dead...)
	}
	c.logger.Info("push sent",
		"recipients", len(tokens),
		"chunks", (len(tokens)+expoChunkLimit-1)/expoChunkLimit,
		"unregistered", len(unregistered),
	)
	return unregistered, nil
}

func (c *Client) sendChunk(ctx context.Context, tokens []string, msg Message) ([]string, error) {
	payload := make([]expoMessage, 0, len(tokens))
	for _, token := range tokens {
		payload = append(payload, expoMessage{
			To:    token,
			Title: msg.Title,
			Body:  msg.Body,
			Data:  msg.Data,
		})
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return nil, fmt.Errorf("encode push payload: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.endpoint, bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("build push request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")

	resp, err := c.http.Do(req)
	if err != nil {
		return nil, fmt.Errorf("push request: %w", err)
	}
	defer resp.Body.Close()
	respBody, err := io.ReadAll(io.LimitReader(resp.Body, 4<<20))
	if err != nil {
		return nil, fmt.Errorf("read push response: %w", err)
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("push API status %d: %s", resp.StatusCode, truncate(string(respBody), 200))
	}

	var envelope struct {
		Data   []expoTicket `json:"data"`
		Errors []struct {
			Message string `json:"message"`
		} `json:"errors"`
	}
	if err := json.Unmarshal(respBody, &envelope); err != nil {
		return nil, fmt.Errorf("decode push response: %w", err)
	}
	if len(envelope.Errors) > 0 {
		return nil, fmt.Errorf("push API errors: %s", envelope.Errors[0].Message)
	}

	var unregistered []string
	for i, ticket := range envelope.Data {
		if ticket.Status == "ok" {
			continue
		}
		code := ""
		if ticket.Details != nil {
			code = ticket.Details.Error
		}
		// The log carries the ticket index and the Expo error code only.
		// Token values and anything identifying the recipient stay out.
		c.logger.Warn("push ticket error",
			"ticket_index", i,
			"error_code", code,
		)
		if code == "DeviceNotRegistered" && i < len(tokens) {
			unregistered = append(unregistered, tokens[i])
		}
	}
	return unregistered, nil
}

func chunkTokens(tokens []string, size int) [][]string {
	var chunks [][]string
	for len(tokens) > 0 {
		if len(tokens) < size {
			size = len(tokens)
		}
		chunks = append(chunks, tokens[:size:size])
		tokens = tokens[size:]
	}
	return chunks
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "…"
}
