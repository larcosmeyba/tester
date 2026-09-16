package graphql

import (
	"testing"
	"time"

	"github.com/helpthehive/server/internal/db"
	"github.com/helpthehive/server/internal/graphql/model"
)

func TestPreferencesModelIncludesQuestionnaireFields(t *testing.T) {
	granted := db.LocationPermissionGranted
	preferences := preferencesModel(db.Preferences{
		SelectedBenefitPrograms:  []string{"SNAP", "WIC"},
		LocationPermissionStatus: granted,
	})
	if len(preferences.SelectedBenefitPrograms) != 2 ||
		preferences.SelectedBenefitPrograms[0] != "SNAP" ||
		preferences.SelectedBenefitPrograms[1] != "WIC" {
		t.Fatalf("SelectedBenefitPrograms = %v, want [SNAP WIC]", preferences.SelectedBenefitPrograms)
	}
	if preferences.LocationPermissionStatus != db.LocationPermissionGranted {
		t.Fatalf("LocationPermissionStatus = %q, want %q", preferences.LocationPermissionStatus, db.LocationPermissionGranted)
	}
}

func TestPreferencesPatchIncludesOnlySuppliedQuestionnaireFields(t *testing.T) {
	status := "granted"
	patch, err := preferencesPatchFromInput(model.UpdatePreferencesInput{
		SelectedBenefitPrograms:  []string{"SNAP"},
		LocationPermissionStatus: &status,
	})
	if err != nil {
		t.Fatalf("preferencesPatchFromInput() error = %v", err)
	}
	if len(patch.SelectedBenefitPrograms) != 1 || patch.SelectedBenefitPrograms[0] != "SNAP" {
		t.Fatalf("SelectedBenefitPrograms = %v, want [SNAP]", patch.SelectedBenefitPrograms)
	}
	if patch.LocationPermissionStatus == nil || *patch.LocationPermissionStatus != "granted" {
		t.Fatalf("LocationPermissionStatus = %v, want granted", patch.LocationPermissionStatus)
	}

	empty, err := preferencesPatchFromInput(model.UpdatePreferencesInput{})
	if err != nil {
		t.Fatalf("preferencesPatchFromInput() error = %v", err)
	}
	if empty.SelectedBenefitPrograms != nil || empty.LocationPermissionStatus != nil {
		t.Fatalf("unsupplied questionnaire fields were added to patch: %#v", empty)
	}
}

func TestQuestionnaireAnswersModelIncludesHouseholdAndIncome(t *testing.T) {
	budget, goal, householdSize, incomeBracket := "$100", "APPLY_BENEFITS", "2-3 people", "$30k-$60k"
	mapped := questionnaireAnswersModel(db.QuestionnaireAnswers{
		WeeklyBudget:  &budget,
		FinanceTopics: []string{"budgeting"},
		Resources:     []string{"food-banks"},
		PrimaryGoal:   &goal,
		HouseholdSize: &householdSize,
		IncomeBracket: &incomeBracket,
	})
	if mapped.HouseholdSize == nil || *mapped.HouseholdSize != "2-3 people" {
		t.Fatalf("HouseholdSize = %v, want 2-3 people", mapped.HouseholdSize)
	}
	if mapped.IncomeBracket == nil || *mapped.IncomeBracket != "$30k-$60k" {
		t.Fatalf("IncomeBracket = %v, want $30k-$60k", mapped.IncomeBracket)
	}
	if mapped.WeeklyBudget == nil || *mapped.WeeklyBudget != "$100" {
		t.Fatalf("WeeklyBudget = %v, want $100", mapped.WeeklyBudget)
	}
}

func TestQuestionnaireAnswersModelNilNewFields(t *testing.T) {
	mapped := questionnaireAnswersModel(db.QuestionnaireAnswers{
		FinanceTopics: []string{},
		Resources:     []string{},
	})
	if mapped.HouseholdSize != nil || mapped.IncomeBracket != nil {
		t.Fatalf("unanswered household/income = %v/%v, want nil", mapped.HouseholdSize, mapped.IncomeBracket)
	}
}

func TestConsentModelMapsRecord(t *testing.T) {
	accepted := time.Date(2026, 9, 13, 12, 0, 0, 0, time.UTC)
	mapped := consentModel(&db.Consent{
		TermsVersion:            "2026-09-01",
		TermsAcceptedAt:         accepted,
		PrivacyVersion:          "2026-09-01",
		PrivacyAcceptedAt:       accepted,
		EmailMarketingOptIn:     true,
		EmailMarketingUpdatedAt: accepted,
	})
	if mapped == nil {
		t.Fatal("consentModel() = nil, want mapped record")
	}
	if mapped.TermsVersion != "2026-09-01" || mapped.PrivacyVersion != "2026-09-01" {
		t.Fatalf("consentModel() versions = %q/%q, want 2026-09-01", mapped.TermsVersion, mapped.PrivacyVersion)
	}
	if !mapped.EmailMarketingOptIn {
		t.Fatal("consentModel() EmailMarketingOptIn = false, want true")
	}
	if mapped.TermsAcceptedAt == "" || mapped.EmailMarketingUpdatedAt == "" {
		t.Fatal("consentModel() dropped timestamps")
	}
}

func TestConsentModelNilStaysNil(t *testing.T) {
	if consentModel(nil) != nil {
		t.Fatal("consentModel(nil) = non-nil, want nil so the viewer field stays null")
	}
	if viewerModel(db.Viewer{}).Consent != nil {
		t.Fatal("viewerModel() Consent = non-nil for a viewer without consent, want nil")
	}
}
