package tools

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"testing"
	"time"

	"github.com/helpthehive/server/internal/auth"
	"github.com/helpthehive/server/internal/db"
	"github.com/helpthehive/server/internal/domain/meals"
	domain "github.com/helpthehive/server/internal/domain/penny"
)

// The contract test. A tool the model has been offered and the server cannot
// run is a failure a user meets mid-conversation; this makes it a failure the
// build meets instead.
func TestEveryRegisteredToolIsRunnableOrDeclaredUnavailable(t *testing.T) {
	implemented := handlers()
	missing := unavailable()

	for _, tool := range domain.Tools() {
		_, hasHandler := implemented[tool.Name]
		reason, isUnavailable := missing[tool.Name]

		switch {
		case hasHandler && isUnavailable:
			t.Errorf("%s is both implemented and marked unavailable", tool.Name)
		case !hasHandler && !isUnavailable:
			t.Errorf("%s is in the registry with no handler and no stated reason", tool.Name)
		case isUnavailable && reason == "":
			t.Errorf("%s is unavailable with no reason to tell the user", tool.Name)
		}
	}

	// And nothing implemented that is not offered: a handler with no registry
	// entry is dead code that looks like a capability.
	for name := range implemented {
		if _, err := domain.Lookup(name); err != nil {
			t.Errorf("handler %s has no registry entry", name)
		}
	}
	for name := range missing {
		if _, err := domain.Lookup(name); err != nil {
			t.Errorf("unavailable entry %s has no registry entry", name)
		}
	}
}

// --- the boundary ---------------------------------------------------------

func TestGatewayDeniesToolsOutsideTheGrantedScopes(t *testing.T) {
	gateway, recorder := testGateway()

	response := gateway.Execute(context.Background(),
		claims("turn-1", "user-1", domain.ScopePantry),
		domain.ToolRequest{Tool: "budget.set_weekly", Arguments: map[string]any{"amount": 50.0}})

	if !response.Denied {
		t.Fatal("a tool outside the granted scopes was not denied")
	}
	if response.Result != nil {
		t.Fatal("a denied call returned a result")
	}
	if len(recorder.calls) != 1 || recorder.calls[0].Outcome != db.ToolCallDenied {
		t.Fatalf("the denial was not audited: %+v", recorder.calls)
	}
}

func TestGatewayDeniesUndeclaredArguments(t *testing.T) {
	gateway, _ := testGateway()

	response := gateway.Execute(context.Background(),
		claims("turn-1", "user-1", domain.ScopePantry),
		domain.ToolRequest{Tool: "pantry.list", Arguments: map[string]any{"user_id": "somebody-else"}})

	if !response.Denied {
		t.Fatal("an undeclared argument was accepted")
	}
}

// The heart of it: a high-impact write does not happen because a model asked.
func TestGatewayProposesRatherThanExecutingHighImpactWrites(t *testing.T) {
	gateway, recorder := testGateway()
	plans := gateway.services.MealPlans.(*fakeMealPlans)

	response := gateway.Execute(context.Background(),
		claims("turn-1", "user-1", domain.ScopeMealPlan),
		domain.ToolRequest{Tool: "mealplan.generate", Arguments: map[string]any{"days": 7.0}})

	if response.Proposed == nil {
		t.Fatal("mealplan.generate executed instead of proposing")
	}
	if plans.generated != 0 {
		t.Fatal("a plan was generated before the user confirmed")
	}
	if response.Proposed.Summary == "" {
		t.Fatal("the proposal had no summary for the user to agree to")
	}
	if recorder.calls[0].Outcome != db.ToolCallProposed {
		t.Fatalf("the proposal was audited as %q", recorder.calls[0].Outcome)
	}

	// And on confirmation it runs, with the arguments from the proposal.
	if _, err := gateway.Confirm(context.Background(),
		auth.Identity{Subject: "user-1"}, "turn-1", *response.Proposed); err != nil {
		t.Fatal(err)
	}
	if plans.generated != 1 {
		t.Fatal("the confirmed plan was not generated")
	}
}

