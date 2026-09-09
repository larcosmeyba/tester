package graphql

import (
	"testing"
	"time"

	"github.com/helpthehive/server/internal/db"
	modules "github.com/helpthehive/server/internal/modules/benefits"
)

func TestBenefitsRenewalModelMapsDatesAndStatus(t *testing.T) {
	now := time.Date(2026, 9, 9, 12, 0, 0, 0, time.UTC)
	due := now.Add(30 * 24 * time.Hour)
	ends := now.Add(29 * 24 * time.Hour)
	got := benefitsRenewalModel(db.BenefitsRenewal{
		ID: "renewal-1", UserID: "user-1", ApplicationID: "app-1",
		Program: "SNAP", State: "MO", FormID: "us-mo-snap",
		CertificationEndsAt: &ends, RenewalDueAt: due,
		Source: db.RenewalSourceUserConfirmed, Status: db.RenewalStatusReminded,
		ReminderStage: 1,
	}, now)
	if got.ID != "renewal-1" || got.Program != "SNAP" || got.State != "MO" || got.FormID != "us-mo-snap" {
		t.Fatalf("benefitsRenewalModel() identity = %#v", got)
	}
	if got.Source != db.RenewalSourceUserConfirmed || got.Status != db.RenewalStatusReminded || got.ReminderStage != 1 {
		t.Fatalf("benefitsRenewalModel() status = %#v", got)
	}
	if !got.RenewalDueAt.Equal(due) || got.CertificationEndsAt == nil || !got.CertificationEndsAt.Equal(ends) {
		t.Fatalf("benefitsRenewalModel() dates = %#v", got)
	}
	if got.DaysRemaining != 30 {
		t.Fatalf("benefitsRenewalModel().DaysRemaining = %d, want 30", got.DaysRemaining)
	}
}

func TestBenefitsRenewalModelDaysRemainingGoesNegativeWhenOverdue(t *testing.T) {
	now := time.Date(2026, 9, 9, 12, 0, 0, 0, time.UTC)
	got := benefitsRenewalModel(db.BenefitsRenewal{RenewalDueAt: now.Add(-48 * time.Hour)}, now)
	if got.DaysRemaining != -2 {
		t.Fatalf("benefitsRenewalModel().DaysRemaining = %d, want -2", got.DaysRemaining)
	}
}

func TestBenefitsRenewalModelOmitsCertificationEndWhenUnknown(t *testing.T) {
	now := time.Now().UTC()
	got := benefitsRenewalModel(db.BenefitsRenewal{RenewalDueAt: now.Add(24 * time.Hour)}, now)
	if got.CertificationEndsAt != nil {
		t.Fatalf("benefitsRenewalModel().CertificationEndsAt = %v, want nil", got.CertificationEndsAt)
	}
}

func TestBenefitsProgramRuleModelMapsNullPeriod(t *testing.T) {
	notes := "one-time claim"
	got := benefitsProgramRuleModel(db.BenefitsProgramRule{
		Program: "VA", State: "*", SourceCitation: "U.S. Department of Veterans Affairs — disability claim process", Notes: &notes,
	})
	if got.Program != "VA" || got.State != "*" || got.SourceCitation != "U.S. Department of Veterans Affairs — disability claim process" {
		t.Fatalf("benefitsProgramRuleModel() = %#v", got)
	}
	if got.CertPeriodMonths != nil {
		t.Fatalf("benefitsProgramRuleModel().CertPeriodMonths = %v, want nil for no-fixed-period programs", *got.CertPeriodMonths)
	}
	if got.Notes == nil || *got.Notes != notes {
		t.Fatalf("benefitsProgramRuleModel().Notes = %v, want the notes", got.Notes)
	}

	months := 12
	got = benefitsProgramRuleModel(db.BenefitsProgramRule{
		Program: "SNAP", State: "*", CertPeriodMonths: &months, SourceCitation: "7 CFR 273.10(f)",
	})
	if got.CertPeriodMonths == nil || *got.CertPeriodMonths != 12 {
		t.Fatalf("benefitsProgramRuleModel().CertPeriodMonths = %v, want 12", got.CertPeriodMonths)
	}
}

func TestPreferencesModelIncludesRenewalFields(t *testing.T) {
	preferences := preferencesModel(db.Preferences{
		BenefitsRenewalNotificationsEnabled: true,
		BenefitsRenewalDiscreetLockScreen:   false,
	})
	if !preferences.BenefitsRenewalNotificationsEnabled {
		t.Fatalf("preferencesModel().BenefitsRenewalNotificationsEnabled = false, want true")
	}
	if preferences.BenefitsRenewalDiscreetLockScreen {
		t.Fatalf("preferencesModel().BenefitsRenewalDiscreetLockScreen = true, want false")
	}
}

func TestRenewalPushMessageNeverNamesProgramWhenDiscreet(t *testing.T) {
	message := modules.RenewalPushMessage(db.Preferences{BenefitsRenewalDiscreetLockScreen: true}, db.BenefitsRenewal{Program: "SNAP"}, 1)
	if message.Title != "Help The Hive reminder" {
		t.Fatalf("discreet title = %q, want the fixed string", message.Title)
	}
	if message.Body != "Time to review your benefits" {
		t.Fatalf("discreet body = %q, want the fixed string", message.Body)
	}
}
