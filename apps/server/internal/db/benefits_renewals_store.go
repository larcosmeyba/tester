package db

import (
	"context"
	"database/sql"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
)

// Benefits renewal scheduling.
//
// A renewal row keys off the FINAL application and stores only program, state,
// form id and dates — no answers, no PII beyond the user id it belongs to.
// Every statement here puts the viewer's user id in its predicate, except the
// sweep query, which is internal-only and reads across users by design; the
// sweep never logs or returns user-identifying details.

// Renewal sources.
const (
	RenewalSourceRuleDerived   = "rule-derived"
	RenewalSourceUserConfirmed = "user-confirmed"
)

// Renewal statuses.
const (
	RenewalStatusScheduled = "scheduled"
	RenewalStatusReminded  = "reminded"
	RenewalStatusStarted   = "started"
	RenewalStatusDone      = "done"
	RenewalStatusDismissed = "dismissed"
)

// BenefitsRenewal is one scheduled renewal reminder, as it sits in the
// database.
type BenefitsRenewal struct {
	ID                  string
	UserID              string
	ApplicationID       string
	Program             string
	State               string
	FormID              string
	CertificationEndsAt *time.Time
	RenewalDueAt        time.Time
	Source              string
	Status              string
	ReminderStage       int
	CreatedAt           time.Time
	UpdatedAt           time.Time
}

// BenefitsProgramRule is reference data: a typical certification period for a
// program, optionally per state ('*' is the national default). Never PII.
type BenefitsProgramRule struct {
	Program          string
	State            string
	CertPeriodMonths *int
	SourceCitation   string
	Notes            *string
}

// ErrRenewalAlreadyHandled reports that a renewal's reminder stage moved since
// the sweep read it — another pass (or this one, retried) already handled it —
// or that the (renewal, stage) send claim is already taken. The sweep treats
// this as "skip", not as a failure.
var ErrRenewalAlreadyHandled = errors.New("benefits renewal reminder stage already advanced")

// CreateBenefitsRenewal schedules a renewal for a final application.
func (s *Store) CreateBenefitsRenewal(ctx context.Context, renewal BenefitsRenewal) (BenefitsRenewal, error) {
	row := s.pool.QueryRow(ctx, `
		INSERT INTO benefits_renewals
			(id, user_id, application_id, program, state, form_id,
			 certification_ends_at, renewal_due_at, source, status, reminder_stage)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
		RETURNING id, user_id, application_id, program, state, form_id,
			certification_ends_at, renewal_due_at, source, status, reminder_stage,
			created_at, updated_at
	`, NewID(), renewal.UserID, renewal.ApplicationID, renewal.Program, renewal.State,
		renewal.FormID, renewal.CertificationEndsAt, renewal.RenewalDueAt,
		renewal.Source, renewal.Status, renewal.ReminderStage)
	return scanBenefitsRenewal(row)
}

// BenefitsRenewal returns one renewal belonging to the viewer.
func (s *Store) BenefitsRenewal(ctx context.Context, userID, renewalID string) (BenefitsRenewal, error) {
	row := s.pool.QueryRow(ctx, `
		SELECT id, user_id, application_id, program, state, form_id,
			certification_ends_at, renewal_due_at, source, status, reminder_stage,
			created_at, updated_at
		FROM benefits_renewals
		WHERE id = $1 AND user_id = $2
	`, renewalID, userID)
	return scanBenefitsRenewal(row)
}