// Confirm must not be a path that runs anything the caller names.
func TestConfirmRefusesToolsThatWereNeverProposals(t *testing.T) {
	gateway, _ := testGateway()

	_, err := gateway.Confirm(context.Background(), auth.Identity{Subject: "user-1"}, "turn-1",
		domain.ProposedAction{Tool: "pantry.mark_used", Arguments: map[string]any{"item_id": "x"}})
	if err == nil {
		t.Fatal("Confirm executed a tool that was never a proposal")
	}
}

// Every handler runs as the token's user. Nothing in the arguments changes it.
func TestToolsRunAsTheTokenIdentity(t *testing.T) {
	gateway, _ := testGateway()
	pantry := gateway.services.Pantry.(*fakePantry)

	gateway.Execute(context.Background(),
		claims("turn-1", "user-1", domain.ScopePantry),
		domain.ToolRequest{Tool: "pantry.list", Arguments: map[string]any{}})

	if pantry.lastIdentity.Subject != "user-1" {
		t.Fatalf("the tool ran as %q, want user-1", pantry.lastIdentity.Subject)
	}
}

func TestUnavailableToolsReportWhyRatherThanFailing(t *testing.T) {
	gateway, _ := testGateway()

	response := gateway.Execute(context.Background(),
		claims("turn-1", "user-1", domain.ScopeResources),
		domain.ToolRequest{Tool: "resources.search", Arguments: map[string]any{"query": "food bank"}})

	if response.Error == "" {
		t.Fatal("an unavailable tool reported no reason")
	}
	if response.Result != nil {
		t.Fatal("an unavailable tool returned a result")
	}
}

func TestWritesAreAudited(t *testing.T) {
	gateway, recorder := testGateway()

	gateway.Execute(context.Background(),
		claims("turn-9", "user-1", domain.ScopePantry),
		domain.ToolRequest{Tool: "pantry.add", Arguments: map[string]any{
			"name": "milk", "quantity": "1 gal", "location": "REFRIGERATOR",
		}})

	if len(recorder.calls) != 1 {
		t.Fatalf("expected one audit row, got %d", len(recorder.calls))
	}
	call := recorder.calls[0]
	if call.Outcome != db.ToolCallExecuted || call.Tool != "pantry.add" || call.TurnID != "turn-9" {
		t.Fatalf("the write was audited incorrectly: %+v", call)
	}
}

// --- fakes ----------------------------------------------------------------

func testGateway() (*Gateway, *fakeRepo) {
	repo := &fakeRepo{}
	gateway := NewGateway(Services{
		Users:     &fakeUsers{},
		Pantry:    &fakePantry{},
		MealPlans: &fakeMealPlans{},
		Grocery:   &fakeGrocery{},
		Store:     repo,
	}, slog.New(slog.NewTextHandler(io.Discard, nil)))
	gateway.now = func() time.Time { return time.Date(2026, 9, 8, 12, 0, 0, 0, time.UTC) }
	return gateway, repo
}

type fakeClaims struct {
	turn   string
	user   string
	scopes []domain.Scope
}

func claims(turn, user string, scopes ...domain.Scope) fakeClaims {
	return fakeClaims{turn: turn, user: user, scopes: scopes}
}

func (c fakeClaims) Identity() auth.Identity { return auth.Identity{Subject: c.user} }
func (c fakeClaims) Turn() string            { return c.turn }
func (c fakeClaims) Conversation() string    { return "conv-1" }

func (c fakeClaims) Permits(name string) (domain.Tool, error) {
	tool, err := domain.Lookup(name)
	if err != nil {
		return domain.Tool{}, err
	}
	if !tool.Requires(c.scopes) {
		return domain.Tool{}, errors.New("out of scope")
	}
	return tool, nil
}

type fakeRepo struct{ calls []db.PennyToolCall }

