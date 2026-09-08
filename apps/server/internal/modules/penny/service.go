package penny

import (
	"context"
	"errors"
	"log/slog"
	"strings"
	"time"

	"github.com/helpthehive/server/internal/auth"
	"github.com/helpthehive/server/internal/db"
	domain "github.com/helpthehive/server/internal/domain/penny"
	"github.com/helpthehive/server/internal/modules/penny/tools"
)

// Repository is the database surface the service needs. Declared here rather
// than taking *db.Store so that a turn can be tested without Postgres.
type Repository interface {
	CreatePennyConversation(ctx context.Context, userID, title string) (domain.Conversation, error)
	PennyConversation(ctx context.Context, userID, conversationID string) (domain.Conversation, error)
	ListPennyConversations(ctx context.Context, userID string, limit int) ([]domain.Conversation, error)
	AppendPennyMessage(ctx context.Context, message domain.Message) (domain.Message, error)
	PennyMessages(ctx context.Context, userID, conversationID string, limit int) ([]domain.Message, error)
	SetPennyConversationTitle(ctx context.Context, userID, conversationID, title string) error
	DeletePennyConversation(ctx context.Context, userID, conversationID string) (bool, error)
	CountPennyMessagesSince(ctx context.Context, userID string, since time.Time) (int, error)
	CountPennyToolCalls(ctx context.Context, userID string, since time.Time) (int, error)
}

type viewerReader interface {
	Viewer(ctx context.Context, identity auth.Identity) (db.Viewer, error)
}

type Service struct {
	repo    Repository
	users   viewerReader
	agent   Agent
	signer  *Signer
	limiter *Limiter
	gateway *tools.Gateway
	logger  *slog.Logger
	now     func() time.Time
}

func NewService(
	repo Repository,
	users viewerReader,
	agent Agent,
	signer *Signer,
	limiter *Limiter,
	gateway *tools.Gateway,
	logger *slog.Logger,
) *Service {
	return &Service{
		repo: repo, users: users, agent: agent, signer: signer,
		limiter: limiter, gateway: gateway, logger: logger, now: time.Now,
	}
}

// Gateway exposes the tool gateway to the transport layer, which serves it at
// its own route for the agent to call back into.
func (s *Service) Gateway() *tools.Gateway { return s.gateway }

// Signer exposes the token signer for the same reason.
func (s *Service) Signer() *Signer { return s.signer }

func (s *Service) Conversations(ctx context.Context, identity auth.Identity) ([]domain.Conversation, error) {
	userID, err := s.UserID(ctx, identity)
	if err != nil {
		return nil, err
	}
	return s.repo.ListPennyConversations(ctx, userID, 50)
}

func (s *Service) Messages(ctx context.Context, identity auth.Identity, conversationID string) ([]domain.Message, error) {
	userID, err := s.UserID(ctx, identity)
	if err != nil {
		return nil, err
	}
	// Establishes ownership before reading anything, and returns the same
	// not-found whether the conversation is somebody else's or does not exist.
	if _, err := s.repo.PennyConversation(ctx, userID, conversationID); err != nil {
		return nil, err
	}
	return s.repo.PennyMessages(ctx, userID, conversationID, 0)
}

func (s *Service) DeleteConversation(ctx context.Context, identity auth.Identity, conversationID string) (bool, error) {
	userID, err := s.UserID(ctx, identity)
	if err != nil {
		return false, err
	}
	return s.repo.DeletePennyConversation(ctx, userID, conversationID)
}

// SendInput is one message from the app.
type SendInput struct {
	// Empty starts a new conversation.
	ConversationID string
	Text           string
}

// SendResult is one completed turn.
type SendResult struct {
	ConversationID string
	Message        domain.Message
}

// maxInputLength bounds what one message may be. A long message is a cost and
// a context-window problem, and a very long one is somebody pasting a document
// into a chat box expecting it to be read.
const maxInputLength = 4000

// windowSize is how many past messages go to the agent verbatim. Everything
// older is represented by the conversation's summary.
const windowSize = 12

var ErrEmptyMessage = errors.New("message is empty")
var ErrMessageTooLong = errors.New("message is too long")

