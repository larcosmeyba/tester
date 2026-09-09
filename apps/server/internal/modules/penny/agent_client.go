package penny

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	domain "github.com/helpthehive/server/internal/domain/penny"
)

// The client for the agent service.
//
// Two things about it are deliberate. It never sends the user's bearer token —
// only a tool token this server minted for one turn — and it never returns the
// agent's error bodies to a caller, because an agent's error can contain the
// prompt, and a prompt can contain what the user typed.

// Agent is what the service needs from the agent. An interface so the turn
// logic can be tested without a Python process, and so a deployment with no
// agent configured degrades to a stated fallback rather than a panic.
type Agent interface {
	Available() bool
	// Turn runs one exchange. onDelta, when non-nil, receives text as it
	// arrives; the final result is returned either way.
	Turn(ctx context.Context, request domain.TurnRequest, onDelta func(string)) (domain.TurnResult, error)
}

// ErrAgentUnavailable means no agent is configured. It is not a crash: the
// service answers with a written fallback, the same way the meal system
// produces a plan with no AI provider at all.
var ErrAgentUnavailable = errors.New("penny agent is not configured")

// Unconfigured is the default. Help The Hive runs with no agent: Penny says she
// is unavailable, and nothing else in the product changes.
type Unconfigured struct{}

func (Unconfigured) Available() bool { return false }

func (Unconfigured) Turn(context.Context, domain.TurnRequest, func(string)) (domain.TurnResult, error) {
	return domain.TurnResult{}, ErrAgentUnavailable
}

type AgentConfig struct {
	BaseURL string
	Timeout time.Duration
	// Shared with the agent so it can prove a turn request came from this
	// server. The agent will not answer an unsigned request.
	ServiceToken string
}

type HTTPAgent struct {
	cfg    AgentConfig
	client *http.Client
}

func NewHTTPAgent(cfg AgentConfig) (*HTTPAgent, error) {
	if cfg.BaseURL == "" {
		return nil, errors.New("PENNY_AGENT_URL is required when the agent is enabled")
	}
	if cfg.ServiceToken == "" {
		return nil, errors.New("PENNY_SERVICE_TOKEN is required when the agent is enabled")
	}
	if cfg.Timeout == 0 {
		cfg.Timeout = 60 * time.Second
	}
	return &HTTPAgent{cfg: cfg, client: &http.Client{Timeout: cfg.Timeout}}, nil
}

func (a *HTTPAgent) Available() bool { return true }

func (a *HTTPAgent) Turn(ctx context.Context, request domain.TurnRequest, onDelta func(string)) (domain.TurnResult, error) {
	body, err := json.Marshal(request)
	if err != nil {
		return domain.TurnResult{}, err
	}

	path := "/v1/penny/turn"
	if onDelta != nil {
		path = "/v1/penny/turn/stream"
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost,
		strings.TrimSuffix(a.cfg.BaseURL, "/")+path, bytes.NewReader(body))
	if err != nil {
		return domain.TurnResult{}, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+a.cfg.ServiceToken)
	if onDelta != nil {
		req.Header.Set("Accept", "text/event-stream")
	}

	res, err := a.client.Do(req)
	if err != nil {
		return domain.TurnResult{}, err
	}
	defer res.Body.Close()

	if res.StatusCode < 200 || res.StatusCode >= 300 {
		// The body is not included. An agent's error can echo the prompt, and
		// the prompt contains what the user typed.
		return domain.TurnResult{}, fmt.Errorf("penny agent returned status %d", res.StatusCode)
	}

	if onDelta == nil {
		return decodeTurn(io.LimitReader(res.Body, maxAgentResponse))
	}
	return a.readStream(res.Body, onDelta)
}

// maxAgentResponse caps what the agent can return. A downstream service is not
// trusted to bound its own reply, which is the same rule the meal provider
// applies to a model vendor.
const maxAgentResponse = 256 * 1024

func decodeTurn(r io.Reader) (domain.TurnResult, error) {
	var result domain.TurnResult
	if err := json.NewDecoder(r).Decode(&result); err != nil {
		return domain.TurnResult{}, errors.New("penny agent returned a response that could not be parsed")
	}
	return result, nil
}

// readStream consumes Server-Sent Events.
//
// Two event types matter: "delta" carries text to show as it arrives, and
// "result" carries the finished turn. The result is authoritative — the deltas
// are a preview, and the guard runs on the result, so a turn that streams
// something the guard later rejects is replaced before it is stored. The app is
// told to discard what it showed.
func (a *HTTPAgent) readStream(body io.Reader, onDelta func(string)) (domain.TurnResult, error) {
	scanner := bufio.NewScanner(io.LimitReader(body, maxAgentResponse))
	scanner.Buffer(make([]byte, 0, 8*1024), 64*1024)

	var (
		event  string
		result domain.TurnResult
		seen   bool
	)
	for scanner.Scan() {
		line := scanner.Text()
		switch {
		case strings.HasPrefix(line, "event:"):
			event = strings.TrimSpace(strings.TrimPrefix(line, "event:"))
		case strings.HasPrefix(line, "data:"):
			data := strings.TrimSpace(strings.TrimPrefix(line, "data:"))
			switch event {
			case "delta":
				var delta struct {
					Text string `json:"text"`
				}
				if err := json.Unmarshal([]byte(data), &delta); err == nil {
					onDelta(delta.Text)
				}
			case "result":
				if err := json.Unmarshal([]byte(data), &result); err != nil {
					return domain.TurnResult{}, errors.New("penny agent returned a result that could not be parsed")
				}
				seen = true
			case "error":
				return domain.TurnResult{}, errors.New("penny agent reported a failure")
			}
		}
	}
	if err := scanner.Err(); err != nil {
		return domain.TurnResult{}, err
	}
	if !seen {
		// The stream ended without a result. Whatever was shown so far is not
		// an answer, and treating it as one would store a truncated reply.
		return domain.TurnResult{}, errors.New("penny agent stream ended without a result")
	}
	return result, nil
}
