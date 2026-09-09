package db

// Every tool call Penny made, or tried to make.
//
// A denied call is recorded as carefully as an executed one. A run of denials
// against one turn is what an attempted prompt injection looks like from the
// server's side, and it is invisible if only successes are kept.

import (
	"context"
	"encoding/json"
	"time"
)

type PennyToolCall struct {
	UserID         string
	ConversationID *string
	TurnID         string
	Tool           string
	// Already redacted by the caller against the tool's declaration.
	Arguments map[string]any
	Outcome   string
	Detail    string
	Duration  time.Duration
}

const (
	ToolCallExecuted = "executed"
	ToolCallProposed = "proposed"
	ToolCallDenied   = "denied"
	ToolCallFailed   = "failed"
)

func (s *Store) RecordPennyToolCall(ctx context.Context, call PennyToolCall) error {
	arguments, err := json.Marshal(call.Arguments)
	if err != nil {
		return err
	}
	if call.Arguments == nil {
		arguments = []byte("{}")
	}

	const query = `
		INSERT INTO penny_tool_calls
			(id, user_id, conversation_id, turn_id, tool, arguments, outcome, detail, duration_ms, created_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`

	_, err = s.pool.Exec(ctx, query, NewID(), call.UserID, call.ConversationID, call.TurnID,
		call.Tool, arguments, call.Outcome, call.Detail, call.Duration.Milliseconds(), s.now().UTC())
	return err
}

// CountPennyToolCalls counts a user's calls since a cutoff. This is what the
// per-turn tool budget is enforced against: a model looping on a tool must run
// out of budget rather than out of the operator's money.
func (s *Store) CountPennyToolCalls(ctx context.Context, userID string, since time.Time) (int, error) {
	var count int
	err := s.pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM penny_tool_calls WHERE user_id = $1 AND created_at >= $2`,
		userID, since).Scan(&count)
	return count, err
}

// CountPennyMessagesSince counts a user's messages across every conversation,
// for the per-user turn limit.
func (s *Store) CountPennyMessagesSince(ctx context.Context, userID string, since time.Time) (int, error) {
	var count int
	err := s.pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM penny_messages WHERE user_id = $1 AND role = 'user' AND created_at >= $2`,
		userID, since).Scan(&count)
	return count, err
}
