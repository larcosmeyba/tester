package benefits

// Submission Phase 1 against a real Postgres.
//
// Skipped without TEST_DATABASE_URL, and run in CI against a real database.
//
// These tests cover what cannot be proven without a database: the confirmation
// number is stored verbatim on the viewer's own application (and on nobody
// else's), recording it feeds the renewal schedule, and the retention sweep
// purges drafts older than 30 days while leaving fresh ones alone.

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

	"github.com/helpthehive/server/internal/auth"
	"github.com/helpthehive/server/internal/db"
	domain "github.com/helpthehive/server/internal/domain/benefits"
	"github.com/helpthehive/server/internal/modules/users"
)

// mapDocumentStore is an in-memory DocumentStore that records deletions.
type mapDocumentStore struct {
	files   map[string][]byte
	deleted []string
}

func newMapDocumentStore() *mapDocumentStore {
	return &mapDocumentStore{files: map[string][]byte{}}
}

func (s *mapDocumentStore) Put(_ context.Context, key string, data []byte) error {
	s.files[key] = data
	return nil
}

func (s *mapDocumentStore) Get(_ context.Context, key string) ([]byte, error) {
	data, ok := s.files[key]
	if !ok {
		return nil, errors.New("not found")
	}
	return data, nil
}

func (s *mapDocumentStore) Delete(_ context.Context, key string) error {
	delete(s.files, key)
	s.deleted = append(s.deleted, key)
	return nil
}

func submissionTestSetup(t *testing.T) (context.Context, *db.Store, *Service, *mapDocumentStore) {
	t.Helper()
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
	t.Cleanup(pool.Close)
	store := db.NewStore(pool)

	stamp := time.Now().UnixNano()
	viewer, err := store.EnsureViewer(ctx, fmt.Sprintf("submission-%d", stamp), nil)
	if err != nil {
		t.Fatalf("EnsureViewer() error = %v", err)
	}
	userID := viewer.User.ID
	t.Cleanup(func() { _, _ = store.DeleteUser(context.Background(), userID) })

	documents := newMapDocumentStore()
	service := NewService(store, users.NewService(store), NewRegistry(), documents, nil, nil)
	return ctx, store, service, documents
}

func submissionTestIdentity(t *testing.T, store *db.Store, ctx context.Context, subject string) (auth.Identity, string) {
	t.Helper()
	viewer, err := store.EnsureViewer(ctx, subject, nil)
	if err != nil {
		t.Fatalf("EnsureViewer(%s) error = %v", subject, err)
	}
	t.Cleanup(func() { _, _ = store.DeleteUser(context.Background(), viewer.User.ID) })
	return auth.Identity{Subject: subject}, viewer.User.ID
}

// seedTestForm installs a minimal form in the service's registry so
// renewal scheduling (which needs program and state from the form) works
// without loading the real forms directory.
func seedTestForm(t *testing.T, service *Service) {
	t.Helper()
	form := &Form{
		Mapping: &domain.FormMapping{
			ID:          "us-mo-snap",
			FormVersion: "2024.01",
			Revision:    1,
			Program:     "SNAP",
			Status:      "active",
			Jurisdiction: domain.Jurisdiction{
				Country: "US",
				State:   "MO",
			},
		},
	}
	if err := service.registry.add(form); err != nil {
		t.Fatalf("registry.add() error = %v", err)
	}
}

func completeTestApplication(t *testing.T, store *db.Store, ctx context.Context, userID string) db.BenefitsApplication {
	t.Helper()
	application, err := store.CreateBenefitsApplication(ctx, db.BenefitsApplication{
		UserID: userID, FormID: "us-mo-snap", FormVersion: "2024.01", FormRevision: 1, Status: "draft",
	})
	if err != nil {
		t.Fatalf("CreateBenefitsApplication() error = %v", err)
	}
	now := time.Now().UTC()
	name := "Jane Doe"
	// SaveBenefitsApproval is the store path Approve uses: status, signature
	// and audit trail in one transaction.
	if err := store.SaveBenefitsApproval(ctx, userID, application.ID, name, now, &now, nil); err != nil {
		t.Fatalf("SaveBenefitsApproval() error = %v", err)
	}
	application, err = store.BenefitsApplication(ctx, userID, application.ID)
	if err != nil {
		t.Fatalf("BenefitsApplication() error = %v", err)
	}
	if application.SignedName == nil || *application.SignedName != name {
		t.Fatalf("signed name = %+v, want %q", application.SignedName, name)
	}
	if application.SignedAt == nil {
		t.Fatal("signed_at should be set after approval")
	}
	return application
}

