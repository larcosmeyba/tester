package db

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/helpthehive/server/internal/domain/meals"
	"github.com/jackc/pgx/v5/pgconn"
)

const recipeImportColumns = `
	id, user_id, source_url, source_platform, language, status, provider_job_id, recipe_id,
	recipe_draft, attempt_count, error_code, error_message, created_at, started_at,
	completed_at, updated_at`

// ErrImportInProgress is returned when a user already has a live import of the
// same video. It is enforced by a partial unique index, not by a prior read:
// two simultaneous requests must not both get past a check and each buy a
// transcription.
var ErrImportInProgress = errors.New("an import of that video is already running")

func scanRecipeImport(row scanner) (meals.RecipeImport, error) {
	var (
		imp   meals.RecipeImport
		draft []byte
	)
	err := row.Scan(
		&imp.ID, &imp.UserID, &imp.SourceURL, &imp.SourcePlatform, &imp.Language, &imp.Status,
		&imp.ProviderJobID, &imp.RecipeID, &draft, &imp.AttemptCount,
		&imp.ErrorCode, &imp.ErrorMessage, &imp.CreatedAt, &imp.StartedAt,
		&imp.CompletedAt, &imp.UpdatedAt,
	)
	if err != nil {
		return meals.RecipeImport{}, err
	}
	if len(draft) > 0 {
		recipe, err := decodeRecipeDraft(draft)
		if err != nil {
			return meals.RecipeImport{}, err
		}
		imp.Draft = &recipe
	}
	return imp, nil
}

// CreateRecipeImport records a new import in the queued state.
//
// The caller supplies the id and the user: nothing here reads the user from
// the import, because every statement in this file puts the user id in its
// predicate rather than trusting a field.
func (s *Store) CreateRecipeImport(ctx context.Context, imp meals.RecipeImport) (meals.RecipeImport, error) {
	row := s.pool.QueryRow(ctx, `
		INSERT INTO recipe_imports (id, user_id, source_url, source_platform, language, status, attempt_count)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
		RETURNING `+recipeImportColumns,
		imp.ID, imp.UserID, imp.SourceURL, imp.SourcePlatform, defaultLanguage(imp.Language),
		meals.ImportStatusQueued, imp.AttemptCount,
	)

	created, err := scanRecipeImport(row)
	if isUniqueViolation(err) {
		return meals.RecipeImport{}, ErrImportInProgress
	}
	return created, err
}

// GetRecipeImport reads one of a user's imports.
//
// Ownership is in the predicate, not checked afterwards: a row belonging to
// somebody else is never read, so it cannot be leaked by a later mistake.
func (s *Store) GetRecipeImport(ctx context.Context, userID string, importID string) (meals.RecipeImport, error) {
	row := s.pool.QueryRow(ctx, `
		SELECT `+recipeImportColumns+`
		FROM recipe_imports
		WHERE id = $1 AND user_id = $2`,
		importID, userID,
	)
	return scanRecipeImport(row)
}

// ListRecipeImports returns a user's imports, newest first.
func (s *Store) ListRecipeImports(ctx context.Context, userID string, limit int) ([]meals.RecipeImport, error) {
	if limit <= 0 || limit > 100 {
		limit = 25
	}
	rows, err := s.pool.Query(ctx, `
		SELECT `+recipeImportColumns+`
		FROM recipe_imports
		WHERE user_id = $1
		ORDER BY created_at DESC
		LIMIT $2`,
		userID, limit,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	imports := make([]meals.RecipeImport, 0)
	for rows.Next() {
		imp, err := scanRecipeImport(rows)
		if err != nil {
			return nil, err
		}
		imports = append(imports, imp)
	}
	return imports, rows.Err()
}

// StartRecipeImport records that the extraction service accepted the job.
//
// Guarded on the current status so a cancellation that lands while the start
// request is in flight is not overwritten by its reply.
func (s *Store) StartRecipeImport(ctx context.Context, importID string, providerJobID string) (meals.RecipeImport, error) {
	row := s.pool.QueryRow(ctx, `
		UPDATE recipe_imports
		SET status = $2, provider_job_id = $3, started_at = COALESCE(started_at, now()), updated_at = now()
		WHERE id = $1 AND status = $4
		RETURNING `+recipeImportColumns,
		importID, meals.ImportStatusRunning, providerJobID, meals.ImportStatusQueued,
	)
	return scanRecipeImport(row)
}

// CompleteRecipeImport stores the extracted draft and settles the import.
//
// The draft is stored as it will be saved — the conversion into the Standard
// HTH Recipe Object happens once, before this — so accepting it later is a
// write, not a second interpretation.
func (s *Store) CompleteRecipeImport(ctx context.Context, importID string, draft meals.Recipe) (meals.RecipeImport, error) {
	encoded, err := encodeRecipeDraft(draft)
	if err != nil {
		return meals.RecipeImport{}, err
	}

	row := s.pool.QueryRow(ctx, `
		UPDATE recipe_imports
		SET status = $2, recipe_draft = $3, error_code = NULL, error_message = NULL,
		    completed_at = now(), updated_at = now()
		WHERE id = $1 AND status IN ($4, $5)
		RETURNING `+recipeImportColumns,
		importID, meals.ImportStatusSucceeded, encoded,
		meals.ImportStatusQueued, meals.ImportStatusRunning,
	)
	return scanRecipeImport(row)
}

// FailRecipeImport settles the import with a named failure.
func (s *Store) FailRecipeImport(ctx context.Context, importID string, code string, message string) (meals.RecipeImport, error) {
	row := s.pool.QueryRow(ctx, `
		UPDATE recipe_imports
		SET status = $2, error_code = $3, error_message = $4, completed_at = now(), updated_at = now()
		WHERE id = $1 AND status IN ($5, $6)
		RETURNING `+recipeImportColumns,
		importID, meals.ImportStatusFailed, code, message,
		meals.ImportStatusQueued, meals.ImportStatusRunning,
	)
	return scanRecipeImport(row)
}

// CancelRecipeImport stops an import that has not settled.
//
// Scoped to the user, and guarded on the status so a cancel racing a
// completion cannot undo a finished import.
func (s *Store) CancelRecipeImport(ctx context.Context, userID string, importID string) (meals.RecipeImport, error) {
	row := s.pool.QueryRow(ctx, `
		UPDATE recipe_imports
		SET status = $3, completed_at = now(), updated_at = now()
		WHERE id = $1 AND user_id = $2 AND status IN ($4, $5)
		RETURNING `+recipeImportColumns,
		importID, userID, meals.ImportStatusCancelled,
		meals.ImportStatusQueued, meals.ImportStatusRunning,
	)
	return scanRecipeImport(row)
}

// LinkRecipeImportRecipe points a settled import at the recipe it produced.
//
// Idempotent: accepting the same draft twice writes the same id.
func (s *Store) LinkRecipeImportRecipe(ctx context.Context, userID string, importID string, recipeID string) (meals.RecipeImport, error) {
	row := s.pool.QueryRow(ctx, `
		UPDATE recipe_imports
		SET recipe_id = $3, updated_at = now()
		WHERE id = $1 AND user_id = $2 AND status = $4
		RETURNING `+recipeImportColumns,
		importID, userID, recipeID, meals.ImportStatusSucceeded,
	)
	return scanRecipeImport(row)
}

// TouchRecipeImport records that an in-flight import was polled, so imports
// abandoned by a service restart can be found by how long they have been quiet.
func (s *Store) TouchRecipeImport(ctx context.Context, importID string, at time.Time) error {
	_, err := s.pool.Exec(ctx, `
		UPDATE recipe_imports SET updated_at = $2
		WHERE id = $1 AND status IN ($3, $4)`,
		importID, at, meals.ImportStatusQueued, meals.ImportStatusRunning,
	)
	return err
}

func isUniqueViolation(err error) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && pgErr.Code == "23505"
}