// ListBenefitsRenewals returns the viewer's renewals, soonest first.
func (s *Store) ListBenefitsRenewals(ctx context.Context, userID string) ([]BenefitsRenewal, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT id, user_id, application_id, program, state, form_id,
			certification_ends_at, renewal_due_at, source, status, reminder_stage,
			created_at, updated_at
		FROM benefits_renewals
		WHERE user_id = $1
		ORDER BY renewal_due_at ASC
	`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []BenefitsRenewal
	for rows.Next() {
		renewal, err := scanBenefitsRenewal(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, renewal)
	}
	return out, rows.Err()
}

// ConfirmBenefitsRenewalDeadline records the user's own deadline: the source
// becomes user-confirmed and the dates are theirs, not the rule's. A finished
// or dismissed renewal cannot be re-dated.
func (s *Store) ConfirmBenefitsRenewalDeadline(ctx context.Context, userID, renewalID string, renewalDueAt time.Time, certificationEndsAt *time.Time) (BenefitsRenewal, error) {
	row := s.pool.QueryRow(ctx, `
		UPDATE benefits_renewals
		SET renewal_due_at = $3,
		    certification_ends_at = $4,
		    source = $5,
		    updated_at = now()
		WHERE id = $1 AND user_id = $2
		  AND status NOT IN ('done', 'dismissed')
		RETURNING id, user_id, application_id, program, state, form_id,
			certification_ends_at, renewal_due_at, source, status, reminder_stage,
			created_at, updated_at
	`, renewalID, userID, renewalDueAt, certificationEndsAt, RenewalSourceUserConfirmed)
	return scanBenefitsRenewal(row)
}

// SetBenefitsRenewalStatus moves a renewal to a new status.
func (s *Store) SetBenefitsRenewalStatus(ctx context.Context, userID, renewalID, status string) (bool, error) {
	tag, err := s.pool.Exec(ctx, `
		UPDATE benefits_renewals
		SET status = $3, updated_at = now()
		WHERE id = $1 AND user_id = $2
	`, renewalID, userID, status)
	if err != nil {
		return false, err
	}
	return tag.RowsAffected() > 0, nil
}

// DueBenefitsRenewalsForReminder is the sweep query. It returns renewals whose
// due date is within the stage's offset and whose stage has not been sent yet.
//
// It is deliberately NOT scoped to a user: it is only ever called by the
// internal renewal sweep, which re-resolves each renewal's owner before doing
// anything user-visible, and which logs counts rather than identities.
func (s *Store) DueBenefitsRenewalsForReminder(ctx context.Context, now time.Time, offset time.Duration, stage int) ([]BenefitsRenewal, error) {
	// The bound is computed in Go rather than as now() + $2::interval: the
	// reminder offsets are fixed durations, and passing a single timestamptz
	// keeps the query free of type-resolution surprises.
	dueBefore := now.Add(offset)
	rows, err := s.pool.Query(ctx, `
		SELECT id, user_id, application_id, program, state, form_id,
			certification_ends_at, renewal_due_at, source, status, reminder_stage,
			created_at, updated_at
		FROM benefits_renewals
		WHERE renewal_due_at <= $1
		  AND reminder_stage = $2 - 1
		  AND status IN ('scheduled', 'reminded')
		ORDER BY renewal_due_at ASC
		LIMIT 500
	`, dueBefore, stage)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []BenefitsRenewal
	for rows.Next() {
		renewal, err := scanBenefitsRenewal(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, renewal)
	}
	return out, rows.Err()
}

// AdvanceRenewalReminderStage moves a renewal's reminder stage without sending
// — used when there is nothing to send to (opted-out user, no push tokens).
// The expected current stage is part of the predicate, so two sweeps cannot
// both advance the same row.
func (s *Store) AdvanceRenewalReminderStage(ctx context.Context, renewalID, userID string, fromStage, toStage int) error {
	tag, err := s.pool.Exec(ctx, `
		UPDATE benefits_renewals
		SET reminder_stage = $4, status = 'reminded', updated_at = now()
		WHERE id = $1 AND user_id = $2
		  AND reminder_stage = $3
		  AND status IN ('scheduled', 'reminded')
	`, renewalID, userID, fromStage, toStage)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrRenewalAlreadyHandled
	}
	return nil
}

// ClaimRenewalReminderSend claims the (renewal, stage) send exactly once.
//
// Inside one transaction it re-checks the renewal's stage under a row lock,
// inserts the send-claim row — the PRIMARY KEY on (renewal_id, stage) makes a
// second claim impossible — and advances the reminder stage. The transaction
// commits BEFORE the caller performs the external Expo send, so a crashed or
// retried sweep finds the claim already taken and never sends twice.
//
// The tradeoff is deliberate: a crash after the claim commits but before the
// HTTP send skips that reminder instead of risking a duplicate. The sweep is
// at-most-once per stage, never at-least-once.
func (s *Store) ClaimRenewalReminderSend(ctx context.Context, renewalID, userID string, fromStage, toStage int) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer rollback(ctx, tx)

	var currentStage int
	var status string
	if err := tx.QueryRow(ctx, `
		SELECT reminder_stage, status
		FROM benefits_renewals
		WHERE id = $1 AND user_id = $2
		FOR UPDATE
	`, renewalID, userID).Scan(&currentStage, &status); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrRenewalAlreadyHandled
		}
		return err
	}
	if currentStage != fromStage || (status != RenewalStatusScheduled && status != RenewalStatusReminded) {
		return ErrRenewalAlreadyHandled
	}

	tag, err := tx.Exec(ctx, `
		INSERT INTO benefits_renewal_sends (renewal_id, stage)
		VALUES ($1, $2)
		ON CONFLICT DO NOTHING
	`, renewalID, toStage)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		// Another claim already took this (renewal, stage) pair.
		return ErrRenewalAlreadyHandled
	}

	if _, err := tx.Exec(ctx, `
		UPDATE benefits_renewals
		SET reminder_stage = $3, status = 'reminded', updated_at = now()
		WHERE id = $1 AND user_id = $2
	`, renewalID, userID, toStage); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

// ---------------------------------------------------------------------------
// Program rules (reference data)
// ---------------------------------------------------------------------------

// BenefitsProgramRule returns the rule for a program and state, falling back
// to the national ('*') default. pgx.ErrNoRows when no rule exists at all.
func (s *Store) BenefitsProgramRule(ctx context.Context, program, state string) (BenefitsProgramRule, error) {
	row := s.pool.QueryRow(ctx, `
		SELECT program, state, cert_period_months, source_citation, notes
		FROM benefits_program_rules
		WHERE program = $1 AND state IN ($2, '*')
		ORDER BY CASE WHEN state = '*' THEN 1 ELSE 0 END
		LIMIT 1
	`, program, state)
	return scanBenefitsProgramRule(row)
}

// ListBenefitsProgramRules lists the rules, optionally filtered by program.
// Reference data: the same rows for every user.
func (s *Store) ListBenefitsProgramRules(ctx context.Context, program string) ([]BenefitsProgramRule, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT program, state, cert_period_months, source_citation, notes
		FROM benefits_program_rules
		WHERE $1 = '' OR program = $1
		ORDER BY program, state
	`, program)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []BenefitsProgramRule
	for rows.Next() {
		rule, err := scanBenefitsProgramRule(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, rule)
	}
	return out, rows.Err()
}

