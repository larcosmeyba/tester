package db

import (
	"context"
	"errors"
	"os"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
)

// Benefits storage against a real Postgres.
//
// Two properties are checked here rather than reasoned about, because both are
// the kind that hold right up until a refactor quietly moves a predicate: one
// user can never see another's benefits application, and a run survives being
// left and come back to.
//
// Skipped without TEST_DATABASE_URL, and run in CI against a real database.

func benefitsTestStore(t *testing.T) (*Store, context.Context) {
	t.Helper()
	databaseURL := os.Getenv("TEST_DATABASE_URL")
	if databaseURL == "" {
		t.Skip("TEST_DATABASE_URL is not set")
	}
	ctx := context.Background()
	runMigrations(t, databaseURL)

	pool, err := Connect(ctx, databaseURL)
	if err != nil {
		t.Fatalf("Connect() error = %v", err)
	}
	t.Cleanup(pool.Close)
	return NewStore(pool), ctx
}

func benefitsTestUser(t *testing.T, store *Store, ctx context.Context, subject string) string {
	t.Helper()
	viewer, err := store.EnsureViewer(ctx, subject, nil)
	if err != nil {
		t.Fatalf("EnsureViewer(%s): %v", subject, err)
	}
	t.Cleanup(func() { _, _ = store.DeleteUser(context.Background(), viewer.User.ID) })
	return viewer.User.ID
}

// One household must never be able to read another's application. Every read
// is scoped, and the failure mode is "not found" rather than "forbidden":
// telling somebody that another person's application exists is itself a
// disclosure.
func TestBenefitsApplicationsAreInvisibleToOtherUsers(t *testing.T) {
	store, ctx := benefitsTestStore(t)
	owner := benefitsTestUser(t, store, ctx, "benefits-owner")
	stranger := benefitsTestUser(t, store, ctx, "benefits-stranger")

	application, err := store.CreateBenefitsApplication(ctx, BenefitsApplication{
		UserID: owner, FormID: "us-xx-snap", FormVersion: "2026.01", FormRevision: 1, Status: "draft",
	})
	if err != nil {
		t.Fatalf("CreateBenefitsApplication: %v", err)
	}

	if _, err := store.BenefitsApplication(ctx, owner, application.ID); err != nil {
		t.Fatalf("the owner should be able to read their own application: %v", err)
	}

	if _, err := store.BenefitsApplication(ctx, stranger, application.ID); !errors.Is(err, pgx.ErrNoRows) {
		t.Fatalf("a stranger reading another user's application must get no rows, got %v", err)
	}

	listed, err := store.ListBenefitsApplications(ctx, stranger)
	if err != nil {
		t.Fatalf("ListBenefitsApplications: %v", err)
	}
	if len(listed) != 0 {
		t.Fatalf("a stranger's list must be empty, got %d", len(listed))
	}

	if deleted, err := store.DeleteBenefitsApplication(ctx, stranger, application.ID); err != nil || deleted {
		t.Fatalf("a stranger must not be able to delete another user's application (deleted=%v err=%v)", deleted, err)
	}
	if _, err := store.BenefitsApplication(ctx, owner, application.ID); err != nil {
		t.Fatalf("the application should still be there: %v", err)
	}
}

// The audit trail is keyed only by application id, so its read is joined back
// to the owner. Without that join a stranger with an id could read which
// answers fed which boxes.
func TestTheAuditTrailIsAlsoScopedToItsOwner(t *testing.T) {
	store, ctx := benefitsTestStore(t)
	owner := benefitsTestUser(t, store, ctx, "benefits-audit-owner")
	stranger := benefitsTestUser(t, store, ctx, "benefits-audit-stranger")

	application, err := store.CreateBenefitsApplication(ctx, BenefitsApplication{
		UserID: owner, FormID: "us-xx-snap", FormVersion: "2026.01", FormRevision: 1, Status: "draft",
	})
	if err != nil {
		t.Fatalf("CreateBenefitsApplication: %v", err)
	}
	if err := store.SaveBenefitsApplicationOutcome(ctx, owner, application.ID, "ready_for_review", "", nil,
		[]BenefitsApplicationField{{FieldID: "last_name", Outcome: "filled", FieldPath: "applicant.last_name"}}); err != nil {
		t.Fatalf("SaveBenefitsApplicationOutcome: %v", err)
	}

	mine, err := store.BenefitsApplicationFields(ctx, owner, application.ID)
	if err != nil || len(mine) != 1 {
		t.Fatalf("the owner should see their own audit trail (%d rows, err %v)", len(mine), err)
	}

	theirs, err := store.BenefitsApplicationFields(ctx, stranger, application.ID)
	if err != nil {
		t.Fatalf("BenefitsApplicationFields: %v", err)
	}
	if len(theirs) != 0 {
		t.Fatalf("a stranger must see nothing, got %d rows", len(theirs))
	}
}

