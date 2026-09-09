package benefits

import (
	"context"
	"errors"
	"math"
	"strings"
	"time"

	"github.com/helpthehive/server/internal/auth"
	"github.com/helpthehive/server/internal/db"
	domain "github.com/helpthehive/server/internal/domain/benefits"
	"github.com/helpthehive/server/internal/notify"
)

// Renewal reminder stages and their offsets: 30 days, 7 days and 1 day before
// the due date. Reminder_stage n means "stage n has been sent".
var RenewalReminderOffsets = map[int]time.Duration{
	1: 30 * 24 * time.Hour,
	2: 7 * 24 * time.Hour,
	3: 24 * time.Hour,
}

// defaultCertPeriodMonths is the fallback certification period when no program
// rule exists. It is a scheduling default, presented to the user as
// "typical — confirm yours", never a statement about their case.
const defaultCertPeriodMonths = 12

// RenewalPushSender delivers renewal reminders. notify.Client implements it;
// tests fake it.
type RenewalPushSender interface {
	Send(ctx context.Context, tokens []string, message notify.Message) (unregistered []string, err error)
}

// Renewals lists the viewer's renewal reminders, soonest first.
func (s *Service) Renewals(ctx context.Context, identity auth.Identity) ([]db.BenefitsRenewal, error) {
	userID, err := s.userID(ctx, identity)
	if err != nil {
		return nil, err
	}
	return s.store.ListBenefitsRenewals(ctx, userID)
}

// ProgramRules lists the reference certification-period rules, optionally
// filtered by program. Reference data: the same rows for every user.
func (s *Service) ProgramRules(ctx context.Context, identity auth.Identity, program string) ([]db.BenefitsProgramRule, error) {
	if _, err := s.userID(ctx, identity); err != nil {
		return nil, err
	}
	return s.store.ListBenefitsProgramRules(ctx, strings.TrimSpace(program))
}

// ConfirmRenewalDeadline records the user's own deadline. The source becomes
// user-confirmed and the dates are theirs, not the rule's. A renewal the
// viewer may not see — or one that is finished or dismissed — is reported as
// not found rather than forbidden.
func (s *Service) ConfirmRenewalDeadline(ctx context.Context, identity auth.Identity, renewalID string, renewalDueAt time.Time, certificationEndsAt *time.Time) (db.BenefitsRenewal, error) {
	userID, err := s.userID(ctx, identity)
	if err != nil {
		return db.BenefitsRenewal{}, err
	}
	var endsAt *time.Time
	if certificationEndsAt != nil {
		utc := certificationEndsAt.UTC()
		endsAt = &utc
	}
	renewal, err := s.store.ConfirmBenefitsRenewalDeadline(ctx, userID, strings.TrimSpace(renewalID), renewalDueAt.UTC(), endsAt)
	if db.IsNotFound(err) {
		return db.BenefitsRenewal{}, domain.ErrNotFound
	}
	return renewal, err
}

// StartRenewalApplication starts a fresh application on the renewal's form,
// pre-filled from the user's profile — the one-tap renewal. The renewal is
// marked started; the new application is the source of truth from here on.
func (s *Service) StartRenewalApplication(ctx context.Context, identity auth.Identity, renewalID string) (Application, error) {
	userID, err := s.userID(ctx, identity)
	if err != nil {
		return Application{}, err
	}
	renewal, err := s.store.BenefitsRenewal(ctx, userID, strings.TrimSpace(renewalID))
	if db.IsNotFound(err) {
		return Application{}, domain.ErrNotFound
	}
	if err != nil {
		return Application{}, err
	}
	if renewal.Status == db.RenewalStatusDone || renewal.Status == db.RenewalStatusDismissed {
		return Application{}, domain.ErrNotFound
	}
	application, err := s.StartApplication(ctx, identity, renewal.FormID)
	if err != nil {
		return Application{}, err
	}
	// The renewal is underway whether or not this write lands: the application
	// is the source of truth and the status is a hint, so a failed status
	// write is logged, not returned.
	if _, err := s.store.SetBenefitsRenewalStatus(ctx, userID, renewal.ID, db.RenewalStatusStarted); err != nil {
		s.logger.Error("benefits renewal could not be marked started",
			"renewal_id", renewal.ID, "error", err)
	}
	return application, nil
}

// DismissRenewal drops a renewal reminder. True when a row was dismissed.
func (s *Service) DismissRenewal(ctx context.Context, identity auth.Identity, renewalID string) (bool, error) {
	userID, err := s.userID(ctx, identity)
	if err != nil {
		return false, err
	}
	return s.store.SetBenefitsRenewalStatus(ctx, userID, strings.TrimSpace(renewalID), db.RenewalStatusDismissed)
}

