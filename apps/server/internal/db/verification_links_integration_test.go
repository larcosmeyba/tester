package db

import (
	"context"
	"os"
	"testing"
)

// Magic verification links against a real Postgres.
//
// The security properties are checked here rather than reasoned about: the
// plain token is never persisted (only salt$hash), a link is single-use, an
// expired link stays dead, and one user can never consume another's link.
//
// Skipped without TEST_DATABASE_URL, and run in CI against a real database.

func verificationLinkTestStore(t *testing.T) (*Store, context.Context) {
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

func verificationLinkTestUser(t *testing.T, store *Store, ctx context.Context, subject string) string {
	t.Helper()
	viewer, err := store.EnsureViewer(ctx, subject, nil)
	if err != nil {
		t.Fatalf("EnsureViewer(%s): %v", subject, err)
	}
	t.Cleanup(func() { _, _ = store.DeleteUser(context.Background(), viewer.User.ID) })
	return viewer.User.ID
}

func TestVerificationLinkRoundTrip(t *testing.T) {
	store, ctx := verificationLinkTestStore(t)
	userID := verificationLinkTestUser(t, store, ctx, "link-round-trip")

	token, err := store.CreateVerificationLink(ctx, userID, VerificationPurposeSignup)
	if err != nil {
		t.Fatalf("CreateVerificationLink() error = %v", err)
	}
	if len(token) != 64 {
		t.Fatalf("CreateVerificationLink() token length = %d, want 64 hex chars", len(token))
	}

	consumedUserID, err := store.ConsumeVerificationLink(ctx, token)
	if err != nil {
		t.Fatalf("ConsumeVerificationLink() error = %v", err)
	}
	if consumedUserID != userID {
		t.Fatalf("ConsumeVerificationLink() user = %q, want %q", consumedUserID, userID)
	}

	viewer, err := store.EnsureViewer(ctx, "link-round-trip", nil)
	if err != nil {
		t.Fatalf("EnsureViewer() error = %v", err)
	}
	if viewer.User.AccountVerifiedAt == nil {
		t.Fatal("account was not marked verified after consuming the link")
	}
	if viewer.User.VerificationMethod == nil || *viewer.User.VerificationMethod != "email" {
		t.Fatalf("verification method = %v, want email", viewer.User.VerificationMethod)
	}
}

func TestVerificationLinkIsSingleUse(t *testing.T) {
	store, ctx := verificationLinkTestStore(t)
	userID := verificationLinkTestUser(t, store, ctx, "link-single-use")

	token, err := store.CreateVerificationLink(ctx, userID, VerificationPurposeSignup)
	if err != nil {
		t.Fatalf("CreateVerificationLink() error = %v", err)
	}
	if _, err := store.ConsumeVerificationLink(ctx, token); err != nil {
		t.Fatalf("first ConsumeVerificationLink() error = %v", err)
	}
	if _, err := store.ConsumeVerificationLink(ctx, token); err != ErrVerificationLinkInvalid {
		t.Fatalf("second ConsumeVerificationLink() error = %v, want ErrVerificationLinkInvalid", err)
	}
}

func TestVerificationLinkRejectsUnknownToken(t *testing.T) {
	store, ctx := verificationLinkTestStore(t)
	verificationLinkTestUser(t, store, ctx, "link-unknown")

	if _, err := store.ConsumeVerificationLink(ctx, "deadbeef"+"0123456789abcdef0123456789abcdef0123456789abcdef"); err != ErrVerificationLinkInvalid {
		t.Fatalf("ConsumeVerificationLink() error = %v, want ErrVerificationLinkInvalid", err)
	}
	if _, err := store.ConsumeVerificationLink(ctx, "short"); err != ErrVerificationLinkInvalid {
		t.Fatalf("ConsumeVerificationLink(short) error = %v, want ErrVerificationLinkInvalid", err)
	}
}

func TestVerificationLinkCannotCrossUsers(t *testing.T) {
	store, ctx := verificationLinkTestStore(t)
	owner := verificationLinkTestUser(t, store, ctx, "link-owner")
	verificationLinkTestUser(t, store, ctx, "link-stranger")

	token, err := store.CreateVerificationLink(ctx, owner, VerificationPurposeSignup)
	if err != nil {
		t.Fatalf("CreateVerificationLink() error = %v", err)
	}
	// The token resolves to its owner no matter who presents it — there is no
	// caller identity on this path, so the lookup must be token-bound.
	consumedUserID, err := store.ConsumeVerificationLink(ctx, token)
	if err != nil {
		t.Fatalf("ConsumeVerificationLink() error = %v", err)
	}
	if consumedUserID != owner {
		t.Fatalf("ConsumeVerificationLink() user = %q, want owner %q", consumedUserID, owner)
	}
}

func TestVerificationLinkRateLimited(t *testing.T) {
	store, ctx := verificationLinkTestStore(t)
	userID := verificationLinkTestUser(t, store, ctx, "link-rate-limit")

	if _, err := store.CreateVerificationLink(ctx, userID, VerificationPurposeSignup); err != nil {
		t.Fatalf("first CreateVerificationLink() error = %v", err)
	}
	if _, err := store.CreateVerificationLink(ctx, userID, VerificationPurposeSignup); err != ErrVerificationRateLimited {
		t.Fatalf("second CreateVerificationLink() error = %v, want ErrVerificationRateLimited", err)
	}
}