func (f *fakeRepo) RecordPennyToolCall(_ context.Context, call db.PennyToolCall) error {
	f.calls = append(f.calls, call)
	return nil
}

func (f *fakeRepo) UpsertPennyMemory(context.Context, db.CreatePennyMemoryParams) (domain.Memory, error) {
	return domain.Memory{}, nil
}

func (f *fakeRepo) RecallPennyMemories(context.Context, db.PennyMemoryQuery) ([]domain.Memory, error) {
	return nil, nil
}

func (f *fakeRepo) SearchKnowledge(context.Context, db.KnowledgeQuery, time.Time) ([]db.KnowledgeResult, error) {
	return nil, nil
}

type fakeUsers struct{}

func (f *fakeUsers) Viewer(context.Context, auth.Identity) (db.Viewer, error) {
	return db.Viewer{
		User:        db.User{ID: "user-1"},
		Profile:     db.Profile{FirstName: "Sam", Zip: "43215", HouseholdSize: 4},
		Preferences: db.Preferences{WeeklyBudget: "120.00"},
	}, nil
}

func (f *fakeUsers) UpdatePreferences(_ context.Context, _ auth.Identity, patch db.PreferencesPatch) (db.Preferences, error) {
	out := db.Preferences{}
	if patch.WeeklyBudget != nil {
		out.WeeklyBudget = *patch.WeeklyBudget
	}
	return out, nil
}

type fakePantry struct{ lastIdentity auth.Identity }

func (f *fakePantry) List(_ context.Context, identity auth.Identity, _ db.PantryFilter) ([]db.PantryItem, error) {
	f.lastIdentity = identity
	return []db.PantryItem{{ID: "item-1", Name: "spinach", ExpirationDate: time.Now().Add(48 * time.Hour)}}, nil
}

func (f *fakePantry) Add(_ context.Context, identity auth.Identity, params db.CreatePantryItemParams) (db.PantryItem, error) {
	f.lastIdentity = identity
	return db.PantryItem{ID: "item-2", Name: params.Name, ExpirationDate: params.ExpirationDate}, nil
}

func (f *fakePantry) Update(_ context.Context, identity auth.Identity, id string, _ db.PantryItemPatch) (db.PantryItem, error) {
	f.lastIdentity = identity
	return db.PantryItem{ID: id}, nil
}

func (f *fakePantry) MarkUsed(_ context.Context, identity auth.Identity, id string) (db.PantryItem, error) {
	f.lastIdentity = identity
	return db.PantryItem{ID: id}, nil
}

type fakeMealPlans struct{ generated int }

func (f *fakeMealPlans) Generate(context.Context, auth.Identity, meals.PlanRequest) (meals.Plan, error) {
	f.generated++
	return meals.Plan{PlanID: "plan-1"}, nil
}

func (f *fakeMealPlans) Current(context.Context, auth.Identity) (*meals.Plan, error) { return nil, nil }

func (f *fakeMealPlans) Get(_ context.Context, _ auth.Identity, planID string) (meals.Plan, error) {
	return meals.Plan{PlanID: planID}, nil
}

func (f *fakeMealPlans) Move(context.Context, auth.Identity, string, meals.Slot, meals.Slot) (meals.Plan, error) {
	return meals.Plan{}, nil
}

func (f *fakeMealPlans) Swap(context.Context, auth.Identity, string, meals.Slot, string, bool) (meals.Plan, error) {
	return meals.Plan{}, nil
}

type fakeGrocery struct{}

func (f *fakeGrocery) Accept(context.Context, auth.Identity, string) (meals.GroceryListResult, error) {
	return meals.GroceryListResult{}, nil
}

func (f *fakeGrocery) List(context.Context, auth.Identity, string) (*meals.GroceryListResult, error) {
	return nil, nil
}

func (f *fakeGrocery) SetItemChecked(context.Context, auth.Identity, string, string, bool) (bool, error) {
	return true, nil
}
