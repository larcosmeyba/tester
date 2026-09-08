package db

// The corpus Penny answers benefits questions from.
//
// Retrieval here filters before it ranks. Jurisdiction is a WHERE clause, not a
// scoring term, because "close enough" is the wrong answer to which state's
// rules apply: an Ohio income limit that ranks well for a Texan is worse than
// no answer at all, and a similarity threshold cannot be tuned to make that
// safe.

import (
	"context"
	"time"

	"github.com/helpthehive/server/internal/domain/penny"
)

type KnowledgeDocument struct {
	ID            string
	Program       string
	Jurisdiction  string
	Title         string
	SourceURL     string
	Authority     string
	EffectiveDate *time.Time
	ReviewBy      *time.Time
	ContentHash   string
}

type KnowledgeChunk struct {
	ID         string
	DocumentID string
	Heading    string
	Content    string
	Position   int
}

// UpsertKnowledgeDocument replaces a document and its chunks.
//
// The whole document is rewritten rather than diffed. Chunk boundaries move
// when a heading is edited, so a partial update leaves orphaned text that is
// still retrievable and no longer says what the author wrote — which is the one
// failure this corpus cannot have.
func (s *Store) UpsertKnowledgeDocument(ctx context.Context, doc KnowledgeDocument, chunks []KnowledgeChunk) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	now := s.now().UTC()
	const upsert = `
		INSERT INTO penny_knowledge_documents
			(id, program, jurisdiction, title, source_url, authority, effective_date, review_by, content_hash, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10)
		ON CONFLICT (id) DO UPDATE SET
			program = EXCLUDED.program, jurisdiction = EXCLUDED.jurisdiction,
			title = EXCLUDED.title, source_url = EXCLUDED.source_url,
			authority = EXCLUDED.authority, effective_date = EXCLUDED.effective_date,
			review_by = EXCLUDED.review_by, content_hash = EXCLUDED.content_hash,
			updated_at = EXCLUDED.updated_at`

	if _, err := tx.Exec(ctx, upsert, doc.ID, doc.Program, doc.Jurisdiction, doc.Title,
		doc.SourceURL, doc.Authority, doc.EffectiveDate, doc.ReviewBy, doc.ContentHash, now); err != nil {
		return err
	}

	if _, err := tx.Exec(ctx, `DELETE FROM penny_knowledge_chunks WHERE document_id = $1`, doc.ID); err != nil {
		return err
	}

	const insertChunk = `
		INSERT INTO penny_knowledge_chunks (id, document_id, heading, content, position, created_at)
		VALUES ($1, $2, $3, $4, $5, $6)`
	for _, chunk := range chunks {
		if _, err := tx.Exec(ctx, insertChunk, NewID(), doc.ID, chunk.Heading, chunk.Content, chunk.Position, now); err != nil {
			return err
		}
	}

	return tx.Commit(ctx)
}

// KnowledgeDocumentHash returns a stored document's content hash, so ingest can
// skip a file that has not changed.
func (s *Store) KnowledgeDocumentHash(ctx context.Context, documentID string) (string, error) {
	var hash string
	err := s.pool.QueryRow(ctx,
		`SELECT content_hash FROM penny_knowledge_documents WHERE id = $1`, documentID).Scan(&hash)
	return hash, err
}

type KnowledgeQuery struct {
	Search string
	// Optional program filter: "SNAP", "WIC", ...
	Program string
	// The user's jurisdiction, "US-OH" style. Federal content ("US") is always
	// in scope; a state's content is in scope only for that state.
	Jurisdiction string
	Limit        int
}

// KnowledgeResult is a retrieved chunk with everything needed to cite it.
type KnowledgeResult struct {
	Chunk    KnowledgeChunk
	Citation penny.Citation
	Score    float64
}

// SearchKnowledge retrieves the chunks most relevant to a question, within the
// user's jurisdiction.
func (s *Store) SearchKnowledge(ctx context.Context, query KnowledgeQuery, now time.Time) ([]KnowledgeResult, error) {
	limit := query.Limit
	if limit <= 0 || limit > 10 {
		limit = 4
	}

	const sql = `
		SELECT c.id, c.document_id, c.heading, c.content, c.position,
		       d.title, d.program, d.jurisdiction, d.source_url, d.review_by,
		       ts_rank(to_tsvector('english', d.title || ' ' || c.heading || ' ' || c.content),
		               websearch_to_tsquery('english', $1)) AS score
		FROM penny_knowledge_chunks c
		JOIN penny_knowledge_documents d ON d.id = c.document_id
		WHERE to_tsvector('english', d.title || ' ' || c.heading || ' ' || c.content)
		      @@ websearch_to_tsquery('english', $1)
		  AND ($2::text = '' OR d.program = $2::text)
		  AND (d.jurisdiction = 'US' OR $3::text = '' OR d.jurisdiction = $3::text)
		ORDER BY score DESC, d.effective_date DESC NULLS LAST
		LIMIT $4`

	rows, err := s.pool.Query(ctx, sql, query.Search, query.Program, query.Jurisdiction, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make([]KnowledgeResult, 0, limit)
	for rows.Next() {
		var (
			result   KnowledgeResult
			title    string
			program  string
			juris    string
			source   string
			reviewBy *time.Time
		)
		if err := rows.Scan(&result.Chunk.ID, &result.Chunk.DocumentID, &result.Chunk.Heading,
			&result.Chunk.Content, &result.Chunk.Position,
			&title, &program, &juris, &source, &reviewBy, &result.Score); err != nil {
			return nil, err
		}
		result.Citation = penny.Citation{
			DocumentID:      result.Chunk.DocumentID,
			ChunkID:         result.Chunk.ID,
			Title:           title,
			Heading:         result.Chunk.Heading,
			Program:         program,
			Jurisdiction:    juris,
			SourceURL:       source,
			ReviewedThrough: reviewBy,
			// Past its review date the content still answers the question, but
			// Penny says when it was last checked. Serving stale benefits
			// guidance silently is the worse of the two failures.
			Stale: reviewBy != nil && now.After(*reviewBy),
		}
		out = append(out, result)
	}
	return out, rows.Err()
}
