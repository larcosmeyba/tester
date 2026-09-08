package db

// Penny: conversations, messages, what she remembers, and the corpus she
// answers benefits questions from.
//
// Every statement here is scoped by user_id in its WHERE clause, not merely in
// the caller. The agent that talks to the model has no credentials for this
// database, so the only path to these rows is through a service that has
// already resolved an authenticated identity — but a query that would return
// another user's conversation if called with the wrong argument is a query one
// refactor away from doing so.

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"

	"github.com/helpthehive/server/internal/domain/penny"
	"github.com/jackc/pgx/v5"
)

var ErrConversationNotFound = errors.New("conversation not found")

func (s *Store) CreatePennyConversation(ctx context.Context, userID, title string) (penny.Conversation, error) {
	id := NewID()
	now := s.now().UTC()
	const query = `
		INSERT INTO penny_conversations (id, user_id, title, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $4)
		RETURNING id, user_id, title, summary, summarized_through, created_at, updated_at`

	row := s.pool.QueryRow(ctx, query, id, userID, title, now)
	return scanConversation(row)
}

func (s *Store) PennyConversation(ctx context.Context, userID, conversationID string) (penny.Conversation, error) {
	const query = `
		SELECT id, user_id, title, summary, summarized_through, created_at, updated_at
		FROM penny_conversations
		WHERE id = $1 AND user_id = $2`

	conversation, err := scanConversation(s.pool.QueryRow(ctx, query, conversationID, userID))
	if errors.Is(err, pgx.ErrNoRows) {
		// Deliberately the same error whether the conversation belongs to
		// somebody else or does not exist. Distinguishing them tells a caller
		// which ids are real.
		return penny.Conversation{}, ErrConversationNotFound
	}
	return conversation, err
}

