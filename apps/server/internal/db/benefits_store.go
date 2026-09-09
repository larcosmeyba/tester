package db

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5"
)

// Benefits autofill storage.
//
// Every statement here puts the viewer's user id in its predicate. No method
// takes a user id from anything but the caller's resolved viewer, and there is
// deliberately no query that reads across users.

// BenefitsAnswer is one stored answer, as it sits in the database. It is a
// transport type: the domain decides what an answer means, and this layer only
// moves it. A sensitive answer arrives here already sealed, with Text nil.
type BenefitsAnswer struct {
	FieldPath string
	RowID     string
	GroupPath string
	Status    string
	Kind      string
	Source    string

	Text      *string
	Number    *float64
	Cents     *int64
	Date      *time.Time
	Bool      *bool
	List      []string
	Encrypted []byte
	Hint      *string

	UpdatedAt time.Time
}

// BenefitsGroupRow records that a repeating group entry exists and where it
// sits in order. Its presence is what distinguishes a household with no other
// members from a household nobody has asked about.
type BenefitsGroupRow struct {
	GroupPath string
	RowID     string
	Position  int
}

type BenefitsApplication struct {
	ID           string
	UserID       string
	FormID       string
	FormVersion  string
	FormRevision int
	Status        string
	FailureReason string
	CreatedAt    time.Time
	UpdatedAt    time.Time
	ApprovedAt   *time.Time
}

// BenefitsApplicationField is the audit trail: which profile answer fed which
// box. It never stores the answer itself — that already lives in the profile
// and on the document, and a third copy would be a third thing to protect.
type BenefitsApplicationField struct {
	FieldID     string
	Outcome     string
	FieldPath   string
	ValueSource string
	Page        int
	Detail      string
	IsSensitive bool
}

type BenefitsDocument struct {
	ID            string
	ApplicationID string
	UserID        string
	Kind          string
	StorageKey    string
	SHA256        string
	ByteSize      int64
	IsFlattened   bool
	CreatedAt     time.Time
	PurgeAfter    *time.Time
}

func (s *Store) EnsureBenefitsProfile(ctx context.Context, userID string, vocabularyVersion int) error {
	_, err := s.pool.Exec(ctx, `
		INSERT INTO benefits_profiles (user_id, vocabulary_version)
		VALUES ($1, $2)
		ON CONFLICT (user_id) DO NOTHING
	`, userID, vocabularyVersion)
	return err
}

func (s *Store) BenefitsAnswers(ctx context.Context, userID string) ([]BenefitsAnswer, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT field_path, row_id, group_path, status, kind, source,
		       value_text, value_number, value_cents, value_date, value_bool,
		       value_list, value_encrypted, value_hint, updated_at
		FROM benefits_profile_answers
		WHERE user_id = $1
		ORDER BY field_path, row_id
	`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []BenefitsAnswer
	for rows.Next() {
		var answer BenefitsAnswer
		if err := rows.Scan(
			&answer.FieldPath, &answer.RowID, &answer.GroupPath, &answer.Status, &answer.Kind, &answer.Source,
			&answer.Text, &answer.Number, &answer.Cents, &answer.Date, &answer.Bool,
			&answer.List, &answer.Encrypted, &answer.Hint, &answer.UpdatedAt,
		); err != nil {
			return nil, err
		}
		out = append(out, answer)
	}
	return out, rows.Err()
}

func (s *Store) BenefitsGroupRows(ctx context.Context, userID string) ([]BenefitsGroupRow, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT group_path, row_id, position
		FROM benefits_group_rows
		WHERE user_id = $1
		ORDER BY group_path, position
	`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []BenefitsGroupRow
	for rows.Next() {
		var row BenefitsGroupRow
		if err := rows.Scan(&row.GroupPath, &row.RowID, &row.Position); err != nil {
			return nil, err
		}
		out = append(out, row)
	}
	return out, rows.Err()
}

