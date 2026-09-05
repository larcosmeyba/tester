package pantry

import (
	"testing"
	"time"

	"github.com/helpthehive/server/internal/db"
)

func TestValidateCreateParams(t *testing.T) {
	params := db.CreatePantryItemParams{
		Name:           "Rice",
		Quantity:       "2 lb",
		Location:       "PANTRY",
		ExpirationDate: time.Date(2026, 9, 1, 0, 0, 0, 0, time.UTC),
		Category:       "Grains",
	}
	if err := validateCreateParams(params); err != nil {
		t.Fatalf("validateCreateParams() error = %v", err)
	}

	params.Location = "CABINET"
	if err := validateCreateParams(params); err == nil {
		t.Fatal("expected invalid location to fail")
	}
}

func TestValidatePatchRejectsEmptyNameAndInvalidStatus(t *testing.T) {
	empty := ""
	if err := validatePatch(db.PantryItemPatch{Name: &empty}); err == nil {
		t.Fatal("expected empty name to fail")
	}

	status := "DONE"
	if err := validatePatch(db.PantryItemPatch{Status: &status}); err == nil {
		t.Fatal("expected invalid status to fail")
	}
}
