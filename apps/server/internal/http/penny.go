package serverhttp

// Penny's HTTP surface.
//
// REST rather than GraphQL, for two reasons. The mobile app's Penny seam
// already declares these paths, and a turn streams — which a GraphQL query
// cannot do without subscriptions and a transport the app does not have.
//
// There are two kinds of route here and they authenticate differently. The
// chat routes take the user's bearer token, like everything else in this
// server. The tool route takes a per-turn token this server minted seconds
// earlier, because the caller is the agent rather than a person. Mixing those
// up would either give the agent a user's full authority or make it impossible
// for the agent to do anything at all.

import (
	"crypto/subtle"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/helpthehive/server/internal/auth"
	"github.com/helpthehive/server/internal/db"
	domain "github.com/helpthehive/server/internal/domain/penny"
	"github.com/helpthehive/server/internal/modules/penny"
)

// PennyDeps is what the routes need. The store is separate from the service
// because confirming an action reads the proposal back from the transcript.
type PennyDeps struct {
	Service *penny.Service
	Store   *db.Store
	// Proves a turn request came from this server, checked on the tool route.
	ServiceToken string
	Logger       *slog.Logger
}

// PennyRoutes mounts the chat API. The caller applies the auth middleware.
func PennyRoutes(deps PennyDeps) func(chi.Router) {
	logger := deps.Logger
	if logger == nil {
		logger = slog.Default()
	}

	return func(r chi.Router) {
		r.Get("/conversations", pennyConversations(deps))
		r.Get("/conversations/{conversationID}/messages", pennyMessages(deps))
		r.Delete("/conversations/{conversationID}", pennyDeleteConversation(deps))
		r.Post("/messages", pennySend(deps, logger))
		r.Post("/messages/stream", pennyStream(deps, logger))
		r.Post("/actions/{actionID}/confirm", pennyConfirm(deps, logger))
	}
}

type conversationBody struct {
	ID        string `json:"id"`
	Title     string `json:"title"`
	UpdatedAt string `json:"updatedAt"`
}

type messageBody struct {
	ID             string                 `json:"id"`
	ConversationID string                 `json:"conversationId"`
	Role           string                 `json:"role"`
	Text           string                 `json:"text"`
	CreatedAt      string                 `json:"createdAt"`
	IsError        bool                   `json:"isError,omitempty"`
	Citations      []domain.Citation      `json:"citations,omitempty"`
	ProposedAction *domain.ProposedAction `json:"proposedAction,omitempty"`
}

func pennyConversations(deps PennyDeps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		identity, ok := requireIdentity(w, r)
		if !ok {
			return
		}
		conversations, err := deps.Service.Conversations(r.Context(), identity)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "could not load conversations")
			return
		}
		out := make([]conversationBody, 0, len(conversations))
		for _, conversation := range conversations {
			out = append(out, conversationBody{
				ID:        conversation.ID,
				Title:     conversation.Title,
				UpdatedAt: conversation.UpdatedAt.Format(timeFormat),
			})
		}
		writeJSON(w, http.StatusOK, out)
	}
}

func pennyMessages(deps PennyDeps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		identity, ok := requireIdentity(w, r)
		if !ok {
			return
		}
		messages, err := deps.Service.Messages(r.Context(), identity, chi.URLParam(r, "conversationID"))
		if errors.Is(err, db.ErrConversationNotFound) {
			// Not found rather than forbidden: somebody else's conversation
			// must be indistinguishable from one that does not exist.
			writeError(w, http.StatusNotFound, "conversation not found")
			return
		}
		if err != nil {
			writeError(w, http.StatusInternalServerError, "could not load messages")
			return
		}
		out := make([]messageBody, 0, len(messages))
		for _, message := range messages {
			out = append(out, toMessageBody(message))
		}
		writeJSON(w, http.StatusOK, out)
	}
}

func pennyDeleteConversation(deps PennyDeps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		identity, ok := requireIdentity(w, r)
		if !ok {
			return
		}
		deleted, err := deps.Service.DeleteConversation(r.Context(), identity, chi.URLParam(r, "conversationID"))
		if err != nil {
			writeError(w, http.StatusInternalServerError, "could not delete conversation")
			return
		}
		writeJSON(w, http.StatusOK, map[string]bool{"deleted": deleted})
	}
}

