package tools

import (
	"context"
	"time"

	"github.com/helpthehive/server/internal/auth"
	"github.com/helpthehive/server/internal/db"
	benefitsdomain "github.com/helpthehive/server/internal/domain/benefits"
	"github.com/helpthehive/server/internal/domain/meals"
	domain "github.com/helpthehive/server/internal/domain/penny"
	benefitsmod "github.com/helpthehive/server/internal/modules/benefits"
)

// Claims is what the gateway knows about the turn it is serving. It is
// satisfied by the signed tool token, and it is an interface here so that the
// tools package does not import the module that mints tokens — which imports
// this one.
//
// Identity is the important method. It returns the user the token names, which
// is the only identity any handler ever runs as. Nothing in a tool call's
// arguments can change it.
type Claims interface {
	Identity() auth.Identity
	Turn() string
	Conversation() string
	Permits(tool string) (domain.Tool, error)
}

// The service interfaces below are declared here, at the point of use, rather
// than taken as concrete types. Two reasons, and the second is the real one:
// the gateway is testable without a database, and the exact set of methods
// Penny can reach on each service is written down. `pantry.Service` has methods
// this list does not include, and Penny cannot call them.

type UsersService interface {
	Viewer(ctx context.Context, identity auth.Identity) (db.Viewer, error)
	UpdatePreferences(ctx context.Context, identity auth.Identity, patch db.PreferencesPatch, emailMarketingOptIn *bool) (db.Preferences, error)
}

type PantryService interface {
	List(ctx context.Context, identity auth.Identity, filter db.PantryFilter) ([]db.PantryItem, error)
	Add(ctx context.Context, identity auth.Identity, params db.CreatePantryItemParams) (db.PantryItem, error)
	Update(ctx context.Context, identity auth.Identity, id string, patch db.PantryItemPatch) (db.PantryItem, error)
	MarkUsed(ctx context.Context, identity auth.Identity, id string) (db.PantryItem, error)
}

type MealPlansService interface {
	Generate(ctx context.Context, identity auth.Identity, request meals.PlanRequest) (meals.Plan, error)
	Current(ctx context.Context, identity auth.Identity) (*meals.Plan, error)
	Get(ctx context.Context, identity auth.Identity, planID string) (meals.Plan, error)
	Move(ctx context.Context, identity auth.Identity, planID string, from meals.Slot, to meals.Slot) (meals.Plan, error)
	Swap(ctx context.Context, identity auth.Identity, planID string, slot meals.Slot, action string, keepBasket bool) (meals.Plan, error)
}

type GroceryService interface {
	Accept(ctx context.Context, identity auth.Identity, planID string) (meals.GroceryListResult, error)
	List(ctx context.Context, identity auth.Identity, planID string) (*meals.GroceryListResult, error)
	SetItemChecked(ctx context.Context, identity auth.Identity, planID string, ingredientID string, checked bool) (bool, error)
}

// BenefitsService is read-only by construction. StartApplication, Approve and
// Document are absent from this interface and therefore absent from Penny: she
// explains programs and reports what is missing from a profile. She does not
// fill in, approve, or submit a government form.
type BenefitsService interface {
	Profile(ctx context.Context, identity auth.Identity) (*benefitsdomain.Profile, error)
	Forms(state, program string) []*benefitsmod.Form
}

// Repository is the database surface tools use directly: memory, knowledge and
// the audit log. Everything else goes through a service, because everything
// else has rules attached.
type Repository interface {
	RecordPennyToolCall(ctx context.Context, call db.PennyToolCall) error
	UpsertPennyMemory(ctx context.Context, params db.CreatePennyMemoryParams) (domain.Memory, error)
	RecallPennyMemories(ctx context.Context, query db.PennyMemoryQuery) ([]domain.Memory, error)
	SearchKnowledge(ctx context.Context, query db.KnowledgeQuery, now time.Time) ([]db.KnowledgeResult, error)
}
