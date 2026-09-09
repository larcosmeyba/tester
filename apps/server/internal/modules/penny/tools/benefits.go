package tools

import (
	"context"
	"strings"

	"github.com/helpthehive/server/internal/auth"
	domain "github.com/helpthehive/server/internal/domain/penny"
)

// Benefits, read-only.
//
// The BenefitsService interface this package declares has no StartApplication,
// no Approve and no Document. That is the whole of Penny's relationship with
// government forms: she can say what a program is, which forms exist, and which
// questions the user has not answered yet. She cannot fill one in, cannot
// approve one, and cannot submit one — not because she is instructed not to,
// but because the methods are not reachable from here.
//
// The benefits domain package states the reason: a wrong answer on one of these
// forms is a false statement to a government agency, made in the applicant's
// name. A language model is the wrong thing to have authoring those.

type benefitsStatusView struct {
	// How far through the questionnaire the user is. A count, not a judgement.
	AnsweredCount int  `json:"answered_count"`
	HasProfile    bool `json:"has_profile"`
	// Restated on every call, because this is the tool most likely to be used
	// in a conversation where somebody is hoping for a yes.
	Note string `json:"note"`
}

const benefitsNote = "This reports how complete the user's saved answers are. It says nothing about whether " +
	"they qualify for any program. Only the agency that runs a program decides that."

func benefitsProfileStatus(ctx context.Context, g *Gateway, identity auth.Identity, _ Args) (any, error) {
	profile, err := g.services.Benefits.Profile(ctx, identity)
	if err != nil {
		return nil, err
	}
	if profile == nil {
		return benefitsStatusView{HasProfile: false, Note: benefitsNote}, nil
	}
	return benefitsStatusView{
		AnsweredCount: len(profile.AnsweredPaths()),
		HasProfile:    true,
		Note:          benefitsNote,
	}, nil
}

type benefitsFormView struct {
	Program   string `json:"program"`
	FormCode  string `json:"form_code"`
	FormTitle string `json:"form_title"`
	AgencyURL string `json:"agency_url,omitempty"`
}

func benefitsPrograms(ctx context.Context, g *Gateway, identity auth.Identity, args Args) (any, error) {
	// The state comes from the user's profile unless they explicitly named a
	// different one — somebody asking "what about Ohio?" is asking a real
	// question, and this tool only lists what exists.
	state := strings.ToUpper(args.OptionalString("state", ""))
	if state == "" {
		viewer, err := g.services.Users.Viewer(ctx, identity)
		if err != nil {
			return nil, err
		}
		state = strings.TrimPrefix(domain.Jurisdiction(viewer.Profile.Zip), "US-")
	}

	forms := g.services.Benefits.Forms(state, strings.ToUpper(args.OptionalString("program", "")))
	out := make([]benefitsFormView, 0, len(forms))
	for _, form := range forms {
		out = append(out, benefitsFormView{
			Program:   form.Mapping.Program,
			FormCode:  form.Mapping.FormCode,
			FormTitle: form.Mapping.FormTitle,
			AgencyURL: form.Mapping.AgencyURL,
		})
	}
	return map[string]any{
		"state": state,
		"forms": out,
		"note":  "Listing which forms exist. This does not decide eligibility and does not submit anything.",
	}, nil
}