// Writing an outcome for somebody else's application must not silently succeed.
func TestAnOutcomeCannotBeWrittenToAnotherUsersApplication(t *testing.T) {
	store, ctx := benefitsTestStore(t)
	owner := benefitsTestUser(t, store, ctx, "benefits-write-owner")
	stranger := benefitsTestUser(t, store, ctx, "benefits-write-stranger")

	application, err := store.CreateBenefitsApplication(ctx, BenefitsApplication{
		UserID: owner, FormID: "us-xx-snap", FormVersion: "2026.01", FormRevision: 1, Status: "draft",
	})
	if err != nil {
		t.Fatalf("CreateBenefitsApplication: %v", err)
	}

	err = store.SaveBenefitsApplicationOutcome(ctx, stranger, application.ID, "completed", "", nil, nil)
	if !errors.Is(err, pgx.ErrNoRows) {
		t.Fatalf("expected the write to be refused, got %v", err)
	}

	unchanged, err := store.BenefitsApplication(ctx, owner, application.ID)
	if err != nil {
		t.Fatalf("read back: %v", err)
	}
	if unchanged.Status != "draft" {
		t.Fatalf("the application's status was changed by a stranger: %q", unchanged.Status)
	}
}

// A run is durable. Somebody halfway through a SNAP application who closes the
// app must come back to their answers, not to a blank form.
func TestAnApplicationAndItsAnswersSurviveBeingLeft(t *testing.T) {
	store, ctx := benefitsTestStore(t)
	user := benefitsTestUser(t, store, ctx, "benefits-resume")

	if err := store.EnsureBenefitsProfile(ctx, user, 1); err != nil {
		t.Fatalf("EnsureBenefitsProfile: %v", err)
	}

	lastName := "Rivera"
	if err := store.UpsertBenefitsAnswers(ctx, user, []BenefitsAnswer{{
		FieldPath: "applicant.last_name", Status: "provided", Kind: "text", Source: "user", Text: &lastName,
	}}); err != nil {
		t.Fatalf("UpsertBenefitsAnswers: %v", err)
	}

	application, err := store.CreateBenefitsApplication(ctx, BenefitsApplication{
		UserID: user, FormID: "us-xx-snap", FormVersion: "2026.01", FormRevision: 1, Status: "draft",
	})
	if err != nil {
		t.Fatalf("CreateBenefitsApplication: %v", err)
	}
	if err := store.SaveBenefitsApplicationOutcome(ctx, user, application.ID, "needs_information", "", nil,
		[]BenefitsApplicationField{{FieldID: "last_name", Outcome: "filled", FieldPath: "applicant.last_name"}}); err != nil {
		t.Fatalf("SaveBenefitsApplicationOutcome: %v", err)
	}

	// A later session: nothing cached, everything read back from the database.
	resumed, err := store.BenefitsApplication(ctx, user, application.ID)
	if err != nil {
		t.Fatalf("resume: %v", err)
	}
	if resumed.Status != "needs_information" {
		t.Errorf("expected the run to resume where it was left, got %q", resumed.Status)
	}
	if resumed.FormVersion != "2026.01" || resumed.FormRevision != 1 {
		t.Errorf("a resumed run must keep the exact form revision it started on, got %s#%d",
			resumed.FormVersion, resumed.FormRevision)
	}

	answers, err := store.BenefitsAnswers(ctx, user)
	if err != nil {
		t.Fatalf("BenefitsAnswers: %v", err)
	}
	if len(answers) != 1 || answers[0].Text == nil || *answers[0].Text != "Rivera" {
		t.Fatalf("the saved answer did not survive: %+v", answers)
	}
}

