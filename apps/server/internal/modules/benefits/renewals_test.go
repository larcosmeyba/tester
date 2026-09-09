package benefits

import (
	"strings"
	"testing"
	"time"

	"github.com/helpthehive/server/internal/db"
	"github.com/helpthehive/server/internal/notify"
)

func testRenewal() db.BenefitsRenewal {
	due := time.Date(2026, 10, 9, 12, 0, 0, 0, time.UTC)
	return db.BenefitsRenewal{
		ID:            "renewal-1",
		UserID:        "user-1",
		ApplicationID: "app-1",
		Program:       "SNAP",
		State:         "MO",
		FormID:        "us-mo-snap",
		RenewalDueAt:  due,
		Source:        db.RenewalSourceRuleDerived,
		Status:        db.RenewalStatusScheduled,
	}
}

// The visible push text must never name the program, carry PII or use
// eligibility language. The program rides in Data for deep-linking only.
func TestRenewalPushMessageDiscreet(t *testing.T) {
	prefs := db.Preferences{BenefitsRenewalDiscreetLockScreen: true}
	msg := RenewalPushMessage(prefs, testRenewal(), 1)

	if msg.Title != "Help The Hive reminder" {
		t.Fatalf("title = %q, want the generic default", msg.Title)
	}
	if msg.Body != "Time to review your benefits" {
		t.Fatalf("body = %q, want the generic default", msg.Body)
	}
	assertNoProgramOrEligibilityLanguage(t, msg, "SNAP")
	if msg.Data["kind"] != "benefits_renewal" || msg.Data["renewalId"] != "renewal-1" ||
		msg.Data["program"] != "SNAP" || msg.Data["state"] != "MO" {
		t.Fatalf("data = %v, want the deep-link payload", msg.Data)
	}
}

func TestRenewalPushMessageNonDiscreet(t *testing.T) {
	prefs := db.Preferences{BenefitsRenewalDiscreetLockScreen: false}
	for _, stage := range []int{1, 2, 3} {
		msg := RenewalPushMessage(prefs, testRenewal(), stage)
		assertNoProgramOrEligibilityLanguage(t, msg, "SNAP")
		if msg.Title == "" || msg.Body == "" {
			t.Fatalf("stage %d: title/body must not be empty", stage)
		}
	}
}

func assertNoProgramOrEligibilityLanguage(t *testing.T, msg notify.Message, program string) {
	t.Helper()
	visible := msg.Title + "\n" + msg.Body
	for _, forbidden := range []string{
		program, "you qualify", "you will lose", "lose your benefits",
		"eligible", "ineligible", "denied",
	} {
		if strings.Contains(strings.ToLower(visible), strings.ToLower(forbidden)) {
			t.Fatalf("visible push text %q contains forbidden %q", visible, forbidden)
		}
	}
}

func TestDaysUntilRenewal(t *testing.T) {
	now := time.Date(2026, 9, 9, 12, 0, 0, 0, time.UTC)
	cases := []struct {
		due  time.Time
		want int
	}{
		{now.Add(30 * 24 * time.Hour), 30},
		{now.Add(7 * 24 * time.Hour), 7},
		{now.Add(36 * time.Hour), 2},   // 1.5 days rounds to 2
		{now.Add(20 * time.Hour), 1},   // due tomorrow morning reads as 1
		{now.Add(-12 * time.Hour), -1}, // half a day overdue reads as -1
		{now.Add(-36 * time.Hour), -2},
	}
	for _, tc := range cases {
		if got := DaysUntilRenewal(tc.due, now); got != tc.want {
			t.Fatalf("DaysUntilRenewal(%v) = %d, want %d", tc.due, got, tc.want)
		}
	}
}