// UpsertBenefitsAnswers writes scalar answers. An answer whose status is
// unknown is deleted rather than stored: "not asked" is the absence of a row,
// so clearing an answer really clears it instead of leaving a tombstone that
// later reads as an answer.
func (s *Store) UpsertBenefitsAnswers(ctx context.Context, userID string, answers []BenefitsAnswer) error {
	if len(answers) == 0 {
		return nil
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer rollback(ctx, tx)

	if err := upsertAnswers(ctx, tx, userID, answers); err != nil {
		return err
	}
	if err := touchBenefitsProfile(ctx, tx, userID); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

// ReplaceBenefitsGroup swaps a whole repeating group in one transaction: the
// rows, their order and their answers. Replacing rather than merging is what
// makes removing a household member actually remove them.
func (s *Store) ReplaceBenefitsGroup(ctx context.Context, userID, groupPath string, rows []BenefitsGroupRow, answers []BenefitsAnswer) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer rollback(ctx, tx)

	if _, err := tx.Exec(ctx,
		`DELETE FROM benefits_profile_answers WHERE user_id = $1 AND group_path = $2`,
		userID, groupPath); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx,
		`DELETE FROM benefits_group_rows WHERE user_id = $1 AND group_path = $2`,
		userID, groupPath); err != nil {
		return err
	}
	for _, row := range rows {
		if _, err := tx.Exec(ctx, `
			INSERT INTO benefits_group_rows (user_id, group_path, row_id, position)
			VALUES ($1, $2, $3, $4)
		`, userID, row.GroupPath, row.RowID, row.Position); err != nil {
			return err
		}
	}
	if err := upsertAnswers(ctx, tx, userID, answers); err != nil {
		return err
	}
	if err := touchBenefitsProfile(ctx, tx, userID); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func upsertAnswers(ctx context.Context, tx pgx.Tx, userID string, answers []BenefitsAnswer) error {
	for _, answer := range answers {
		if answer.Status == "" || answer.Status == "unknown" {
			if _, err := tx.Exec(ctx, `
				DELETE FROM benefits_profile_answers
				WHERE user_id = $1 AND field_path = $2 AND row_id = $3
			`, userID, answer.FieldPath, answer.RowID); err != nil {
				return err
			}
			continue
		}
		if _, err := tx.Exec(ctx, `
			INSERT INTO benefits_profile_answers (
				user_id, field_path, row_id, group_path, status, kind, source,
				value_text, value_number, value_cents, value_date, value_bool,
				value_list, value_encrypted, value_hint, updated_at
			) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15, now())
			ON CONFLICT (user_id, field_path, row_id) DO UPDATE SET
				group_path = EXCLUDED.group_path,
				status = EXCLUDED.status,
				kind = EXCLUDED.kind,
				source = EXCLUDED.source,
				value_text = EXCLUDED.value_text,
				value_number = EXCLUDED.value_number,
				value_cents = EXCLUDED.value_cents,
				value_date = EXCLUDED.value_date,
				value_bool = EXCLUDED.value_bool,
				value_list = EXCLUDED.value_list,
				value_encrypted = EXCLUDED.value_encrypted,
				value_hint = EXCLUDED.value_hint,
				updated_at = now()
		`,
			userID, answer.FieldPath, answer.RowID, answer.GroupPath, answer.Status, answer.Kind, answer.Source,
			answer.Text, answer.Number, answer.Cents, answer.Date, answer.Bool,
			nullableStringSlice(answer.List), answer.Encrypted, answer.Hint,
		); err != nil {
			return err
		}
	}
	return nil
}

func touchBenefitsProfile(ctx context.Context, tx pgx.Tx, userID string) error {
	_, err := tx.Exec(ctx, `
		INSERT INTO benefits_profiles (user_id) VALUES ($1)
		ON CONFLICT (user_id) DO UPDATE SET updated_at = now()
	`, userID)
	return err
}

// ---------------------------------------------------------------------------
// Applications
// ---------------------------------------------------------------------------

func (s *Store) CreateBenefitsApplication(ctx context.Context, application BenefitsApplication) (BenefitsApplication, error) {
	row := s.pool.QueryRow(ctx, `
		INSERT INTO benefits_applications (id, user_id, form_id, form_version, form_revision, status)
		VALUES ($1, $2, $3, $4, $5, $6)
		RETURNING id, user_id, form_id, form_version, form_revision, status, failure_reason, created_at, updated_at, approved_at
	`, NewID(), application.UserID, application.FormID, application.FormVersion, application.FormRevision, application.Status)
	return scanBenefitsApplication(row)
}

func (s *Store) BenefitsApplication(ctx context.Context, userID, applicationID string) (BenefitsApplication, error) {
	row := s.pool.QueryRow(ctx, `
		SELECT id, user_id, form_id, form_version, form_revision, status, failure_reason, created_at, updated_at, approved_at
		FROM benefits_applications
		WHERE id = $1 AND user_id = $2
	`, applicationID, userID)
	return scanBenefitsApplication(row)
}

func (s *Store) ListBenefitsApplications(ctx context.Context, userID string) ([]BenefitsApplication, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT id, user_id, form_id, form_version, form_revision, status, failure_reason, created_at, updated_at, approved_at
		FROM benefits_applications
		WHERE user_id = $1
		ORDER BY updated_at DESC
	`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []BenefitsApplication
	for rows.Next() {
		application, err := scanBenefitsApplication(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, application)
	}
	return out, rows.Err()
}

// SaveBenefitsApplicationOutcome records a run's status and its per-field audit
// trail in one transaction, so an application's status can never disagree with
// the fields that produced it.
func (s *Store) SaveBenefitsApplicationOutcome(ctx context.Context, userID, applicationID, status, failureReason string, approvedAt *time.Time, fields []BenefitsApplicationField) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer rollback(ctx, tx)

	tag, err := tx.Exec(ctx, `
		UPDATE benefits_applications
		SET status = $3, failure_reason = $4, approved_at = $5, updated_at = now()
		WHERE id = $1 AND user_id = $2
	`, applicationID, userID, status, failureReason, approvedAt)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return pgx.ErrNoRows
	}

	if _, err := tx.Exec(ctx,
		`DELETE FROM benefits_application_fields WHERE application_id = $1`, applicationID); err != nil {
		return err
	}
	for _, field := range fields {
		if _, err := tx.Exec(ctx, `
			INSERT INTO benefits_application_fields
				(application_id, field_id, outcome, field_path, value_source, page, detail, is_sensitive)
			VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
		`, applicationID, field.FieldID, field.Outcome, field.FieldPath, field.ValueSource, field.Page, field.Detail, field.IsSensitive); err != nil {
			return err
		}
	}
	return tx.Commit(ctx)
}

// BenefitsApplicationFields reads a run's audit trail.
//
// It takes the user id and joins on it even though every caller has already
// established ownership. A predicate that is merely implied by the calling
// order is one refactor away from not being there at all, and this table is
// keyed only by application id.
func (s *Store) BenefitsApplicationFields(ctx context.Context, userID, applicationID string) ([]BenefitsApplicationField, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT f.field_id, f.outcome, f.field_path, f.value_source, f.page, f.detail, f.is_sensitive
		FROM benefits_application_fields f
		JOIN benefits_applications a ON a.id = f.application_id
		WHERE f.application_id = $1 AND a.user_id = $2
		ORDER BY f.page, f.field_id
	`, applicationID, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []BenefitsApplicationField
	for rows.Next() {
		var field BenefitsApplicationField
		if err := rows.Scan(&field.FieldID, &field.Outcome, &field.FieldPath,
			&field.ValueSource, &field.Page, &field.Detail, &field.IsSensitive); err != nil {
			return nil, err
		}
		out = append(out, field)
	}
	return out, rows.Err()
}

// SupersedeBenefitsApplications marks a user's other unapproved runs against the
// same form as superseded, so a list of applications does not fill with drafts.
// Approved applications are never touched: what somebody signed stays.
func (s *Store) SupersedeBenefitsApplications(ctx context.Context, userID, formID, keepApplicationID string) error {
	_, err := s.pool.Exec(ctx, `
		UPDATE benefits_applications
		SET status = 'superseded', updated_at = now()
		WHERE user_id = $1 AND form_id = $2 AND id <> $3
		  AND status IN ('draft', 'needs_information', 'ready_for_review', 'failed')
	`, userID, formID, keepApplicationID)
	return err
}

func (s *Store) DeleteBenefitsApplication(ctx context.Context, userID, applicationID string) (bool, error) {
	tag, err := s.pool.Exec(ctx,
		`DELETE FROM benefits_applications WHERE id = $1 AND user_id = $2`, applicationID, userID)
	if err != nil {
		return false, err
	}
	return tag.RowsAffected() > 0, nil
}

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

func (s *Store) InsertBenefitsDocument(ctx context.Context, document BenefitsDocument) (BenefitsDocument, error) {
	row := s.pool.QueryRow(ctx, `
		INSERT INTO benefits_documents
			(id, application_id, user_id, kind, storage_key, sha256, byte_size, is_flattened, purge_after)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
		RETURNING id, application_id, user_id, kind, storage_key, sha256, byte_size, is_flattened, created_at, purge_after
	`, NewID(), document.ApplicationID, document.UserID, document.Kind, document.StorageKey,
		document.SHA256, document.ByteSize, document.IsFlattened, document.PurgeAfter)
	return scanBenefitsDocument(row)
}

// LatestBenefitsDocument returns the newest document of a kind for an
// application, scoped to its owner.
func (s *Store) LatestBenefitsDocument(ctx context.Context, userID, applicationID, kind string) (BenefitsDocument, error) {
	row := s.pool.QueryRow(ctx, `
		SELECT id, application_id, user_id, kind, storage_key, sha256, byte_size, is_flattened, created_at, purge_after
		FROM benefits_documents
		WHERE user_id = $1 AND application_id = $2 AND kind = $3
		ORDER BY created_at DESC
		LIMIT 1
	`, userID, applicationID, kind)
	return scanBenefitsDocument(row)
}

// BenefitsDocumentsForUser lists every stored document, which is what deleting
// an account needs so the files go with the rows.
func (s *Store) BenefitsDocumentsForUser(ctx context.Context, userID string) ([]BenefitsDocument, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT id, application_id, user_id, kind, storage_key, sha256, byte_size, is_flattened, created_at, purge_after
		FROM benefits_documents
		WHERE user_id = $1
	`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []BenefitsDocument
	for rows.Next() {
		document, err := scanBenefitsDocument(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, document)
	}
	return out, rows.Err()
}

// ExpiredBenefitsDocuments lists documents past their purge date, for the
// retention sweep.
func (s *Store) ExpiredBenefitsDocuments(ctx context.Context, now time.Time, limit int) ([]BenefitsDocument, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT id, application_id, user_id, kind, storage_key, sha256, byte_size, is_flattened, created_at, purge_after
		FROM benefits_documents
		WHERE purge_after IS NOT NULL AND purge_after < $1
		ORDER BY purge_after
		LIMIT $2
	`, now, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []BenefitsDocument
	for rows.Next() {
		document, err := scanBenefitsDocument(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, document)
	}
	return out, rows.Err()
}

func (s *Store) DeleteBenefitsDocument(ctx context.Context, documentID string) error {
	_, err := s.pool.Exec(ctx, `DELETE FROM benefits_documents WHERE id = $1`, documentID)
	return err
}

func scanBenefitsApplication(row scanner) (BenefitsApplication, error) {
	var application BenefitsApplication
	err := row.Scan(&application.ID, &application.UserID, &application.FormID, &application.FormVersion,
		&application.FormRevision, &application.Status, &application.FailureReason,
		&application.CreatedAt, &application.UpdatedAt, &application.ApprovedAt)
	return application, err
}

func scanBenefitsDocument(row scanner) (BenefitsDocument, error) {
	var document BenefitsDocument
	err := row.Scan(&document.ID, &document.ApplicationID, &document.UserID, &document.Kind,
		&document.StorageKey, &document.SHA256, &document.ByteSize, &document.IsFlattened,
		&document.CreatedAt, &document.PurgeAfter)
	return document, err
}
