package db

// What Penny remembers about a user, across conversations.
//
// Recall is lexical here, over Postgres full-text search, with the embedding
// column left null. That is a deliberate first step rather than an oversight:
// the store, its scoping and its supersession rules are what make this safe,
// and they are identical whichever way the top-k is chosen. Swapping in a
// vector search later changes the ORDER BY in one query and nothing else.

import (
	"context"
	"errors"

	"github.com/helpthehive/server/internal/domain/penny"
	"github.com/jackc/pgx/v5"
)

var ErrMemoryNotFound = errors.New("memory not found")

type CreatePennyMemoryParams struct {
	UserID          string
	Kind            penny.MemoryKind
	Content         string
	Context         string
	SourceMessageID *string
	// The memory this one replaces, if the user corrected something. Checked
	// against the same user before anything is marked superseded.
	Supersedes *string
}

// UpsertPennyMemory writes a memory and, when it corrects an earlier one, marks
// that one superseded in the same transaction.
//
// Superseding rather than updating is what makes a correction auditable: the
// original claim, the corrected claim and the order they arrived in all
// survive. A store that overwrites cannot answer "what did Penny believe last
// Tuesday", which is the question asked when she says something surprising.
func (s *Store) UpsertPennyMemory(ctx context.Context, params CreatePennyMemoryParams) (penny.Memory, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return penny.Memory{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	id := NewID()
	now := s.now().UTC()

	const insert = `
		INSERT INTO penny_memories (id, user_id, kind, content, context, source_message_id, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $7)
		RETURNING id, user_id, kind, content, context, source_message_id, superseded_by, created_at, updated_at`

	memory, err := scanMemory(tx.QueryRow(ctx, insert,
		id, params.UserID, string(params.Kind), params.Content, params.Context, params.SourceMessageID, now))
	if err != nil {
		return penny.Memory{}, err
	}

	if params.Supersedes != nil && *params.Supersedes != "" {
		// Scoped to the same user: a memory id is not a capability, and one
		// user must not be able to supersede another's memory by naming it.
		const supersede = `
			UPDATE penny_memories SET superseded_by = $3, updated_at = $4
			WHERE id = $1 AND user_id = $2 AND superseded_by IS NULL`
		if _, err := tx.Exec(ctx, supersede, *params.Supersedes, params.UserID, id, now); err != nil {
			return penny.Memory{}, err
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return penny.Memory{}, err
	}
	return memory, nil
}

type PennyMemoryQuery struct {
	UserID string
	// Free text. Empty returns the most recent memories instead of ranking.
	Search string
	Kind   *penny.MemoryKind
	Limit  int
}

// RecallPennyMemories returns live memories for one user, most relevant first.
//
// Superseded memories are excluded in SQL rather than filtered afterwards, so
// there is no path by which a corrected belief reaches a prompt.
func (s *Store) RecallPennyMemories(ctx context.Context, query PennyMemoryQuery) ([]penny.Memory, error) {
	limit := query.Limit
	if limit <= 0 || limit > 25 {
		limit = 8
	}

	var kind any
	if query.Kind != nil {
		kind = string(*query.Kind)
	}

	// websearch_to_tsquery rather than to_tsquery: the search text originates
	// with a model, and to_tsquery treats a stray ampersand as syntax and
	// errors. websearch_to_tsquery treats every input as a search.
	const sql = `
		SELECT id, user_id, kind, content, context, source_message_id, superseded_by, created_at, updated_at
		FROM penny_memories
		WHERE user_id = $1
		  AND superseded_by IS NULL
		  AND ($2::text IS NULL OR kind = $2::text)
		  AND ($3::text = '' OR to_tsvector('english', content || ' ' || context)
		                        @@ websearch_to_tsquery('english', $3::text))
		ORDER BY
			CASE WHEN $3::text = '' THEN 0
			     ELSE ts_rank(to_tsvector('english', content || ' ' || context),
			                  websearch_to_tsquery('english', $3::text))
			END DESC,
			updated_at DESC
		LIMIT $4`

	rows, err := s.pool.Query(ctx, sql, query.UserID, kind, query.Search, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make([]penny.Memory, 0, limit)
	for rows.Next() {
		memory, err := scanMemory(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, memory)
	}
	return out, rows.Err()
}

// DeletePennyMemory removes one memory outright. This is the user's own delete,
// not a correction: a memory somebody asked to be forgotten is forgotten, not
// superseded and kept.
func (s *Store) DeletePennyMemory(ctx context.Context, userID, memoryID string) (bool, error) {
	const query = `DELETE FROM penny_memories WHERE id = $1 AND user_id = $2`
	tag, err := s.pool.Exec(ctx, query, memoryID, userID)
	if err != nil {
		return false, err
	}
	return tag.RowsAffected() > 0, nil
}

func scanMemory(row pgx.Row) (penny.Memory, error) {
	var (
		m    penny.Memory
		kind string
	)
	if err := row.Scan(&m.ID, &m.UserID, &kind, &m.Content, &m.Context,
		&m.SourceMessageID, &m.SupersededBy, &m.CreatedAt, &m.UpdatedAt); err != nil {
		return penny.Memory{}, err
	}
	m.Kind = penny.MemoryKind(kind)
	return m, nil
}