type sendBody struct {
	ConversationID *string `json:"conversationId"`
	Text           string  `json:"text"`
}

func (b sendBody) input() penny.SendInput {
	input := penny.SendInput{Text: b.Text}
	if b.ConversationID != nil {
		input.ConversationID = strings.TrimSpace(*b.ConversationID)
	}
	return input
}

func pennySend(deps PennyDeps, logger *slog.Logger) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		identity, ok := requireIdentity(w, r)
		if !ok {
			return
		}
		var body sendBody
		if !decodeBody(w, r, &body) {
			return
		}

		result, err := deps.Service.Send(r.Context(), identity, body.input(), nil)
		if status, message, handled := pennySendError(err); handled {
			writeError(w, status, message)
			return
		} else if err != nil {
			logger.Error("penny: send failed", "error", err)
			writeError(w, http.StatusInternalServerError, "could not send message")
			return
		}

		writeJSON(w, http.StatusOK, map[string]any{
			"conversationId": result.ConversationID,
			"message":        toMessageBody(result.Message),
		})
	}
}

// pennyStream is the same turn, delivered as it is written.
//
// The final "message" event is authoritative. Deltas are a preview: the guard
// runs on the finished response, so a turn that streamed something the guard
// then replaced sends the replacement, and the client shows that instead of
// what it had been rendering. A client that treats the deltas as the answer
// will occasionally show a sentence the user was not supposed to see, which is
// why the event names say which is which.
func pennyStream(deps PennyDeps, logger *slog.Logger) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		identity, ok := requireIdentity(w, r)
		if !ok {
			return
		}
		var body sendBody
		if !decodeBody(w, r, &body) {
			return
		}

		flusher, ok := w.(http.Flusher)
		if !ok {
			writeError(w, http.StatusInternalServerError, "streaming is not supported")
			return
		}

		w.Header().Set("Content-Type", "text/event-stream")
		w.Header().Set("Cache-Control", "no-cache")
		w.Header().Set("Connection", "keep-alive")
		// Proxies that buffer will hold the whole turn and deliver it at once,
		// which is exactly what streaming exists to avoid.
		w.Header().Set("X-Accel-Buffering", "no")
		w.WriteHeader(http.StatusOK)
		flusher.Flush()

		onDelta := func(text string) {
			writeEvent(w, "delta", map[string]string{"text": text})
			flusher.Flush()
		}

		result, err := deps.Service.Send(r.Context(), identity, body.input(), onDelta)
		if err != nil {
			if status, message, handled := pennySendError(err); handled {
				writeEvent(w, "error", map[string]any{"status": status, "message": message})
			} else {
				logger.Error("penny: stream failed", "error", err)
				writeEvent(w, "error", map[string]any{"status": 500, "message": "could not send message"})
			}
			flusher.Flush()
			return
		}

		writeEvent(w, "message", map[string]any{
			"conversationId": result.ConversationID,
			"message":        toMessageBody(result.Message),
		})
		flusher.Flush()
	}
}

// pennyConfirm executes an action the user agreed to.
//
// The action id is the whole of what the client sends. Its arguments are read
// back from the transcript, so what runs is what Penny proposed and what the
// confirmation card described — not whatever a modified app posts here.
func pennyConfirm(deps PennyDeps, logger *slog.Logger) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		identity, ok := requireIdentity(w, r)
		if !ok {
			return
		}

		userID, err := deps.Service.UserID(r.Context(), identity)
		if err != nil {
			writeError(w, http.StatusUnauthorized, "authentication required")
			return
		}

		actionID := chi.URLParam(r, "actionID")
		action, _, err := deps.Store.PennyProposedAction(r.Context(), userID, actionID)
		if errors.Is(err, db.ErrProposedActionNotFound) {
			writeError(w, http.StatusNotFound, "action not found")
			return
		}
		if err != nil {
			writeError(w, http.StatusInternalServerError, "could not load the action")
			return
		}

		result, err := deps.Service.Gateway().Confirm(r.Context(), identity, actionID, action)
		if err != nil {
			logger.Warn("penny: confirmed action failed", "tool", action.Tool, "error", err)
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"tool": action.Tool, "result": result})
	}
}