// UpdateRenewalPreferences sets the two renewal notification flags.
func (s *Service) UpdateRenewalPreferences(ctx context.Context, identity auth.Identity, alertsEnabled, discreetLockScreen bool) (db.Preferences, error) {
	return s.users.UpdatePreferences(ctx, identity, db.PreferencesPatch{
		BenefitsRenewalNotificationsEnabled: &alertsEnabled,
		BenefitsRenewalDiscreetLockScreen:   &discreetLockScreen,
	})
}

// ---------------------------------------------------------------------------
// Renewal scheduling on approval
// ---------------------------------------------------------------------------

// scheduleRenewal creates the renewal row after a successful approval, keyed
// off the final application: program, state and form id from the application,
// the due date from the rule-derived certification period.
//
// A scheduling failure must never fail the approval — the flattened document
// is the record, and the reminder is auxiliary — so every failure path here
// logs and returns.
func (s *Service) scheduleRenewal(ctx context.Context, userID string, record db.BenefitsApplication, form *Form, approvedAt time.Time) {
	program := form.Mapping.Program
	state := form.Mapping.Jurisdiction.State

	months := defaultCertPeriodMonths
	rule, err := s.store.BenefitsProgramRule(ctx, program, state)
	switch {
	case err == nil && rule.CertPeriodMonths != nil:
		months = *rule.CertPeriodMonths
	case err == nil:
		// A rule exists but states no fixed period (VA one-time claims, SSI
		// redeterminations): there is nothing honest to schedule. The user can
		// still set their own date once a row exists — but no row is invented.
		s.logger.Info("benefits renewal not scheduled: no fixed certification period")
		return
	case db.IsNotFound(err):
		s.logger.Info("benefits renewal scheduled with default period: no program rule")
	default:
		s.logger.Error("benefits renewal not scheduled: rule lookup failed", "error", err)
		return
	}

	due := approvedAt.AddDate(0, months, 0)
	if _, err := s.store.CreateBenefitsRenewal(ctx, db.BenefitsRenewal{
		UserID:              userID,
		ApplicationID:       record.ID,
		Program:             program,
		State:               state,
		FormID:              record.FormID,
		CertificationEndsAt: &due,
		RenewalDueAt:        due,
		Source:              db.RenewalSourceRuleDerived,
		Status:              db.RenewalStatusScheduled,
	}); err != nil {
		s.logger.Error("benefits renewal could not be scheduled",
			"application_id", record.ID, "error", err)
	}
}

// ---------------------------------------------------------------------------
// Renewal sweep
// ---------------------------------------------------------------------------

// SweepCounts tallies one sweep pass. Due counts renewals the sweep looked at;
// the rest count what happened to them.
type SweepCounts struct {
	Due     int `json:"due"`
	Sent    int `json:"sent"`
	Skipped int `json:"skipped"`
	Failed  int `json:"failed"`
}

// ErrReminderSkipped marks a renewal the sweep deliberately did not push:
// the user opted out of notifications, or there is no device token to send
// to. The stage is still advanced so the sweep stops revisiting the row —
// silence is what they asked for — but the sweep reports it as skipped, not
// sent.
var ErrReminderSkipped = errors.New("renewal reminder skipped")

// SweepRenewals runs one reminder pass: for stages 1..3 it finds due renewals,
// checks preferences, claims each send exactly once, sends through the sender,
// and advances the reminder stage as part of the claim. It is at-most-once —
// the send claim and stage advance commit before the Expo HTTP send, so a
// crashed and retried sweep finds the claim taken and never double-sends —
// and it logs counts, never user ids or program names.
//
// The accepted tradeoff: a crash after the claim commits but before the send
// reaches Expo skips that reminder. Duplicates are refused; misses are not
// retried.
func (s *Service) SweepRenewals(ctx context.Context, sender RenewalPushSender) (SweepCounts, error) {
	var counts SweepCounts
	now := s.now()
	for stage := 1; stage <= 3; stage++ {
		offset := RenewalReminderOffsets[stage]
		due, err := s.store.DueBenefitsRenewalsForReminder(ctx, now, offset, stage)
		if err != nil {
			return counts, errors.New("renewal sweep query failed")
		}
		counts.Due += len(due)
		for _, renewal := range due {
			switch err := s.remindRenewal(ctx, sender, renewal, stage); {
			case err == nil:
				counts.Sent++
			case errors.Is(err, db.ErrRenewalAlreadyHandled), errors.Is(err, ErrReminderSkipped):
				counts.Skipped++
			default:
				counts.Failed++
				// No user id, no program name: the log says a reminder failed
				// and at which stage, nothing about whose.
				s.logger.Error("benefits renewal reminder failed",
					"stage", stage, "error", err)
			}
		}
	}
	s.logger.Info("benefits renewal sweep complete",
		"due", counts.Due, "sent", counts.Sent,
		"skipped", counts.Skipped, "failed", counts.Failed)
	return counts, nil
}

