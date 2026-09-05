package db

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
)

func TestStoreIntegrationUserScopingAndPantryCRUD(t *testing.T) {
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
	defer pool.Close()

	store := NewStore(pool)
	subjectA := fmt.Sprintf("test-user-a-%d", time.Now().UnixNano())
	subjectB := fmt.Sprintf("test-user-b-%d", time.Now().UnixNano())

	viewerA, err := store.EnsureViewer(ctx, subjectA, stringPtr("a@example.com"))
	if err != nil {
		t.Fatalf("EnsureViewer(A) error = %v", err)
	}
	viewerB, err := store.EnsureViewer(ctx, subjectB, stringPtr("b@example.com"))
	if err != nil {
		t.Fatalf("EnsureViewer(B) error = %v", err)
	}
	if viewerA.Preferences.NotificationsEnabled || !viewerA.Preferences.ExpiringPantryNotificationsEnabled || !viewerA.Preferences.WeeklyMealPlanNotificationsEnabled || viewerA.Preferences.ResourceReminderNotificationsEnabled {
		t.Fatalf("new user notification preferences = %#v, want migration defaults", viewerA.Preferences)
	}

	enabled, disabled := true, false
	preferences, err := store.UpdatePreferences(ctx, viewerA.User.ID, PreferencesPatch{
		NotificationsEnabled:                 &enabled,
		ExpiringPantryNotificationsEnabled:   &disabled,
		WeeklyMealPlanNotificationsEnabled:   &disabled,
		ResourceReminderNotificationsEnabled: &enabled,
	})
	if err != nil {
		t.Fatalf("UpdatePreferences(A notifications) error = %v", err)
	}
	if !preferences.NotificationsEnabled || preferences.ExpiringPantryNotificationsEnabled || preferences.WeeklyMealPlanNotificationsEnabled || !preferences.ResourceReminderNotificationsEnabled {
		t.Fatalf("updated notification preferences = %#v, want persisted values", preferences)
	}
	budget := "$100-$150"
	preferences, err = store.UpdatePreferences(ctx, viewerA.User.ID, PreferencesPatch{WeeklyBudget: &budget})
	if err != nil {
		t.Fatalf("UpdatePreferences(A partial) error = %v", err)
	}
	if preferences.WeeklyBudget != budget || !preferences.NotificationsEnabled || !preferences.ResourceReminderNotificationsEnabled {
		t.Fatalf("partial preference update = %#v, want notification values preserved", preferences)
	}
	if _, err := store.CompleteOnboarding(ctx, viewerA.User.ID); err != nil {
		t.Fatalf("CompleteOnboarding(A) error = %v", err)
	}
	reloadedViewerA, err := store.EnsureViewer(ctx, subjectA, stringPtr("a@example.com"))
	if err != nil {
		t.Fatalf("EnsureViewer(A after onboarding) error = %v", err)
	}
	if !reloadedViewerA.OnboardingState.HasCompletedOnboarding || !reloadedViewerA.Preferences.NotificationsEnabled {
		t.Fatalf("reloaded viewer = %#v, want onboarding and notification preferences persisted", reloadedViewerA)
	}

	pushToken := fmt.Sprintf("ExponentPushToken[test-%d]", time.Now().UnixNano())
	if _, err := store.UpsertPushToken(ctx, viewerA.User.ID, pushToken, "ANDROID", nil); err != nil {
		t.Fatalf("UpsertPushToken(A) error = %v", err)
	}
	if _, err := store.UpsertPushToken(ctx, viewerB.User.ID, pushToken, "ANDROID", nil); err != nil {
		t.Fatalf("UpsertPushToken(B reassignment) error = %v", err)
	}
	if deleted, err := store.DeletePushToken(ctx, viewerA.User.ID, pushToken); err != nil || deleted {
		t.Fatalf("DeletePushToken(A after reassignment) = %v, %v, want false, nil", deleted, err)
	}
	if deleted, err := store.DeletePushToken(ctx, viewerB.User.ID, pushToken); err != nil || !deleted {
		t.Fatalf("DeletePushToken(B owner) = %v, %v, want true, nil", deleted, err)
	}

	updatedViewerA, err := store.EnsureViewer(ctx, subjectA, stringPtr("a.changed@example.com"))
	if err != nil {
		t.Fatalf("EnsureViewer(A changed email) error = %v", err)
	}
	if updatedViewerA.User.Email == nil || *updatedViewerA.User.Email != "a.changed@example.com" {
		t.Fatalf("user A email = %v, want synchronized verified email", updatedViewerA.User.Email)
	}

	firstName, lastName, phone, zip, householdSize := "Ada", "Lovelace", "555-0100", "80202", 4
	profile, err := store.UpdateProfile(ctx, viewerA.User.ID, ProfilePatch{
		FirstName: &firstName, LastName: &lastName, Phone: &phone, Zip: &zip, HouseholdSize: &householdSize,
	})
	if err != nil {
		t.Fatalf("UpdateProfile(A) error = %v", err)
	}
	if profile.FirstName != firstName || profile.LastName != lastName || profile.HouseholdSize != householdSize {
		t.Fatalf("profile A = %#v, want persisted profile fields", profile)
	}

	handleSuffix := fmt.Sprintf("%x", time.Now().UnixNano())
	firstHandle := "dad" + handleSuffix
	secondHandle := "mom" + handleSuffix
	sharedHandle := "shared" + handleSuffix
	profile, err = store.UpdateHandle(ctx, viewerA.User.ID, firstHandle, 30*24*time.Hour)
	if err != nil {
		t.Fatalf("UpdateHandle(A) error = %v", err)
	}
	if profile.Handle == nil || *profile.Handle != firstHandle {
		t.Fatalf("profile A handle = %v, want %s", profile.Handle, firstHandle)
	}
	if _, err := store.UpdateHandle(ctx, viewerB.User.ID, firstHandle, 30*24*time.Hour); !errors.Is(err, ErrHandleUnavailable) {
		t.Fatalf("UpdateHandle(B duplicate) error = %v, want ErrHandleUnavailable", err)
	}
	if _, err := store.UpdateHandle(ctx, viewerA.User.ID, secondHandle, 30*24*time.Hour); err == nil {
		t.Fatal("UpdateHandle(A during cooldown) error = nil, want cooldown")
	} else {
		var cooldown *HandleCooldownError
		if !errors.As(err, &cooldown) {
			t.Fatalf("UpdateHandle(A during cooldown) error = %v, want HandleCooldownError", err)
		}
	}
	store.now = func() time.Time { return time.Now().Add(31 * 24 * time.Hour) }
	if _, err := store.UpdateHandle(ctx, viewerA.User.ID, secondHandle, 30*24*time.Hour); err != nil {
		t.Fatalf("UpdateHandle(A after cooldown) error = %v", err)
	}
	alias, err := store.FindHandle(ctx, firstHandle)
	if err != nil || alias == nil || alias.IsCurrent || alias.RetiredAt == nil {
		t.Fatalf("FindHandle(dadcooks33) = %#v, %v, want retired alias", alias, err)
	}
	if _, err := store.UpdateHandle(ctx, viewerB.User.ID, firstHandle, 0); !errors.Is(err, ErrHandleUnavailable) {
		t.Fatalf("UpdateHandle(B retired alias) error = %v, want ErrHandleUnavailable", err)
	}

	viewerC, err := store.EnsureViewer(ctx, fmt.Sprintf("test-user-c-%d", time.Now().UnixNano()), nil)
	if err != nil {
		t.Fatalf("EnsureViewer(C) error = %v", err)
	}
	viewerD, err := store.EnsureViewer(ctx, fmt.Sprintf("test-user-d-%d", time.Now().UnixNano()), nil)
	if err != nil {
		t.Fatalf("EnsureViewer(D) error = %v", err)
	}
	results := make(chan error, 2)
	go func() {
		_, claimErr := store.UpdateHandle(ctx, viewerC.User.ID, sharedHandle, 0)
		results <- claimErr
	}()
	go func() {
		_, claimErr := store.UpdateHandle(ctx, viewerD.User.ID, sharedHandle, 0)
		results <- claimErr
	}()
	firstClaim, secondClaim := <-results, <-results
	successes := 0
	unavailable := 0
	for _, claimErr := range []error{firstClaim, secondClaim} {
		if claimErr == nil {
			successes++
		} else if errors.Is(claimErr, ErrHandleUnavailable) {
			unavailable++
		} else {
			t.Fatalf("concurrent UpdateHandle error = %v", claimErr)
		}
	}
	if successes != 1 || unavailable != 1 {
		t.Fatalf("concurrent claims successes=%d unavailable=%d, want 1 and 1", successes, unavailable)
	}

	item, err := store.CreatePantryItem(ctx, CreatePantryItemParams{
		UserID:         viewerA.User.ID,
		Name:           "Rice",
		Quantity:       "2 lb",
		Location:       "PANTRY",
		ExpirationDate: time.Date(2026, 9, 1, 0, 0, 0, 0, time.UTC),
		Category:       "Grains",
	})
	if err != nil {
		t.Fatalf("CreatePantryItem() error = %v", err)
	}

	itemsA, err := store.ListPantryItems(ctx, viewerA.User.ID, PantryFilter{})
	if err != nil {
		t.Fatalf("ListPantryItems(A) error = %v", err)
	}
	if len(itemsA) == 0 || itemsA[0].ID != item.ID {
		t.Fatalf("user A items = %#v, want created item", itemsA)
	}

	itemsB, err := store.ListPantryItems(ctx, viewerB.User.ID, PantryFilter{})
	if err != nil {
		t.Fatalf("ListPantryItems(B) error = %v", err)
	}
	if len(itemsB) != 0 {
		t.Fatalf("user B saw user A items: %#v", itemsB)
	}

	deleted, err := store.DeleteUser(ctx, viewerA.User.ID)
	if err != nil || !deleted {
		t.Fatalf("DeleteUser(A) = %v, %v, want true, nil", deleted, err)
	}
	for _, table := range []string{"users", "profiles", "preferences", "onboarding_state", "pantry_items", "push_tokens", "profile_handles"} {
		var count int
		query := fmt.Sprintf("SELECT count(*) FROM %s WHERE user_id = $1", table)
		if table == "users" {
			query = "SELECT count(*) FROM users WHERE id = $1"
		}
		if err := pool.QueryRow(ctx, query, viewerA.User.ID).Scan(&count); err != nil {
			t.Fatalf("count deleted %s rows: %v", table, err)
		}
		if count != 0 {
			t.Fatalf("%s rows after DeleteUser(A) = %d, want 0", table, count)
		}
	}
}

func runMigrations(t *testing.T, databaseURL string) {
	t.Helper()
	if err := goose.SetDialect("postgres"); err != nil {
		t.Fatalf("SetDialect() error = %v", err)
	}
	conn, err := sql.Open("pgx", databaseURL)
	if err != nil {
		t.Fatalf("sql.Open() error = %v", err)
	}
	defer conn.Close()
	if err := goose.Up(conn, "../../migrations"); err != nil {
		t.Fatalf("goose.Up() error = %v", err)
	}
}

func stringPtr(value string) *string {
	return &value
}
