package db

import (
	"context"
	"errors"
	"testing"
	"time"
)

// Benefits renewal scheduling against a real Postgres.
//
// Two properties are checked here rather than reasoned about: one user can
// never see another's renewal, and the sweep's stage claim is atomic — a
// second claim on the same stage fails instead of double-sending.
//
// Skipped without TEST_DATABASE_URL, and run in CI against a real database.

func renewalTestApplication(t *testing.T, store *Store, ctx context.Context, userID string) string {
	t.Helper()
	application, err := store.CreateBenefitsApplication(ctx, BenefitsApplication{
		UserID: userID, FormID: "us-mo-snap", FormVersion: "2024.01", FormRevision: 1, Status: "draft",
	})
	if err != nil {
		t.Fatalf("CreateBenefitsApplication() error = %v", err)
	}
	now := time.Now().UTC()
	// A renewal keys off the FINAL application: approve it like the service
	// does, setting approved_at so the completed-check constraint holds.
	if err := store.SaveBenefitsApplicationOutcome(ctx, userID, application.ID, "completed", "", &now, nil); err != nil {
		t.Fatalf("SaveBenefitsApplicationOutcome() error = %v", err)
	}
	return application.ID
}

func TestBenefitsRenewalCRUD(t *testing.T) {
	store, ctx := benefitsTestStore(t)
	owner := benefitsTestUser(t, store, ctx, "renewal-owner")
	stranger := benefitsTestUser(t, store, ctx, "renewal-stranger")
	applicationID := renewalTestApplication(t, store, ctx, owner)

	due := time.Now().Add(30 * 24 * time.Hour).UTC().Truncate(time.Second)
	ends := due.Add(-24 * time.Hour)
	created, err := store.CreateBenefitsRenewal(ctx, BenefitsRenewal{
		UserID: owner, ApplicationID: applicationID,
		Program: "SNAP", State: "MO", FormID: "us-mo-snap",
		CertificationEndsAt: &ends, RenewalDueAt: due,
		Source: RenewalSourceRuleDerived, Status: RenewalStatusScheduled,
	})
	if err != nil {
		t.Fatalf("CreateBenefitsRenewal() error = %v", err)
	}
	if created.ID == "" || created.Source != RenewalSourceRuleDerived || created.ReminderStage != 0 {
		t.Fatalf("CreateBenefitsRenewal() = %#v, want sourced/staged defaults", created)
	}

	// A stranger's renewal is invisible: not found, never forbidden.
	if _, err := store.BenefitsRenewal(ctx, stranger, created.ID); !IsNotFound(err) {
		t.Fatalf("BenefitsRenewal(stranger) error = %v, want not found", err)
	}
	if renewals, err := store.ListBenefitsRenewals(ctx, stranger); err != nil || len(renewals) != 0 {
		t.Fatalf("ListBenefitsRenewals(stranger) = %v, %v; want empty", renewals, err)
	}

	renewals, err := store.ListBenefitsRenewals(ctx, owner)
	if err != nil || len(renewals) != 1 || renewals[0].ID != created.ID {
		t.Fatalf("ListBenefitsRenewals(owner) = %v, %v; want the one renewal", renewals, err)
	}

	// Confirming the deadline flips the source to user-confirmed.
	newDue := due.Add(14 * 24 * time.Hour)
	confirmed, err := store.ConfirmBenefitsRenewalDeadline(ctx, owner, created.ID, newDue, nil)
	if err != nil {
		t.Fatalf("ConfirmBenefitsRenewalDeadline() error = %v", err)
	}
	if confirmed.Source != RenewalSourceUserConfirmed || !confirmed.RenewalDueAt.Equal(newDue) || confirmed.CertificationEndsAt != nil {
		t.Fatalf("ConfirmBenefitsRenewalDeadline() = %#v, want user-confirmed dates", confirmed)
	}

	// A finished renewal cannot be re-dated.
	if _, err := store.SetBenefitsRenewalStatus(ctx, owner, created.ID, RenewalStatusDone); err != nil {
		t.Fatalf("SetBenefitsRenewalStatus() error = %v", err)
	}
	if _, err := store.ConfirmBenefitsRenewalDeadline(ctx, owner, created.ID, newDue, nil); !IsNotFound(err) {
		t.Fatalf("ConfirmBenefitsRenewalDeadline(done) error = %v, want not found", err)
	}

	// Dismissing a stranger's renewal touches nothing.
	if dismissed, err := store.SetBenefitsRenewalStatus(ctx, stranger, created.ID, RenewalStatusDismissed); err != nil || dismissed {
		t.Fatalf("SetBenefitsRenewalStatus(stranger) = %v, %v; want false, nil", dismissed, err)
	}
}