func (s *Service) remindRenewal(ctx context.Context, sender RenewalPushSender, renewal db.BenefitsRenewal, stage int) error {
	preferences, err := s.store.Preferences(ctx, renewal.UserID)
	if err != nil {
		return err
	}
	if !preferences.NotificationsEnabled || !preferences.BenefitsRenewalNotificationsEnabled {
		// The user opted out: advance the stage so the sweep stops revisiting
		// this row. Silence is what they asked for; it is not a failure and
		// it is not a send.
		if err := s.store.AdvanceRenewalReminderStage(ctx, renewal.ID, renewal.UserID, stage-1, stage); err != nil {
			return err
		}
		return ErrReminderSkipped
	}
	tokens, err := s.store.PushTokensForUser(ctx, renewal.UserID)
	if err != nil {
		return err
	}
	if len(tokens) == 0 {
		// No device to reach: advance so the row stops being picked up.
		if err := s.store.AdvanceRenewalReminderStage(ctx, renewal.ID, renewal.UserID, stage-1, stage); err != nil {
			return err
		}
		return ErrReminderSkipped
	}

	message := RenewalPushMessage(preferences, renewal, stage)
	tokenStrings := make([]string, 0, len(tokens))
	for _, token := range tokens {
		tokenStrings = append(tokenStrings, token.Token)
	}

	// At-most-once: the claim (send record + stage advance) commits before the
	// HTTP send. If this process crashes after the claim but before Expo is
	// reached, the reminder is skipped on retry rather than sent twice.
	if err := s.store.ClaimRenewalReminderSend(ctx, renewal.ID, renewal.UserID, stage-1, stage); err != nil {
		return err
	}

	unregistered, err := sender.Send(ctx, tokenStrings, message)
	if err != nil {
		// The stage already advanced, so this send is not retried: a failed
		// send is counted, never re-attempted. Duplicates are the failure mode
		// we refuse; misses are the one we accept.
		return err
	}
	// Token hygiene: a device Expo no longer recognises is deleted so
	// future sweeps stop paying to reach it.
	for _, token := range unregistered {
		if _, err := s.store.DeletePushToken(ctx, renewal.UserID, token); err != nil {
			s.logger.Warn("push token cleanup failed", "error", err)
		}
	}
	return nil
}

// DaysUntilRenewal is whole days until the due date, negative when overdue,
// rounded so that "due tomorrow morning" reads as 1 rather than 0. Computed
// server-side so the client never does date arithmetic on a deadline.
func DaysUntilRenewal(due, now time.Time) int {
	return int(math.Round(due.Sub(now).Hours() / 24))
}

// RenewalPushMessage builds the push payload for a renewal reminder.
//
// The visible title and body never name the program, carry PII, or use
// eligibility language — nothing like "you qualify" or "you will lose
// benefits". The program, state and renewal id travel in Data for deep-linking
// only. With the discreet lock-screen preference on (the default), even the
// generic "benefits" wording is replaced by a neutral reminder.
func RenewalPushMessage(preferences db.Preferences, renewal db.BenefitsRenewal, stage int) notify.Message {
	data := map[string]string{
		"kind":      "benefits_renewal",
		"renewalId": renewal.ID,
		"program":   renewal.Program,
		"state":     renewal.State,
	}
	if preferences.BenefitsRenewalDiscreetLockScreen {
		return notify.Message{
			Title: "Help The Hive reminder",
			Body:  "Time to review your benefits",
			Data:  data,
		}
	}
	var body string
	switch stage {
	case 1:
		body = "Your benefits renewal window is coming up. Open Help The Hive to get your application ready."
	case 2:
		body = "Your benefits renewal is due soon. Your answers are saved — review and finish in a few minutes."
	default:
		body = "Your benefits renewal is nearly due. Open Help The Hive to prepare your application."
	}
	return notify.Message{
		Title: "Benefits renewal",
		Body:  body,
		Data:  data,
	}
}