// An answer cleared back to unknown is deleted rather than stored as blank:
// "not asked" is the absence of a row, and a tombstone would later read as an
// answer of nothing.
func TestClearingAnAnswerRemovesItRatherThanBlankingIt(t *testing.T) {
	store, ctx := benefitsTestStore(t)
	user := benefitsTestUser(t, store, ctx, "benefits-clear")

	value := "Rivera"
	if err := store.UpsertBenefitsAnswers(ctx, user, []BenefitsAnswer{{
		FieldPath: "applicant.last_name", Status: "provided", Kind: "text", Source: "user", Text: &value,
	}}); err != nil {
		t.Fatalf("save: %v", err)
	}
	if err := store.UpsertBenefitsAnswers(ctx, user, []BenefitsAnswer{{
		FieldPath: "applicant.last_name", Status: "unknown", Kind: "text", Source: "user",
	}}); err != nil {
		t.Fatalf("clear: %v", err)
	}

	answers, err := store.BenefitsAnswers(ctx, user)
	if err != nil {
		t.Fatalf("read: %v", err)
	}
	for _, answer := range answers {
		if answer.FieldPath == "applicant.last_name" {
			t.Fatalf("a cleared answer should leave no row, found %+v", answer)
		}
	}
}

// Deleting an account must take the benefits data with it.
func TestDeletingAUserRemovesTheirBenefitsData(t *testing.T) {
	store, ctx := benefitsTestStore(t)

	viewer, err := store.EnsureViewer(ctx, "benefits-erase", nil)
	if err != nil {
		t.Fatalf("EnsureViewer: %v", err)
	}
	user := viewer.User.ID

	if err := store.EnsureBenefitsProfile(ctx, user, 1); err != nil {
		t.Fatalf("EnsureBenefitsProfile: %v", err)
	}
	value := "Rivera"
	if err := store.UpsertBenefitsAnswers(ctx, user, []BenefitsAnswer{{
		FieldPath: "applicant.last_name", Status: "provided", Kind: "text", Source: "user", Text: &value,
	}}); err != nil {
		t.Fatalf("save answer: %v", err)
	}
	application, err := store.CreateBenefitsApplication(ctx, BenefitsApplication{
		UserID: user, FormID: "us-xx-snap", FormVersion: "2026.01", FormRevision: 1, Status: "draft",
	})
	if err != nil {
		t.Fatalf("CreateBenefitsApplication: %v", err)
	}
	if _, err := store.InsertBenefitsDocument(ctx, BenefitsDocument{
		ApplicationID: application.ID, UserID: user, Kind: "draft",
		StorageKey: user + "/" + application.ID + "/draft.pdf",
		SHA256:     "0000000000000000000000000000000000000000000000000000000000000000",
		ByteSize:   1, IsFlattened: false,
	}); err != nil {
		t.Fatalf("InsertBenefitsDocument: %v", err)
	}

	if _, err := store.DeleteUser(ctx, user); err != nil {
		t.Fatalf("DeleteUser: %v", err)
	}

	answers, err := store.BenefitsAnswers(ctx, user)
	if err != nil {
		t.Fatalf("BenefitsAnswers: %v", err)
	}
	if len(answers) != 0 {
		t.Errorf("benefits answers outlived the account: %d rows", len(answers))
	}
	documents, err := store.BenefitsDocumentsForUser(ctx, user)
	if err != nil {
		t.Fatalf("BenefitsDocumentsForUser: %v", err)
	}
	if len(documents) != 0 {
		t.Errorf("document records outlived the account: %d rows", len(documents))
	}
	if _, err := store.BenefitsApplication(ctx, user, application.ID); !errors.Is(err, pgx.ErrNoRows) {
		t.Errorf("the application outlived the account: %v", err)
	}
}