func scanBenefitsRenewal(row scanner) (BenefitsRenewal, error) {
	var renewal BenefitsRenewal
	var certificationEndsAt sql.NullTime
	err := row.Scan(
		&renewal.ID, &renewal.UserID, &renewal.ApplicationID, &renewal.Program, &renewal.State, &renewal.FormID,
		&certificationEndsAt, &renewal.RenewalDueAt, &renewal.Source, &renewal.Status, &renewal.ReminderStage,
		&renewal.CreatedAt, &renewal.UpdatedAt,
	)
	if err != nil {
		return BenefitsRenewal{}, err
	}
	renewal.CertificationEndsAt = nullTimePtr(certificationEndsAt)
	return renewal, nil
}

func scanBenefitsProgramRule(row scanner) (BenefitsProgramRule, error) {
	var rule BenefitsProgramRule
	var certPeriodMonths sql.NullInt32
	var notes sql.NullString
	err := row.Scan(&rule.Program, &rule.State, &certPeriodMonths, &rule.SourceCitation, &notes)
	if err != nil {
		return BenefitsProgramRule{}, err
	}
	if certPeriodMonths.Valid {
		months := int(certPeriodMonths.Int32)
		rule.CertPeriodMonths = &months
	}
	rule.Notes = nullStringPtr(notes)
	return rule, nil
}
