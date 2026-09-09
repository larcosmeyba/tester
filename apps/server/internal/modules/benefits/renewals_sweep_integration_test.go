package benefits_test

// The renewal sweep against a real Postgres, end to end.
//
// This proves the property the send-claim design exists for: a crashed or
// retried sweep never double-sends. The fake sender fails its first call —
// standing in for "Expo took the push, then the process died before it could
// do anything else" — and the second sweep must not send again. The claim (and
// the stage advance) committed before the send, so the retry finds the
// (renewal, stage) pair taken and skips it.
//
// Skipped without TEST_DATABASE_URL, and run in CI against a real database.

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"os"
	"testing"
	"time"

	_ "github.com/jackc/pgx/v5/stdlib"
	"github.com/pressly/goose/v3"

	"github.com/helpthehive/server/internal/db"
	"github.com/helpthehive/server/internal/modules/benefits"
	"github.com/helpthehive/server/internal/notify"
)

// flakySender fails its first send, then succeeds: the crash-after-send case.
type flakySender struct {
	calls     int
	failFirst bool
}

func (s *flakySender) Send(ctx context.Context, tokens []string, message notify.Message) ([]string, error) {
	s.calls++
	if s.failFirst {
		s.failFirst = false
		return nil, errors.New("process died after the send")
	}
	return nil, nil
}

func TestSweepRenewalsNeverDoubleSends(t *testing.T) {
	databaseURL := os.Getenv("TEST_DATABASE_URL")
	if databaseURL == "" {
		t.Skip("TEST_DATABASE_URL is not set")
	}
	ctx := context.Background()

	if err := goose.SetDialect("postgres"); err != nil {
		t.Fatalf("SetDialect() error = %v", err)
	}
	conn, err := sql.Open("pgx", databaseURL)
	if err != nil {
		t.Fatalf("sql.Open() error = %v", err)
	}
	defer conn.Close()
	if err := goose.Up(conn, "../../../migrations"); err != nil {
		t.Fatalf("goose.Up() error = %v", err)
	}

	pool, err := db.Connect(ctx, databaseURL)
	if err != nil {
		t.Fatalf("Connect() error = %v", err)
	}
	// Registered before the user cleanup below so LIFO order deletes the user
	// before the pool closes.
	t.Cleanup(pool.Close)
	store := db.NewStore(pool)

	stamp := time.Now().UnixNano()
	viewer, err := store.EnsureViewer(ctx, fmt.Sprintf("renewal-sweep-%d", stamp), nil)
	if err != nil {
		t.Fatalf("EnsureViewer() error = %v", err)
	}
	userID := viewer.User.ID
	t.Cleanup(func() { _, _ = store.DeleteUser(context.Background(), userID) })

	application, err := store.CreateBenefitsApplication(ctx, db.BenefitsApplication{
		UserID: userID, FormID: "us-mo-snap", FormVersion: "2024.01", FormRevision: 1, Status: "draft",
	})
	if err != nil {
		t.Fatalf("CreateBenefitsApplication() error = %v", err)
	}
	now := time.Now().UTC()
	// A renewal keys off the FINAL application: approve it so the
	// completed-check constraint holds.
	if err := store.SaveBenefitsApplicationOutcome(ctx, userID, application.ID, "completed", "", &now, nil); err != nil {
		t.Fatalf("SaveBenefitsApplicationOutcome() error = %v", err)
	}

	// Due in 20 days: inside the 30-day stage-1 window, outside stage 2's.
	renewal, err := store.CreateBenefitsRenewal(ctx, db.BenefitsRenewal{
		UserID: userID, ApplicationID: application.ID,
		Program: "SNAP", State: "MO", FormID: "us-mo-snap",
		RenewalDueAt: now.Add(20 * 24 * time.Hour),
		Source:       db.RenewalSourceRuleDerived, Status: db.RenewalStatusScheduled,
	})
	if err != nil {
		t.Fatalf("CreateBenefitsRenewal() error = %v", err)
	}

	if _, err := store.UpsertPushToken(ctx, userID, fmt.Sprintf("ExponentPushToken[sweep-%d]", stamp), "IOS", nil); err != nil {
		t.Fatalf("UpsertPushToken() error = %v", err)
	}
	// The master notification switch defaults to off; the renewal flags
	// default to on. The sweep needs both.
	enabled := true
	if _, err := store.UpdatePreferences(ctx, userID, db.PreferencesPatch{
		NotificationsEnabled: &enabled,
	}); err != nil {
		t.Fatalf("UpdatePreferences() error = %v", err)
	}

	service := benefits.NewService(store, nil, nil, nil, nil, nil)
	sender := &flakySender{failFirst: true}

	first, err := service.SweepRenewals(ctx, sender)
	if err != nil {
		t.Fatalf("first SweepRenewals() error = %v", err)
	}
	if first.Failed != 1 || first.Sent != 0 {
		t.Fatalf("first sweep = %+v, want the one send to fail", first)
	}

	// The retry must not send again: the claim committed before the send.
	second, err := service.SweepRenewals(ctx, sender)
	if err != nil {
		t.Fatalf("second SweepRenewals() error = %v", err)
	}
	if second.Sent != 0 || second.Failed != 0 {
		t.Fatalf("second sweep = %+v, want nothing sent or failed", second)
	}
	if sender.calls != 1 {
		t.Fatalf("sender calls = %d, want exactly 1: the retried sweep must never double-send", sender.calls)
	}

	after, err := store.BenefitsRenewal(ctx, userID, renewal.ID)
	if err != nil {
		t.Fatalf("BenefitsRenewal() error = %v", err)
	}
	if after.ReminderStage != 1 {
		t.Fatalf("reminder stage = %d, want 1", after.ReminderStage)
	}
}