func TestRecordBenefitsConfirmationStoresVerbatim(t *testing.T) {
	ctx, store, service, _ := submissionTestSetup(t)
	identity, userID := submissionTestIdentity(t, store, ctx, fmt.Sprintf("confirm-owner-%d", time.Now().UnixNano()))

	application, err := store.CreateBenefitsApplication(ctx, db.BenefitsApplication{
		UserID: userID, FormID: "us-mo-snap", FormVersion: "2024.01", FormRevision: 1, Status: "draft",
	})
	if err != nil {
		t.Fatalf("CreateBenefitsApplication() error = %v", err)
	}

	view, err := service.RecordBenefitsConfirmation(ctx, identity, application.ID, "  ABC-12345  ")
	if err != nil {
		t.Fatalf("RecordBenefitsConfirmation() error = %v", err)
	}
	// Trimmed, non-empty, stored verbatim otherwise.
	if view.Record.ConfirmationNumber == nil || *view.Record.ConfirmationNumber != "ABC-12345" {
		t.Fatalf("confirmation number = %+v, want trimmed ABC-12345", view.Record.ConfirmationNumber)
	}
	if view.Record.ConfirmationRecordedAt == nil {
		t.Fatal("confirmation_recorded_at should be set")
	}

	stored, err := store.BenefitsApplication(ctx, userID, application.ID)
	if err != nil {
		t.Fatalf("BenefitsApplication() error = %v", err)
	}
	if stored.ConfirmationNumber == nil || *stored.ConfirmationNumber != "ABC-12345" {
		t.Fatalf("stored confirmation number = %+v, want ABC-12345", stored.ConfirmationNumber)
	}
}

func TestRecordBenefitsConfirmationValidation(t *testing.T) {
	ctx, store, service, _ := submissionTestSetup(t)
	identity, userID := submissionTestIdentity(t, store, ctx, fmt.Sprintf("confirm-valid-%d", time.Now().UnixNano()))

	application, err := store.CreateBenefitsApplication(ctx, db.BenefitsApplication{
		UserID: userID, FormID: "us-mo-snap", FormVersion: "2024.01", FormRevision: 1, Status: "draft",
	})
	if err != nil {
		t.Fatalf("CreateBenefitsApplication() error = %v", err)
	}

	for _, number := range []string{"", "   "} {
		if _, err := service.RecordBenefitsConfirmation(ctx, identity, application.ID, number); !errors.Is(err, domain.ErrInvalidValue) {
			t.Fatalf("RecordBenefitsConfirmation(%q) = %v, want ErrInvalidValue", number, err)
		}
	}
}

func TestRecordBenefitsConfirmationOwnership(t *testing.T) {
	ctx, store, service, _ := submissionTestSetup(t)
	stamp := time.Now().UnixNano()
	ownerIdentity, ownerID := submissionTestIdentity(t, store, ctx, fmt.Sprintf("confirm-own-%d", stamp))
	strangerIdentity, _ := submissionTestIdentity(t, store, ctx, fmt.Sprintf("confirm-stranger-%d", stamp))

	application, err := store.CreateBenefitsApplication(ctx, db.BenefitsApplication{
		UserID: ownerID, FormID: "us-mo-snap", FormVersion: "2024.01", FormRevision: 1, Status: "draft",
	})
	if err != nil {
		t.Fatalf("CreateBenefitsApplication() error = %v", err)
	}

	// Somebody else's application is NOT_FOUND, never FORBIDDEN: the stranger
	// must not learn the application exists.
	if _, err := service.RecordBenefitsConfirmation(ctx, strangerIdentity, application.ID, "ABC-1"); !errors.Is(err, domain.ErrNotFound) {
		t.Fatalf("RecordBenefitsConfirmation(stranger) = %v, want ErrNotFound", err)
	}
	// And nothing was written.
	stored, err := store.BenefitsApplication(ctx, ownerID, application.ID)
	if err != nil {
		t.Fatalf("BenefitsApplication() error = %v", err)
	}
	if stored.ConfirmationNumber != nil {
		t.Fatalf("stranger's attempt wrote confirmation number %q", *stored.ConfirmationNumber)
	}

	// A nonexistent application is the same NOT_FOUND.
	if _, err := service.RecordBenefitsConfirmation(ctx, ownerIdentity, "no-such-app", "ABC-1"); !errors.Is(err, domain.ErrNotFound) {
		t.Fatalf("RecordBenefitsConfirmation(missing) = %v, want ErrNotFound", err)
	}
}

