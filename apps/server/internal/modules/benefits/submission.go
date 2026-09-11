package benefits

import (
	"context"
	"fmt"
	"strings"

	"github.com/helpthehive/server/internal/auth"
	"github.com/helpthehive/server/internal/db"
	domain "github.com/helpthehive/server/internal/domain/benefits"
	"github.com/helpthehive/server/internal/modules/benefits/filingkit"
)

// Submission Phase 1: the applicant's typed signature, the confirmation
// number from the official portal, and the filing-kit answer sheet.
//
// The through-line: Penny does the paperwork, the applicant signs, and the
// actual submission always happens on the official portal in the applicant's
// own session. This file holds the server side of that handoff. There is no
// submission code path here — only preparation, signature, recording, and
// routing.

// ---------------------------------------------------------------------------
// Signature validation
// ---------------------------------------------------------------------------

// validateSignature checks the typed signature before anything else happens.
// It is pure so the rule is testable without a database: a blank name and a
// missing attestation are both refusals, and the trimmed name is what gets
// recorded — never a pre-filled value, which the server has no source for.
func validateSignature(signedName string, attestationAccepted bool) (string, error) {
	name := strings.TrimSpace(signedName)
	if name == "" {
		return "", domain.ErrSignatureRequired
	}
	if !attestationAccepted {
		return "", domain.ErrAttestationRequired
	}
	return name, nil
}

// ---------------------------------------------------------------------------
// Confirmation capture
// ---------------------------------------------------------------------------

// RecordBenefitsConfirmation records the confirmation number the applicant
// received after applying on the official portal.
//
// Ownership: the viewer's own application only; anything else is NOT_FOUND,
// never FORBIDDEN. The number is trimmed and must be non-empty; it is stored
// verbatim and never validated against anything external. On a completed
// application it also feeds the renewal schedule: the renewal row for this
// application becomes user-confirmed, or one is created through the existing
// rule path when none exists. A renewal failure never fails the recording —
// the number is user data, and the reminder is auxiliary.
//
// The confirmation number never reaches the logs.
func (s *Service) RecordBenefitsConfirmation(ctx context.Context, identity auth.Identity, applicationID, confirmationNumber string) (Application, error) {
	userID, err := s.userID(ctx, identity)
	if err != nil {
		return Application{}, err
	}
	record, err := s.store.BenefitsApplication(ctx, userID, strings.TrimSpace(applicationID))
	if db.IsNotFound(err) {
		return Application{}, domain.ErrNotFound
	}
	if err != nil {
		return Application{}, err
	}
	number := strings.TrimSpace(confirmationNumber)
	if number == "" {
		return Application{}, fmt.Errorf("%w: a confirmation number is required", domain.ErrInvalidValue)
	}

	recordedAt := s.now().UTC()
	if err := s.store.RecordBenefitsConfirmation(ctx, userID, record.ID, number, recordedAt); err != nil {
		if db.IsNotFound(err) {
			return Application{}, domain.ErrNotFound
		}
		return Application{}, err
	}
	record.ConfirmationNumber = &number
	record.ConfirmationRecordedAt = &recordedAt

	// Only a completed application feeds the renewal schedule: the renewal
	// keys off the final application, and inventing one for a draft would
	// manufacture a deadline the applicant never earned.
	if record.Status == StatusCompleted {
		s.confirmRenewalSource(ctx, userID, record)
	}

	s.logger.Info("benefits confirmation recorded",
		"application_id", record.ID,
	)

	return s.view(ctx, userID, record)
}

// confirmRenewalSource marks the renewal for an application user-confirmed
// after the applicant recorded their portal confirmation number. When no
// renewal row exists — e.g. the application was approved before the renewal
// system existed — one is created through the existing rule path, which
// derives the due date from the program rule and never invents one.
func (s *Service) confirmRenewalSource(ctx context.Context, userID string, record db.BenefitsApplication) {
	renewal, err := s.store.BenefitsRenewalForApplication(ctx, userID, record.ID)
	switch {
	case err == nil:
		if renewal.Source == db.RenewalSourceUserConfirmed {
			return
		}
		if err := s.store.SetBenefitsRenewalSource(ctx, userID, renewal.ID, db.RenewalSourceUserConfirmed); err != nil {
			s.logger.Error("benefits renewal source could not be confirmed",
				"renewal_id", renewal.ID, "error", err)
		}
	case db.IsNotFound(err):
		form, formErr := s.formFor(record)
		if formErr != nil {
			// Without the form there is no program or state to key a renewal
			// off, and a renewal without them would be invented data.
			s.logger.Error("benefits renewal not scheduled after confirmation: form unavailable",
				"application_id", record.ID, "error", formErr)
			return
		}
		anchor := s.now().UTC()
		if record.ApprovedAt != nil {
			anchor = *record.ApprovedAt
		}
		s.scheduleRenewal(ctx, userID, record, form, anchor)
	default:
		s.logger.Error("benefits renewal lookup failed after confirmation",
			"application_id", record.ID, "error", err)
	}
}

// ---------------------------------------------------------------------------
// Filing kit
// ---------------------------------------------------------------------------

// FilingKit generates the transcription answer-sheet PDF for an application:
// the applicant's answers laid out as a ruled sheet for copying onto the
// official paper form by hand. Ownership-scoped like every other document:
// the viewer's own application only, NOT_FOUND otherwise.
func (s *Service) FilingKit(ctx context.Context, identity auth.Identity, applicationID string) ([]byte, error) {
	userID, err := s.userID(ctx, identity)
	if err != nil {
		return nil, err
	}
	record, err := s.store.BenefitsApplication(ctx, userID, strings.TrimSpace(applicationID))
	if db.IsNotFound(err) {
		return nil, domain.ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	form, err := s.formFor(record)
	if err != nil {
		return nil, err
	}
	profile, err := s.loadProfile(ctx, userID)
	if err != nil {
		return nil, err
	}

	kit, err := filingkit.Generate(profile, filingkit.FormInfo{
		Title:     form.Mapping.FormTitle,
		FormCode:  form.Mapping.FormCode,
		Version:   form.Mapping.FormVersion,
		State:     form.Mapping.Jurisdiction.State,
		Program:   form.Mapping.Program,
		AgencyURL: form.Mapping.AgencyURL,
	}, s.now().UTC())
	if err != nil {
		return nil, err
	}
	data, err := filingkit.Render(kit)
	if err != nil {
		return nil, err
	}

	// Counts and hashes, never values.
	s.logger.Info("benefits filing kit generated",
		"application_id", record.ID,
		"form", form.Key(),
		"bytes", len(data),
	)
	return data, nil
}