// CountRecipeImportsSince counts a user's imports started in a window. It is
// the input to rate limiting: every import costs a transcription, so the limit
// is on attempts made, not on imports that happened to succeed.
func (s *Store) CountRecipeImportsSince(ctx context.Context, userID string, since time.Time) (int, error) {
	var count int
	err := s.pool.QueryRow(ctx, `
		SELECT count(*) FROM recipe_imports
		WHERE user_id = $1 AND created_at >= $2`,
		userID, since,
	).Scan(&count)
	return count, err
}

// ClaimStaleRecipeImports takes ownership of imports that have gone quiet.
//
// Claiming is the UPDATE itself: bumping updated_at inside the same statement
// that selects the rows means a second worker looking for rows "not touched
// since" cannot also pick them up. FOR UPDATE SKIP LOCKED keeps two workers
// running at the same instant from blocking on each other.
//
// This is what makes an import durable. Nothing here depends on the user
// polling, and an import abandoned by a restart of the extraction service is
// found by how long it has been silent.
func (s *Store) ClaimStaleRecipeImports(ctx context.Context, quietSince time.Time, limit int) ([]meals.RecipeImport, error) {
	if limit <= 0 || limit > 100 {
		limit = 20
	}
	rows, err := s.pool.Query(ctx, `
		UPDATE recipe_imports SET updated_at = now()
		WHERE id IN (
			SELECT id FROM recipe_imports
			WHERE status IN ($1, $2) AND updated_at < $3
			ORDER BY updated_at ASC
			LIMIT $4
			FOR UPDATE SKIP LOCKED
		)
		RETURNING `+recipeImportColumns,
		meals.ImportStatusQueued, meals.ImportStatusRunning, quietSince, limit,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	claimed := make([]meals.RecipeImport, 0)
	for rows.Next() {
		imp, err := scanRecipeImport(rows)
		if err != nil {
			return nil, err
		}
		claimed = append(claimed, imp)
	}
	return claimed, rows.Err()
}

// RetryRecipeImport puts an unfinished import back in the queue and counts the
// attempt.
//
// The attempt guard is in the WHERE clause, so exhausting the budget is a row
// that does not update rather than a decision made in Go — two workers cannot
// both read "2 attempts used" and each spend a third.
//
// Returns pgx.ErrNoRows when the import has settled or has no attempts left;
// the caller fails it.
func (s *Store) RetryRecipeImport(ctx context.Context, importID string, maxAttempts int) (meals.RecipeImport, error) {
	row := s.pool.QueryRow(ctx, `
		UPDATE recipe_imports
		SET status = $2, provider_job_id = NULL, attempt_count = attempt_count + 1,
		    error_code = NULL, error_message = NULL, started_at = NULL, updated_at = now()
		WHERE id = $1 AND status IN ($3, $4) AND attempt_count < $5
		RETURNING `+recipeImportColumns,
		importID, meals.ImportStatusQueued,
		meals.ImportStatusQueued, meals.ImportStatusRunning, maxAttempts,
	)
	return scanRecipeImport(row)
}

// defaultLanguage keeps the column non-null when the caller did not ask for a
// particular language.
func defaultLanguage(language string) string {
	if strings.TrimSpace(language) == "" {
		return "english"
	}
	return language
}