// PennyToolGateway is the route the agent calls back into.
//
// It is deliberately not behind the user auth middleware: the caller is a
// service, not a person, and it carries a token this server minted for one
// turn. Everything the call is allowed to do is in that token.
func PennyToolGateway(deps PennyDeps) http.HandlerFunc {
	logger := deps.Logger
	if logger == nil {
		logger = slog.Default()
	}
	return func(w http.ResponseWriter, r *http.Request) {
		if deps.Service == nil {
			writeError(w, http.StatusNotFound, "penny is not available on this server")
			return
		}
		// The service token proves the caller is the agent. The tool token,
		// checked below, proves which turn it is acting for. Both are required:
		// the first stops anything else on the network reaching this route, and
		// the second stops the agent acting outside a turn.
		if !bearerEquals(r, deps.ServiceToken) {
			writeError(w, http.StatusUnauthorized, "unauthorized")
			return
		}

		var body struct {
			ToolToken string         `json:"tool_token"`
			TurnID    string         `json:"turn_id"`
			Tool      string         `json:"tool"`
			Arguments map[string]any `json:"arguments"`
		}
		if !decodeBody(w, r, &body) {
			return
		}

		claims, err := deps.Service.Signer().Verify(body.ToolToken)
		if err != nil {
			// Says which, because an expired token is a turn that took too long
			// and an invalid one is something else entirely.
			writeError(w, http.StatusUnauthorized, err.Error())
			return
		}
		if body.TurnID != "" && body.TurnID != claims.TurnID {
			writeError(w, http.StatusForbidden, "tool token does not match this turn")
			return
		}

		response := deps.Service.Gateway().Execute(r.Context(), claims, domain.ToolRequest{
			TurnID:    claims.TurnID,
			Tool:      body.Tool,
			Arguments: body.Arguments,
		})
		writeJSON(w, http.StatusOK, response)
	}
}

const timeFormat = "2006-01-02T15:04:05Z07:00"

func toMessageBody(message domain.Message) messageBody {
	role := "penny"
	if message.Role == domain.RoleUser {
		role = "user"
	}
	return messageBody{
		ID:             message.ID,
		ConversationID: message.ConversationID,
		Role:           role,
		Text:           message.Content,
		CreatedAt:      message.CreatedAt.Format(timeFormat),
		IsError:        message.Outcome == domain.OutcomeFailed || message.Outcome == domain.OutcomeRateLimited,
		Citations:      message.Citations,
		ProposedAction: message.ProposedAction,
	}
}

func pennySendError(err error) (int, string, bool) {
	switch {
	case err == nil:
		return 0, "", false
	case errors.Is(err, penny.ErrEmptyMessage):
		return http.StatusBadRequest, "message is empty", true
	case errors.Is(err, penny.ErrMessageTooLong):
		return http.StatusBadRequest, "message is too long", true
	case errors.Is(err, penny.ErrRateLimited):
		return http.StatusTooManyRequests, "you have sent a lot of messages recently — give it a minute", true
	case errors.Is(err, db.ErrConversationNotFound):
		return http.StatusNotFound, "conversation not found", true
	default:
		return 0, "", false
	}
}

func requireIdentity(w http.ResponseWriter, r *http.Request) (auth.Identity, bool) {
	identity, err := auth.RequireIdentity(r.Context())
	if err != nil {
		writeError(w, http.StatusUnauthorized, "authentication required")
		return auth.Identity{}, false
	}
	return identity, true
}

func decodeBody(w http.ResponseWriter, r *http.Request, into any) bool {
	// Capped: a request body is not trusted to bound itself.
	decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 64*1024))
	if err := decoder.Decode(into); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return false
	}
	return true
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}

func writeError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, map[string]string{"error": message})
}

func writeEvent(w http.ResponseWriter, event string, payload any) {
	encoded, err := json.Marshal(payload)
	if err != nil {
		return
	}
	_, _ = fmt.Fprintf(w, "event: %s\ndata: %s\n\n", event, encoded)
}

// bearerEquals compares the Authorization header to a shared secret.
//
// Constant time, because a comparison that returns on the first wrong byte
// tells a caller how much of a guess was right, and this secret is the whole of
// what stops anything else on the network reaching the tool gateway.
func bearerEquals(r *http.Request, expected string) bool {
	if expected == "" {
		return false
	}
	header := strings.TrimSpace(r.Header.Get("Authorization"))
	token := strings.TrimSpace(strings.TrimPrefix(header, "Bearer "))
	return subtle.ConstantTimeCompare([]byte(token), []byte(expected)) == 1
}