func TestRecordBenefitsConfirmationFeedsExistingRenewal(t *testing.T) {
	ctx, store, service, _ := submissionTestSetup(t)
	seedTestForm(t, service)
	identity, userID := submissionTestIdentity(t, store, ctx, fmt.Sprintf("confirm-feed-%d", time.Now().UnixNano()))

	application := completeTestApplication(t, store, ctx, userID)

	now := time.Now().UTC()
	renewal, err := store.CreateBenefitsRenewal(ctx, db.BenefitsRenewal{
		UserID: userID, ApplicationID: application.ID,
		Program: "SNAP", State: "MO", FormID: "us-mo-snap",
		RenewalDueAt: now.Add(30 * 24 * time.Hour),
		Source:       db.RenewalSourceRuleDerived, Status: db.RenewalStatusScheduled,
	})
	if err != nil {
		t.Fatalf("CreateBenefitsRenewal() error = %v", err)
	}

	if _, err := service.RecordBenefitsConfirmation(ctx, identity, application.ID, "SNAP-987"); err != nil {
		t.Fatalf("RecordBenefitsConfirmation() error = %v", err)
	}

	updated, err := store.BenefitsRenewal(ctx, userID, renewal.ID)
	if err != nil {
		t.Fatalf("BenefitsRenewal() error = %v", err)
	}
	if updated.Source != db.RenewalSourceUserConfirmed {
		t.Fatalf("renewal source = %q, want user-confirmed", updated.Source)
	}
	// The dates are untouched: the deadline is never invented here.
	if !updated.RenewalDueAt.Equal(renewal.RenewalDueAt) {
		t.Fatalf("renewal due date moved from %v to %v", renewal.RenewalDueAt, updated.RenewalDueAt)
	}
}

func TestRecordBenefitsConfirmationCreatesRenewalViaRulePath(t *testing.T) {
	ctx, store, service, _ := submissionTestSetup(t)
	seedTestForm(t, service)
	identity, userID := submissionTestIdentity(t, store, ctx, fmt.Sprintf("confirm-create-%d", time.Now().UnixNano()))

	// Approved before the renewal system existed: no renewal row.
	application := completeTestApplication(t, store, ctx, userID)
	if _, err := store.BenefitsRenewalForApplication(ctx, userID, application.ID); !db.IsNotFound(err) {
		t.Fatalf("expected no renewal row, got %v", err)
	}

	if _, err := service.RecordBenefitsConfirmation(ctx, identity, application.ID, "SNAP-555"); err != nil {
		t.Fatalf("RecordBenefitsConfirmation() error = %v", err)
	}

	renewal, err := store.BenefitsRenewalForApplication(ctx, userID, application.ID)
	if err != nil {
		t.Fatalf("BenefitsRenewalForApplication() error = %v", err)
	}
	if renewal.Program != "SNAP" || renewal.State != "MO" {
		t.Fatalf("renewal = %+v, want the application's program and state", renewal)
	}
	// Created through the rule path: the due date comes from the program
	// rule (12 months for SNAP per 7 CFR 273.10(f)), not from a guess.
	if renewal.Source != db.RenewalSourceRuleDerived {
		t.Fatalf("renewal source = %q, want rule-derived", renewal.Source)
	}
	if renewal.RenewalDueAt.Before(time.Now().UTC().AddDate(0, 11, 0)) {
		t.Fatalf("renewal due = %v, want roughly 12 months out", renewal.RenewalDueAt)
	}
}