// Send runs one turn, end to end.
//
// The order is the design. The user's message is stored before the agent is
// called, so a turn that fails still shows what they asked. The agent is given
// a token minted for this turn and nothing else. The guard runs on what comes
// back, before it is stored, so what is persisted is what the user was allowed
// to see rather than what the model happened to say.
//
// onDelta is optional; when set the turn streams.
func (s *Service) Send(ctx context.Context, identity auth.Identity, input SendInput, onDelta func(string)) (SendResult, error) {
	text := strings.TrimSpace(input.Text)
	if text == "" {
		return SendResult{}, ErrEmptyMessage
	}
	if len(text) > maxInputLength {
		return SendResult{}, ErrMessageTooLong
	}

	viewer, err := s.users.Viewer(ctx, identity)
	if err != nil {
		return SendResult{}, err
	}
	userID := viewer.User.ID

	if err := s.limiter.AllowTurn(ctx, userID); err != nil {
		return SendResult{}, err
	}

	conversation, err := s.resolveConversation(ctx, userID, input.ConversationID, text)
	if err != nil {
		return SendResult{}, err
	}

	if _, err := s.repo.AppendPennyMessage(ctx, domain.Message{
		ConversationID: conversation.ID,
		UserID:         userID,
		Role:           domain.RoleUser,
		Content:        text,
		Outcome:        domain.OutcomeOK,
	}); err != nil {
		return SendResult{}, err
	}

	// The router narrows what this turn may do before the model has seen a
	// word of it. Everything downstream assumes this list is the ceiling.
	scopes := domain.Route(text)
	turnID := db.NewID()

	toolToken, err := s.signer.Sign(ToolClaims{
		TurnID:         turnID,
		UserID:         userID,
		ConversationID: conversation.ID,
		Scopes:         scopes,
	})
	if err != nil {
		return SendResult{}, err
	}

	history, err := s.window(ctx, userID, conversation.ID)
	if err != nil {
		return SendResult{}, err
	}

	request := domain.TurnRequest{
		TurnID:         turnID,
		ConversationID: conversation.ID,
		ToolToken:      toolToken,
		User: domain.TurnUser{
			FirstName:    viewer.Profile.FirstName,
			Jurisdiction: domain.Jurisdiction(viewer.Profile.Zip),
		},
		Input:   text,
		History: history,
		Summary: conversation.Summary,
		Scopes:  scopes,
		Tools:   domain.ToolsForScopes(scopes),
	}

	result, agentErr := s.agent.Turn(ctx, request, onDelta)
	reply := s.finalize(turnID, scopes, result, agentErr)

	stored, err := s.repo.AppendPennyMessage(ctx, domain.Message{
		ConversationID: conversation.ID,
		UserID:         userID,
		Role:           domain.RolePenny,
		Content:        reply.Text,
		Outcome:        reply.Outcome,
		Citations:      reply.Citations,
		ProposedAction: reply.ProposedAction,
	})
	if err != nil {
		return SendResult{}, err
	}
	return SendResult{ConversationID: conversation.ID, Message: stored}, nil
}

// finalize turns whatever came back — an answer, an error, a refusal — into the
// one message that will be stored and shown.
func (s *Service) finalize(turnID string, scopes []domain.Scope, result domain.TurnResult, agentErr error) domain.TurnResult {
	if agentErr != nil {
		if errors.Is(agentErr, ErrAgentUnavailable) {
			return domain.TurnResult{
				Text:    "Penny isn't switched on in this environment yet. Everything else in the app works as normal.",
				Outcome: domain.OutcomeFailed,
			}
		}
		s.logger.Error("penny: turn failed", "turn", turnID, "error", agentErr)
		return domain.TurnResult{
			Text:    "Sorry — I couldn't get to that just now. Try again in a moment?",
			Outcome: domain.OutcomeFailed,
		}
	}

	// The guard assumes the prompt failed. It runs on every response, including
	// the ones that look fine, and it replaces rather than edits.
	benefitsScoped := false
	for _, scope := range scopes {
		if scope == domain.ScopeBenefits {
			benefitsScoped = true
			break
		}
	}
	verdict := domain.Guard(result.Text, benefitsScoped, len(result.Citations) > 0)
	if !verdict.Approved() {
		s.logger.Warn("penny: response replaced by guard",
			"turn", turnID, "violation", verdict.Violation, "provider", result.Provider, "model", result.Model)
		// The citations and the proposal go with it: they belonged to a
		// response the user is not seeing.
		return domain.TurnResult{Text: verdict.Text, Outcome: verdict.Outcome}
	}

	result.Text = verdict.Text
	result.Outcome = verdict.Outcome
	return result
}

func (s *Service) resolveConversation(ctx context.Context, userID, conversationID, firstMessage string) (domain.Conversation, error) {
	if conversationID == "" {
		conversation, err := s.repo.CreatePennyConversation(ctx, userID, title(firstMessage))
		return conversation, err
	}
	conversation, err := s.repo.PennyConversation(ctx, userID, conversationID)
	if err != nil {
		return domain.Conversation{}, err
	}
	if conversation.Title == "" {
		// Best effort. A conversation without a title is a cosmetic problem and
		// not a reason to fail somebody's message.
		if err := s.repo.SetPennyConversationTitle(ctx, userID, conversation.ID, title(firstMessage)); err != nil {
			s.logger.Warn("penny: could not set conversation title", "conversation", conversation.ID, "error", err)
		}
	}
	return conversation, nil
}

// window is the recent thread, as the agent sees it.
func (s *Service) window(ctx context.Context, userID, conversationID string) ([]domain.TurnMessage, error) {
	messages, err := s.repo.PennyMessages(ctx, userID, conversationID, windowSize+1)
	if err != nil {
		return nil, err
	}
	// The last message is the one being answered; the agent gets it as Input.
	if len(messages) > 0 {
		messages = messages[:len(messages)-1]
	}

	out := make([]domain.TurnMessage, 0, len(messages))
	for _, message := range messages {
		// A refusal is not context. Replaying "I can't answer that" back into
		// the prompt teaches the next turn to refuse things it should not.
		if message.Outcome != domain.OutcomeOK {
			continue
		}
		out = append(out, domain.TurnMessage{Role: message.Role, Content: message.Content})
	}
	return out, nil
}

// title is the first thing the user said, trimmed. Better than anything
// generated, and it never changes under them afterwards.
func title(text string) string {
	const maxTitle = 60
	flattened := strings.Join(strings.Fields(text), " ")
	if len(flattened) <= maxTitle {
		return flattened
	}
	trimmed := flattened[:maxTitle]
	if cut := strings.LastIndex(trimmed, " "); cut > maxTitle/2 {
		trimmed = trimmed[:cut]
	}
	return trimmed + "…"
}

// UserID resolves the Help The Hive user behind a token. Exported because the
// transport layer needs it to look a proposed action up against its owner.
func (s *Service) UserID(ctx context.Context, identity auth.Identity) (string, error) {
	viewer, err := s.users.Viewer(ctx, identity)
	if err != nil {
		return "", err
	}
	return viewer.User.ID, nil
}