func TestDueBenefitsRenewalsForReminderStages(t *testing.T) {
	store, ctx := benefitsTestStore(t)
	user := benefitsTestUser(t, store, ctx, "renewal-sweep-user")
	applicationID := renewalTestApplication(t, store, ctx, user)

	now := time.Now().UTC()
	mk := func(due time.Time, stage int, status string) BenefitsRenewal {
		renewal, err := store.CreateBenefitsRenewal(ctx, BenefitsRenewal{
			UserID: user, ApplicationID: applicationID,
			Program: "SNAP", State: "MO", FormID: "us-mo-snap",
			RenewalDueAt: due, Source: RenewalSourceRuleDerived,
			Status: status, ReminderStage: stage,
		})
		if err != nil {
			t.Fatalf("CreateBenefitsRenewal() error = %v", err)
		}
		return renewal
	}

	dueSoon := mk(now.Add(20*24*time.Hour), 0, RenewalStatusScheduled) // in 30d window, stage 0
	stageOne := mk(now.Add(3*24*time.Hour), 1, RenewalStatusReminded)  // in 7d window, stage 1
	stageTwo := mk(now.Add(12*time.Hour), 2, RenewalStatusReminded)    // in 1d window, stage 2
	_ = mk(now.Add(40*24*time.Hour), 0, RenewalStatusScheduled)        // too far out for stage 1
	_ = mk(now.Add(20*24*time.Hour), 0, RenewalStatusDismissed)        // dismissed: never due
	_ = mk(now.Add(-48*time.Hour), 3, RenewalStatusReminded)           // all stages sent: never again

	// Stage 1: due within 30 days, stage 0.
	due, err := store.DueBenefitsRenewalsForReminder(ctx, now, 30*24*time.Hour, 1)
	if err != nil {
		t.Fatalf("DueBenefitsRenewalsForReminder(stage 1) error = %v", err)
	}
	if len(due) != 1 || due[0].ID != dueSoon.ID {
		t.Fatalf("stage 1 due = %v, want [%s]", ids(due), dueSoon.ID)
	}

	// Stage 2: due within 7 days, stage 1.
	due, err = store.DueBenefitsRenewalsForReminder(ctx, now, 7*24*time.Hour, 2)
	if err != nil {
		t.Fatalf("DueBenefitsRenewalsForReminder(stage 2) error = %v", err)
	}
	if len(due) != 1 || due[0].ID != stageOne.ID {
		t.Fatalf("stage 2 due = %v, want [%s]", ids(due), stageOne.ID)
	}

	// Stage 3: due within 1 day, stage 2.
	due, err = store.DueBenefitsRenewalsForReminder(ctx, now, 24*time.Hour, 3)
	if err != nil {
		t.Fatalf("DueBenefitsRenewalsForReminder(stage 3) error = %v", err)
	}
	if len(due) != 1 || due[0].ID != stageTwo.ID {
		t.Fatalf("stage 3 due = %v, want [%s]", ids(due), stageTwo.ID)
	}
}

func TestClaimRenewalReminderSendIsAtMostOnce(t *testing.T) {
	store, ctx := benefitsTestStore(t)
	user := benefitsTestUser(t, store, ctx, "renewal-claim-user")
	applicationID := renewalTestApplication(t, store, ctx, user)

	renewal, err := store.CreateBenefitsRenewal(ctx, BenefitsRenewal{
		UserID: user, ApplicationID: applicationID,
		Program: "SNAP", State: "MO", FormID: "us-mo-snap",
		RenewalDueAt: time.Now().Add(24 * time.Hour), Source: RenewalSourceRuleDerived,
		Status: RenewalStatusScheduled,
	})
	if err != nil {
		t.Fatalf("CreateBenefitsRenewal() error = %v", err)
	}

	// The claim advances the stage immediately, before any send happens: the
	// (renewal, stage) pair can never be sent twice, even if the process dies
	// between the claim commit and the HTTP send.
	if err := store.ClaimRenewalReminderSend(ctx, renewal.ID, user, 0, 1); err != nil {
		t.Fatalf("first claim error = %v", err)
	}
	after, err := store.BenefitsRenewal(ctx, user, renewal.ID)
	if err != nil {
		t.Fatalf("BenefitsRenewal() error = %v", err)
	}
	if after.ReminderStage != 1 || after.Status != RenewalStatusReminded {
		t.Fatalf("after claim = stage %d status %q, want stage 1 reminded", after.ReminderStage, after.Status)
	}

	// The send-claim row exists: a retried sweep sees the pair as taken.
	var claimed int
	if err := store.pool.QueryRow(ctx,
		`SELECT count(*) FROM benefits_renewal_sends WHERE renewal_id = $1 AND stage = $2`,
		renewal.ID, 1).Scan(&claimed); err != nil {
		t.Fatalf("send-claim lookup error = %v", err)
	}
	if claimed != 1 {
		t.Fatalf("send-claim rows = %d, want 1", claimed)
	}

	// A second claim on the same stage fails: the sweep skips the row instead
	// of sending twice.
	if err := store.ClaimRenewalReminderSend(ctx, renewal.ID, user, 0, 1); !errors.Is(err, ErrRenewalAlreadyHandled) {
		t.Fatalf("second claim error = %v, want ErrRenewalAlreadyHandled", err)
	}

	// Claiming the next stage still works: each stage gets its own claim row.
	if err := store.ClaimRenewalReminderSend(ctx, renewal.ID, user, 1, 2); err != nil {
		t.Fatalf("next-stage claim error = %v", err)
	}
}