// Retention. A draft benefits application is a household roster and an income
// statement; keeping one past its usefulness is a liability with no upside, and
// a retention policy is only real if something enforces it.
func TestExpiredDraftsAreFoundAndFinalsAreLeftAlone(t *testing.T) {
	store, ctx := benefitsTestStore(t)
	user := benefitsTestUser(t, store, ctx, "benefits-retention")

	if err := store.EnsureBenefitsProfile(ctx, user, 1); err != nil {
		t.Fatalf("EnsureBenefitsProfile: %v", err)
	}
	application, err := store.CreateBenefitsApplication(ctx, BenefitsApplication{
		UserID: user, FormID: "us-xx-snap", FormVersion: "2026.01", FormRevision: 1, Status: "draft",
	})
	if err != nil {
		t.Fatalf("CreateBenefitsApplication: %v", err)
	}

	now := time.Now().UTC()
	lapsed := now.Add(-time.Hour)
	future := now.Add(30 * 24 * time.Hour)

	expiredDraft, err := store.InsertBenefitsDocument(ctx, BenefitsDocument{
		ApplicationID: application.ID, UserID: user, Kind: "draft",
		StorageKey: user + "/" + application.ID + "/draft.pdf",
		SHA256:     "a", ByteSize: 1, PurgeAfter: &lapsed,
	})
	if err != nil {
		t.Fatalf("InsertBenefitsDocument(expired draft): %v", err)
	}
	liveDraft, err := store.InsertBenefitsDocument(ctx, BenefitsDocument{
		ApplicationID: application.ID, UserID: user, Kind: "draft",
		StorageKey: user + "/" + application.ID + "/draft-live.pdf",
		SHA256:     "b", ByteSize: 1, PurgeAfter: &future,
	})
	if err != nil {
		t.Fatalf("InsertBenefitsDocument(live draft): %v", err)
	}
	// A final document has no purge date: it is the record of what the person
	// actually submitted, and it is not ours to throw away.
	final, err := store.InsertBenefitsDocument(ctx, BenefitsDocument{
		ApplicationID: application.ID, UserID: user, Kind: "final",
		StorageKey: user + "/" + application.ID + "/final.pdf",
		SHA256:     "c", ByteSize: 1,
	})
	if err != nil {
		t.Fatalf("InsertBenefitsDocument(final): %v", err)
	}

	expired, err := store.ExpiredBenefitsDocuments(ctx, now, 100)
	if err != nil {
		t.Fatalf("ExpiredBenefitsDocuments: %v", err)
	}

	found := map[string]bool{}
	for _, document := range expired {
		found[document.ID] = true
	}
	if !found[expiredDraft.ID] {
		t.Error("the lapsed draft was not offered for deletion; the retention policy would never run")
	}
	if found[liveDraft.ID] {
		t.Error("a draft still inside its retention window was offered for deletion")
	}
	if found[final.ID] {
		t.Error("a final document was offered for deletion; it is the record of what was filed")
	}

	// Deleting it removes the row, and the sweeper deletes the bytes alongside.
	if err := store.DeleteBenefitsDocument(ctx, expiredDraft.ID); err != nil {
		t.Fatalf("DeleteBenefitsDocument: %v", err)
	}
	remaining, err := store.ExpiredBenefitsDocuments(ctx, now, 100)
	if err != nil {
		t.Fatalf("ExpiredBenefitsDocuments(after): %v", err)
	}
	for _, document := range remaining {
		if document.ID == expiredDraft.ID {
			t.Fatal("the expired draft is still listed after being deleted")
		}
	}
}

// Every document belongs to exactly one user, and the sweep must not reach
// across that line either.
func TestDocumentsAreScopedToTheirOwner(t *testing.T) {
	store, ctx := benefitsTestStore(t)
	owner := benefitsTestUser(t, store, ctx, "benefits-doc-owner")
	stranger := benefitsTestUser(t, store, ctx, "benefits-doc-stranger")

	if err := store.EnsureBenefitsProfile(ctx, owner, 1); err != nil {
		t.Fatalf("EnsureBenefitsProfile: %v", err)
	}
	application, err := store.CreateBenefitsApplication(ctx, BenefitsApplication{
		UserID: owner, FormID: "us-xx-snap", FormVersion: "2026.01", FormRevision: 1, Status: "draft",
	})
	if err != nil {
		t.Fatalf("CreateBenefitsApplication: %v", err)
	}
	if _, err := store.InsertBenefitsDocument(ctx, BenefitsDocument{
		ApplicationID: application.ID, UserID: owner, Kind: "final",
		StorageKey: owner + "/" + application.ID + "/final.pdf", SHA256: "d", ByteSize: 1,
	}); err != nil {
		t.Fatalf("InsertBenefitsDocument: %v", err)
	}

	mine, err := store.BenefitsDocumentsForUser(ctx, owner)
	if err != nil || len(mine) == 0 {
		t.Fatalf("the owner cannot see their own document (%d, %v)", len(mine), err)
	}
	theirs, err := store.BenefitsDocumentsForUser(ctx, stranger)
	if err != nil {
		t.Fatalf("BenefitsDocumentsForUser(stranger): %v", err)
	}
	if len(theirs) != 0 {
		t.Fatalf("a stranger can see %d of somebody else's benefits documents", len(theirs))
	}

	if _, err := store.LatestBenefitsDocument(ctx, stranger, application.ID, "final"); !errors.Is(err, pgx.ErrNoRows) {
		t.Fatalf("a stranger reading another user's document must get no rows, got %v", err)
	}
}
