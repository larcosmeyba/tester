package tools

import (
	"context"

	"github.com/helpthehive/server/internal/auth"
	domain "github.com/helpthehive/server/internal/domain/penny"
)

// What Penny is told about the person she is talking to.
//
// These handlers return a shaped view rather than the stored record. The
// difference matters: db.Viewer holds an email, an auth subject and a phone
// number, none of which Penny needs and all of which would end up in a prompt
// sent to a third party if this returned the struct as it comes out of the
// database.

type profileView struct {
	FirstName     string `json:"first_name,omitempty"`
	HouseholdSize int    `json:"household_size"`
	// The jurisdiction, not the ZIP. Penny needs to know which state's rules
	// apply; she does not need to know where someone lives to five digits.
	Jurisdiction string `json:"jurisdiction,omitempty"`
	WeeklyBudget string `json:"weekly_budget,omitempty"`
}

func getProfile(ctx context.Context, g *Gateway, identity auth.Identity, _ Args) (any, error) {
	viewer, err := g.services.Users.Viewer(ctx, identity)
	if err != nil {
		return nil, err
	}
	return profileView{
		FirstName:     viewer.Profile.FirstName,
		HouseholdSize: viewer.Profile.HouseholdSize,
		Jurisdiction:  domain.Jurisdiction(viewer.Profile.Zip),
		WeeklyBudget:  viewer.Preferences.WeeklyBudget,
	}, nil
}

type householdView struct {
	Size int `json:"size"`
	// What the user said they want help with, from onboarding. Useful context
	// for what to offer; not a fact about them.
	PreferredResources []string `json:"preferred_resources,omitempty"`
	WantsGovAssistance bool     `json:"wants_gov_assistance"`
	Jurisdiction       string   `json:"jurisdiction,omitempty"`
}

func getHousehold(ctx context.Context, g *Gateway, identity auth.Identity, _ Args) (any, error) {
	viewer, err := g.services.Users.Viewer(ctx, identity)
	if err != nil {
		return nil, err
	}
	return householdView{
		Size:               viewer.Profile.HouseholdSize,
		PreferredResources: viewer.Preferences.PreferredResources,
		WantsGovAssistance: viewer.Preferences.WantsGovAssistance,
		Jurisdiction:       domain.Jurisdiction(viewer.Profile.Zip),
	}, nil
}
