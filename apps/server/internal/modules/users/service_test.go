package users

import (
	"testing"

	"github.com/helpthehive/server/internal/db"
)

func TestValidateProfilePatch(t *testing.T) {
	empty := ""
	one := 1
	zero := 0

	tests := []struct {
		name    string
		patch   db.ProfilePatch
		wantErr bool
	}{
		{name: "partial update", patch: db.ProfilePatch{HouseholdSize: &one}},
		{name: "empty first name", patch: db.ProfilePatch{FirstName: &empty}, wantErr: true},
		{name: "empty last name", patch: db.ProfilePatch{LastName: &empty}, wantErr: true},
		{name: "invalid household", patch: db.ProfilePatch{HouseholdSize: &zero}, wantErr: true},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if err := validateProfilePatch(test.patch); (err != nil) != test.wantErr {
				t.Fatalf("validateProfilePatch() error = %v, wantErr %v", err, test.wantErr)
			}
		})
	}
}

func TestNormalizeAndValidateHandle(t *testing.T) {
	tests := []struct {
		input      string
		wantHandle string
		wantReason HandleReason
	}{
		{input: " DadCooks33 ", wantHandle: "dadcooks33", wantReason: HandleAvailable},
		{input: "dad_cooks", wantHandle: "dad_cooks", wantReason: HandleAvailable},
		{input: "33dad", wantHandle: "33dad", wantReason: HandleInvalidFormat},
		{input: "ab", wantHandle: "ab", wantReason: HandleInvalidFormat},
		{input: "dad.cooks", wantHandle: "dad.cooks", wantReason: HandleInvalidFormat},
		{input: "admin", wantHandle: "admin", wantReason: HandleReserved},
	}

	for _, test := range tests {
		t.Run(test.input, func(t *testing.T) {
			handle, reason := normalizeAndValidateHandle(test.input)
			if handle != test.wantHandle || reason != test.wantReason {
				t.Fatalf("normalizeAndValidateHandle(%q) = (%q, %q), want (%q, %q)", test.input, handle, reason, test.wantHandle, test.wantReason)
			}
		})
	}
}
