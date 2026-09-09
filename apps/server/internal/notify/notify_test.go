package notify

import (
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
)

func discardLogger() *slog.Logger {
	return slog.New(slog.NewTextHandler(io.Discard, nil))
}

// TestSendChunksAtExpoLimit posts 250 tokens as 3 requests and checks the wire
// shape: one object per token with to/title/body/data.
func TestSendChunksAtExpoLimit(t *testing.T) {
	var mu sync.Mutex
	var payloads [][]expoMessage
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		var messages []expoMessage
		if err := json.Unmarshal(body, &messages); err != nil {
			t.Errorf("decode request: %v", err)
		}
		mu.Lock()
		payloads = append(payloads, messages)
		mu.Unlock()
		tickets := make([]expoTicket, len(messages))
		for i := range tickets {
			tickets[i] = expoTicket{Status: "ok", ID: "ticket-id"}
		}
		_ = json.NewEncoder(w).Encode(map[string]any{"data": tickets})
	}))
	defer server.Close()

	client := NewClient(WithEndpoint(server.URL), WithLogger(discardLogger()))

	tokens := make([]string, 250)
	for i := range tokens {
		tokens[i] = "ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]"
	}
	msg := Message{
		Title: "Help The Hive reminder",
		Body:  "Time to review your benefits",
		Data:  map[string]string{"kind": "benefits_renewal", "renewalId": "r1"},
	}
	unregistered, err := client.Send(context.Background(), tokens, msg)
	if err != nil {
		t.Fatalf("Send() error = %v", err)
	}
	if len(unregistered) != 0 {
		t.Fatalf("unregistered = %v, want none", unregistered)
	}
	if len(payloads) != 3 {
		t.Fatalf("requests = %d, want 3 chunks (100/100/50)", len(payloads))
	}
	if len(payloads[0]) != 100 || len(payloads[1]) != 100 || len(payloads[2]) != 50 {
		t.Fatalf("chunk sizes = %d/%d/%d, want 100/100/50",
			len(payloads[0]), len(payloads[1]), len(payloads[2]))
	}
	first := payloads[0][0]
	if first.To != tokens[0] || first.Title != msg.Title || first.Body != msg.Body {
		t.Fatalf("first message = %+v, want to/title/body set", first)
	}
	if first.Data["kind"] != "benefits_renewal" || first.Data["renewalId"] != "r1" {
		t.Fatalf("first message data = %v, want deep-link payload", first.Data)
	}
}

// TestSendCollectsUnregisteredTokens checks Expo ticket parsing: a
// DeviceNotRegistered ticket surfaces its token for deletion, and other ticket
// errors do not.
func TestSendCollectsUnregisteredTokens(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewEncoder(w).Encode(map[string]any{"data": []expoTicket{
			{Status: "ok", ID: "ticket-1"},
			{Status: "error", Message: "not registered", Details: &struct {
				Error string `json:"error,omitempty"`
			}{Error: "DeviceNotRegistered"}},
			{Status: "error", Message: "bad token", Details: &struct {
				Error string `json:"error,omitempty"`
			}{Error: "InvalidCredentials"}},
		}})
	}))
	defer server.Close()

	client := NewClient(WithEndpoint(server.URL), WithLogger(discardLogger()))
	tokens := []string{"token-alive", "token-dead", "token-bad"}
	unregistered, err := client.Send(context.Background(), tokens, Message{Title: "t", Body: "b"})
	if err != nil {
		t.Fatalf("Send() error = %v", err)
	}
	if len(unregistered) != 1 || unregistered[0] != "token-dead" {
		t.Fatalf("unregistered = %v, want [token-dead]", unregistered)
	}
}

// TestSendHTTPErrorFailsTheChunk: a transport-level failure aborts the send.
func TestSendHTTPErrorFailsTheChunk(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "expo is down", http.StatusBadGateway)
	}))
	defer server.Close()

	client := NewClient(WithEndpoint(server.URL), WithLogger(discardLogger()))
	_, err := client.Send(context.Background(), []string{"token-1"}, Message{Title: "t", Body: "b"})
	if err == nil || !strings.Contains(err.Error(), "502") {
		t.Fatalf("Send() error = %v, want a 502 error", err)
	}
}

// TestSendNoTokensSendsNothing: no tokens, no request.
func TestSendNoTokensSendsNothing(t *testing.T) {
	calls := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
	}))
	defer server.Close()

	client := NewClient(WithEndpoint(server.URL), WithLogger(discardLogger()))
	unregistered, err := client.Send(context.Background(), nil, Message{Title: "t", Body: "b"})
	if err != nil {
		t.Fatalf("Send() error = %v", err)
	}
	if len(unregistered) != 0 || calls != 0 {
		t.Fatalf("unregistered = %v, calls = %d; want no work done", unregistered, calls)
	}
}