func TestBenefitsProgramRulesSeeded(t *testing.T) {
	store, ctx := benefitsTestStore(t)

	rules, err := store.ListBenefitsProgramRules(ctx, "")
	if err != nil {
		t.Fatalf("ListBenefitsProgramRules() error = %v", err)
	}
	if len(rules) < 5 {
		t.Fatalf("ListBenefitsProgramRules() = %d rules, want at least the 5 seeds", len(rules))
	}

	snap, err := store.BenefitsProgramRule(ctx, "SNAP", "MO")
	if err != nil {
		t.Fatalf("BenefitsProgramRule(SNAP, MO) error = %v", err)
	}
	if snap.CertPeriodMonths == nil || *snap.CertPeriodMonths != 12 {
		t.Fatalf("SNAP rule = %#v, want 12 months", snap)
	}
	if snap.SourceCitation == "" {
		t.Fatalf("SNAP rule has no source citation")
	}

	// State-specific lookup falls back to the national default.
	medicaid, err := store.BenefitsProgramRule(ctx, "Medicaid", "CA")
	if err != nil {
		t.Fatalf("BenefitsProgramRule(Medicaid, CA) error = %v", err)
	}
	if medicaid.State != "*" || medicaid.CertPeriodMonths == nil || *medicaid.CertPeriodMonths != 12 {
		t.Fatalf("Medicaid rule = %#v, want the '*' default of 12 months", medicaid)
	}

	// VA and SSI have rules but no fixed period: nothing honest to schedule.
	va, err := store.BenefitsProgramRule(ctx, "VA", "MO")
	if err != nil {
		t.Fatalf("BenefitsProgramRule(VA, MO) error = %v", err)
	}
	if va.CertPeriodMonths != nil {
		t.Fatalf("VA rule = %#v, want NULL cert period", va)
	}
	ssi, err := store.BenefitsProgramRule(ctx, "SSI", "MO")
	if err != nil {
		t.Fatalf("BenefitsProgramRule(SSI, MO) error = %v", err)
	}
	if ssi.CertPeriodMonths != nil {
		t.Fatalf("SSI rule = %#v, want NULL cert period", ssi)
	}

	// No rule at all: not found, so the service falls back to its default.
	if _, err := store.BenefitsProgramRule(ctx, "LIHEAP", "MO"); !IsNotFound(err) {
		t.Fatalf("BenefitsProgramRule(LIHEAP, MO) error = %v, want not found", err)
	}

	filtered, err := store.ListBenefitsProgramRules(ctx, "SNAP")
	if err != nil || len(filtered) != 1 || filtered[0].Program != "SNAP" {
		t.Fatalf("ListBenefitsProgramRules(SNAP) = %v, %v; want the one SNAP rule", filtered, err)
	}
}

func TestRenewalPreferenceDefaultsAndUpdate(t *testing.T) {
	store, ctx := benefitsTestStore(t)
	user := benefitsTestUser(t, store, ctx, "renewal-prefs-user")

	preferences, err := store.Preferences(ctx, user)
	if err != nil {
		t.Fatalf("Preferences() error = %v", err)
	}
	if !preferences.BenefitsRenewalNotificationsEnabled || !preferences.BenefitsRenewalDiscreetLockScreen {
		t.Fatalf("new user renewal preferences = %#v, want both true by default", preferences)
	}

	disabled := false
	updated, err := store.UpdatePreferences(ctx, user, PreferencesPatch{
		BenefitsRenewalNotificationsEnabled: &disabled,
		BenefitsRenewalDiscreetLockScreen:   &disabled,
	})
	if err != nil {
		t.Fatalf("UpdatePreferences() error = %v", err)
	}
	if updated.BenefitsRenewalNotificationsEnabled || updated.BenefitsRenewalDiscreetLockScreen {
		t.Fatalf("updated renewal preferences = %#v, want both false", updated)
	}
}

func ids(renewals []BenefitsRenewal) []string {
	out := make([]string, 0, len(renewals))
	for _, r := range renewals {
		out = append(out, r.ID)
	}
	return out
}