func (s *Store) ListPennyConversations(ctx context.Context, userID string, limit int) ([]penny.Conversation, error) {
	if limit <= 0 || limit > 100 {
		limit = 50
	}
	const query = `
		SELECT id, user_id, title, summary, summarized_through, created_at, updated_at
		FROM penny_conversations
		WHERE user_id = $1
		ORDER BY updated_at DESC
		LIMIT $2`

	rows, err := s.pool.Query(ctx, query, userID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make([]penny.Conversation, 0, limit)
	for rows.Next() {
		conversation, err := scanConversation(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, conversation)
	}
	return out, rows.Err()
}

// AppendPennyMessage writes one message at the next free position.
//
// The position is taken inside the insert rather than read and incremented by
// the caller, so two turns racing on one conversation cannot land on the same
// number. The unique constraint would catch it; this avoids needing to.
func (s *Store) AppendPennyMessage(ctx context.Context, message penny.Message) (penny.Message, error) {
	citations, err := json.Marshal(orEmpty(message.Citations))
	if err != nil {
		return penny.Message{}, err
	}
	var proposed []byte
	if message.ProposedAction != nil {
		if proposed, err = json.Marshal(message.ProposedAction); err != nil {
			return penny.Message{}, err
		}
	}

	const query = `
		INSERT INTO penny_messages
			(id, conversation_id, user_id, role, content, position, outcome, citations, proposed_action, created_at)
		SELECT $1, $2, $3, $4, $5,
		       COALESCE((SELECT MAX(position) + 1 FROM penny_messages WHERE conversation_id = $2), 0),
		       $6, $7, $8, $9
		WHERE EXISTS (SELECT 1 FROM penny_conversations WHERE id = $2 AND user_id = $3)
		RETURNING id, conversation_id, user_id, role, content, position, outcome, citations, proposed_action, created_at`

	row := s.pool.QueryRow(ctx, query,
		NewID(), message.ConversationID, message.UserID, string(message.Role),
		message.Content, string(message.Outcome), citations, proposed, s.now().UTC(),
	)
	stored, err := scanMessage(row)
	if errors.Is(err, pgx.ErrNoRows) {
		// The EXISTS guard did not match: the conversation is not this user's.
		return penny.Message{}, ErrConversationNotFound
	}
	if err != nil {
		return penny.Message{}, err
	}

	// Touching the conversation is what orders the list the user sees.
	const touch = `UPDATE penny_conversations SET updated_at = $2 WHERE id = $1`
	if _, err := s.pool.Exec(ctx, touch, message.ConversationID, s.now().UTC()); err != nil {
		return penny.Message{}, err
	}
	return stored, nil
}

// PennyMessages returns a conversation's messages, oldest first. A limit of
// zero returns the whole thread.
func (s *Store) PennyMessages(ctx context.Context, userID, conversationID string, limit int) ([]penny.Message, error) {
	// The inner query takes the most recent rows so that a long thread does not
	// have to be read to show its tail; the outer one puts them back in
	// reading order.
	query := `
		SELECT id, conversation_id, user_id, role, content, position, outcome, citations, proposed_action, created_at
		FROM (
			SELECT * FROM penny_messages
			WHERE conversation_id = $1 AND user_id = $2
			ORDER BY position DESC` + limitClause(limit) + `
		) recent
		ORDER BY position ASC`

	rows, err := s.pool.Query(ctx, query, conversationID, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make([]penny.Message, 0, 32)
	for rows.Next() {
		message, err := scanMessage(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, message)
	}
	return out, rows.Err()
}

func limitClause(limit int) string {
	if limit <= 0 {
		return ""
	}
	return fmt.Sprintf(" LIMIT %d", limit)
}

// SetPennyConversationTitle names a conversation, once. The first thing a user
// said is a better title than anything generated, and it never changes under
// them afterwards.
func (s *Store) SetPennyConversationTitle(ctx context.Context, userID, conversationID, title string) error {
	const query = `
		UPDATE penny_conversations SET title = $3, updated_at = $4
		WHERE id = $1 AND user_id = $2 AND title = ''`
	_, err := s.pool.Exec(ctx, query, conversationID, userID, title, s.now().UTC())
	return err
}

func (s *Store) SetPennyConversationSummary(ctx context.Context, userID, conversationID, summary string, through int) error {
	const query = `
		UPDATE penny_conversations SET summary = $3, summarized_through = $4, updated_at = $5
		WHERE id = $1 AND user_id = $2`
	_, err := s.pool.Exec(ctx, query, conversationID, userID, summary, through, s.now().UTC())
	return err
}

func (s *Store) DeletePennyConversation(ctx context.Context, userID, conversationID string) (bool, error) {
	const query = `DELETE FROM penny_conversations WHERE id = $1 AND user_id = $2`
	tag, err := s.pool.Exec(ctx, query, conversationID, userID)
	if err != nil {
		return false, err
	}
	return tag.RowsAffected() > 0, nil
}

func scanConversation(row pgx.Row) (penny.Conversation, error) {
	var c penny.Conversation
	err := row.Scan(&c.ID, &c.UserID, &c.Title, &c.Summary, &c.SummarizedThrough, &c.CreatedAt, &c.UpdatedAt)
	return c, err
}

func scanMessage(row pgx.Row) (penny.Message, error) {
	var (
		m         penny.Message
		role      string
		outcome   string
		citations []byte
		proposed  []byte
	)
	if err := row.Scan(&m.ID, &m.ConversationID, &m.UserID, &role, &m.Content,
		&m.Position, &outcome, &citations, &proposed, &m.CreatedAt); err != nil {
		return penny.Message{}, err
	}
	m.Role = penny.Role(role)
	m.Outcome = penny.Outcome(outcome)
	if len(citations) > 0 {
		if err := json.Unmarshal(citations, &m.Citations); err != nil {
			return penny.Message{}, err
		}
	}
	if len(proposed) > 0 {
		var action penny.ProposedAction
		if err := json.Unmarshal(proposed, &action); err != nil {
			return penny.Message{}, err
		}
		m.ProposedAction = &action
	}
	return m, nil
}

func orEmpty(citations []penny.Citation) []penny.Citation {
	if citations == nil {
		return []penny.Citation{}
	}
	return citations
}
