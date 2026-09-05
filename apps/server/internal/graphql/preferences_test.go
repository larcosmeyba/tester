package graphql

import (
	"testing"

	"github.com/helpthehive/server/internal/db"
	"github.com/helpthehive/server/internal/graphql/model"
)

func TestPreferencesModelIncludesNotificationPreferences(t *testing.T) {
	preferences := preferencesModel(db.Preferences{
		NotificationsEnabled:                 true,
		ExpiringPantryNotificationsEnabled:   false,
		WeeklyMealPlanNotificationsEnabled:   true,
		ResourceReminderNotificationsEnabled: true,
	})
	if !preferences.NotificationsEnabled || preferences.ExpiringPantryNotificationsEnabled || !preferences.WeeklyMealPlanNotificationsEnabled || !preferences.ResourceReminderNotificationsEnabled {
		t.Fatalf("preferencesModel() = %#v, want notification fields mapped", preferences)
	}
}

func TestPreferencesPatchIncludesOnlySuppliedNotificationFields(t *testing.T) {
	enabled := true
	patch, err := preferencesPatchFromInput(model.UpdatePreferencesInput{
		NotificationsEnabled: &enabled,
	})
	if err != nil {
		t.Fatalf("preferencesPatchFromInput() error = %v", err)
	}
	if patch.NotificationsEnabled == nil || !*patch.NotificationsEnabled {
		t.Fatalf("NotificationsEnabled = %v, want true", patch.NotificationsEnabled)
	}
	if patch.ExpiringPantryNotificationsEnabled != nil || patch.WeeklyMealPlanNotificationsEnabled != nil || patch.ResourceReminderNotificationsEnabled != nil {
		t.Fatalf("unsupplied notification fields were added to patch: %#v", patch)
	}
}