// The retention sweep: a draft older than 30 days is purged (row and file),
// and a fresh draft survives. This is the property StartRetentionSweep exists
// to enforce — it is wired in cmd/server/main.go, and sweepOnce is the code it
// runs on every tick.
func TestRetentionSweepPurgesExpiredDraftsOnly(t *testing.T) {
	ctx, store, service, documents := submissionTestSetup(t)
	_, userID := submissionTestIdentity(t, store, ctx, fmt.Sprintf("sweep-%d", time.Now().UnixNano()))

	application, err := store.CreateBenefitsApplication(ctx, db.BenefitsApplication{
		UserID: userID, FormID: "us-mo-snap", FormVersion: "2024.01", FormRevision: 1, Status: "draft",
	})
	if err != nil {
		t.Fatalf("CreateBenefitsApplication() error = %v", err)
	}

	// A draft whose 30-day retention lapsed yesterday.
	oldPurge := time.Now().UTC().Add(-24 * time.Hour)
	oldDoc, err := store.InsertBenefitsDocument(ctx, db.BenefitsDocument{
		ApplicationID: application.ID, UserID: userID, Kind: "draft",
		StorageKey: "test/old-draft", SHA256: "old", ByteSize: 3, PurgeAfter: &oldPurge,
	})
	if err != nil {
		t.Fatalf("InsertBenefitsDocument(old) error = %v", err)
	}
	if err := documents.Put(ctx, oldDoc.StorageKey, []byte("old")); err != nil {
		t.Fatalf("Put(old) error = %v", err)
	}

	// A fresh draft: retention runs for another 30 days.
	freshPurge := time.Now().UTC().Add(DraftRetention)
	freshDoc, err := store.InsertBenefitsDocument(ctx, db.BenefitsDocument{
		ApplicationID: application.ID, UserID: userID, Kind: "draft",
		StorageKey: "test/fresh-draft", SHA256: "fresh", ByteSize: 5, PurgeAfter: &freshPurge,
	})
	if err != nil {
		t.Fatalf("InsertBenefitsDocument(fresh) error = %v", err)
	}
	if err := documents.Put(ctx, freshDoc.StorageKey, []byte("fresh")); err != nil {
		t.Fatalf("Put(fresh) error = %v", err)
	}

	// A final document has no purge date and must never be swept.
	finalDoc, err := store.InsertBenefitsDocument(ctx, db.BenefitsDocument{
		ApplicationID: application.ID, UserID: userID, Kind: "final",
		StorageKey: "test/final", SHA256: "final", ByteSize: 5, IsFlattened: true,
	})
	if err != nil {
		t.Fatalf("InsertBenefitsDocument(final) error = %v", err)
	}
	if err := documents.Put(ctx, finalDoc.StorageKey, []byte("final")); err != nil {
		t.Fatalf("Put(final) error = %v", err)
	}

	service.sweepOnce(ctx)

	if len(documents.deleted) != 1 || documents.deleted[0] != oldDoc.StorageKey {
		t.Fatalf("deleted = %v, want only the expired draft", documents.deleted)
	}
	if _, err := store.LatestBenefitsDocument(ctx, userID, application.ID, "draft"); err != nil {
		t.Fatalf("the fresh draft should survive the sweep: %v", err)
	}
	surviving, err := store.LatestBenefitsDocument(ctx, userID, application.ID, "draft")
	if err != nil {
		t.Fatalf("LatestBenefitsDocument(draft) error = %v", err)
	}
	if surviving.ID != freshDoc.ID {
		t.Fatalf("surviving draft = %q, want the fresh one", surviving.ID)
	}
	if _, err := store.LatestBenefitsDocument(ctx, userID, application.ID, "final"); err != nil {
		t.Fatalf("the final document should survive the sweep: %v", err)
	}
}
