package tools

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"time"

	"github.com/helpthehive/server/internal/auth"
	"github.com/helpthehive/server/internal/db"
	domain "github.com/helpthehive/server/internal/domain/penny"
)

// Handler runs one tool. It receives the authenticated identity — never a user
// id from the model — and returns a plain value that will be serialised back to
// the agent as JSON.
type Handler func(ctx context.Context, g *Gateway, identity auth.Identity, args Args) (any, error)

// Services are the existing Help The Hive services a tool may reach.
//
// Listed one by one rather than behind a single object, so what Penny can touch
// is readable here instead of being a property of whatever some shared
// container happens to hold. A service missing from this struct is a service
// Penny cannot reach, and adding one is a deliberate line of code.
type Services struct {
	Users     UsersService
	Pantry    PantryService
	MealPlans MealPlansService
	Grocery   GroceryService
	Benefits  BenefitsService
	Store     Repository
}

// Gateway validates and executes tool calls.
type Gateway struct {
	services Services
	logger   *slog.Logger
	now      func() time.Time
	handlers map[string]Handler
	// Tools that exist in the registry but have no backend yet. Kept explicit
	// so that "Penny cannot do this" is a fact stated in one place, rather than
	// something a caller infers from a missing map entry.
	unavailable map[string]string
}

func NewGateway(services Services, logger *slog.Logger) *Gateway {
	g := &Gateway{
		services: services,
		logger:   logger,
		now:      time.Now,
	}
	g.handlers = handlers()
	g.unavailable = unavailable()
	return g
}

// ErrToolUnavailable is returned when a tool is real but its backend is not
// built. It is distinct from a denial, because the honest answer to the user is
// "I can't do that yet" rather than "I'm not allowed to".
var ErrToolUnavailable = errors.New("tool not available yet")

// Execute is the whole boundary, in order.
//
// Each step assumes the previous ones can be bypassed, which is why the
// identity used at the end is derived from the token at the start rather than
// carried through anything the model supplied.
func (g *Gateway) Execute(ctx context.Context, claims Claims, request domain.ToolRequest) domain.ToolResponse {
	started := g.now()

	// 1. The tool must exist and be in scope for this turn.
	tool, err := claims.Permits(request.Tool)
	if err != nil {
		g.record(ctx, claims, request.Tool, nil, db.ToolCallDenied, err.Error(), 0)
		return domain.ToolResponse{Tool: request.Tool, Error: err.Error(), Denied: true}
	}

	// 2. Arguments must be ones this tool declared. An unexpected argument is
	//    a disagreement between the model and the server about what this tool
	//    is, and guessing which of them is right is how a wrong write happens.
	if err := tool.ValidateArguments(request.Arguments); err != nil {
		g.record(ctx, claims, tool.Name, tool.Redact(request.Arguments), db.ToolCallDenied, err.Error(), 0)
		return domain.ToolResponse{Tool: tool.Name, Error: err.Error(), Denied: true}
	}

	redacted := tool.Redact(request.Arguments)

	// 3. High-impact writes never execute here. They come back as a proposal
	//    for the user to agree to, and are executed later by Confirm.
	if tool.NeedsConfirmation() {
		action := &domain.ProposedAction{
			ID:        db.NewID(),
			Tool:      tool.Name,
			Summary:   proposalSummary(tool, Args(request.Arguments)),
			Arguments: request.Arguments,
		}
		g.record(ctx, claims, tool.Name, redacted, db.ToolCallProposed, "", g.since(started))
		return domain.ToolResponse{Tool: tool.Name, Proposed: action}
	}

	// 4. Run it, as the authenticated user.
	result, err := g.run(ctx, tool, claims.Identity(), Args(request.Arguments))
	duration := g.since(started)
	if err != nil {
		outcome := db.ToolCallFailed
		if errors.Is(err, ErrToolUnavailable) {
			outcome = db.ToolCallDenied
		}
		g.record(ctx, claims, tool.Name, redacted, outcome, err.Error(), duration)
		return domain.ToolResponse{Tool: tool.Name, Error: err.Error()}
	}

	outcome := db.ToolCallExecuted
	if !tool.Mutates() {
		// Reads are recorded too, but at a level that will not drown the
		// interesting rows. Knowing Penny read the pantry matters far less than
		// knowing she wrote to it.
		outcome = db.ToolCallExecuted
	}
	g.record(ctx, claims, tool.Name, redacted, outcome, "", duration)
	return domain.ToolResponse{Tool: tool.Name, Result: result}
}

// Confirm executes an action the user agreed to.
//
// The arguments come from the stored proposal, not from the client, so what
// runs is what Penny described and what the user saw — not whatever a modified
// app sent back with the confirmation.
func (g *Gateway) Confirm(ctx context.Context, identity auth.Identity, turnID string, action domain.ProposedAction) (any, error) {
	tool, err := domain.Lookup(action.Tool)
	if err != nil {
		return nil, err
	}
	if !tool.NeedsConfirmation() {
		// Only proposals get confirmed. A path that will execute anything named
		// is a path worth abusing.
		return nil, fmt.Errorf("tool %s is not a confirmable action", action.Tool)
	}
	if err := tool.ValidateArguments(action.Arguments); err != nil {
		return nil, err
	}

	started := g.now()
	result, err := g.run(ctx, tool, identity, Args(action.Arguments))
	duration := g.since(started)

	call := db.PennyToolCall{
		UserID:    identity.Subject,
		TurnID:    turnID,
		Tool:      tool.Name,
		Arguments: tool.Redact(action.Arguments),
		Outcome:   db.ToolCallExecuted,
		Duration:  duration,
	}
	if err != nil {
		call.Outcome = db.ToolCallFailed
		call.Detail = err.Error()
	}
	g.write(ctx, call)
	return result, err
}

func (g *Gateway) run(ctx context.Context, tool domain.Tool, identity auth.Identity, args Args) (any, error) {
	if reason, ok := g.unavailable[tool.Name]; ok {
		return nil, fmt.Errorf("%w: %s", ErrToolUnavailable, reason)
	}
	handler, ok := g.handlers[tool.Name]
	if !ok {
		// The registry and the handler table disagree. There is a test that
		// makes this impossible to ship, so reaching it means something was
		// registered at runtime.
		return nil, fmt.Errorf("tool %s has no handler", tool.Name)
	}
	return handler(ctx, g, identity, args)
}

func (g *Gateway) since(started time.Time) time.Duration { return g.now().Sub(started) }

func (g *Gateway) record(ctx context.Context, claims Claims, tool string, args map[string]any, outcome, detail string, duration time.Duration) {
	conversationID := claims.Conversation()
	g.write(ctx, db.PennyToolCall{
		UserID:         claims.Identity().Subject,
		ConversationID: &conversationID,
		TurnID:         claims.Turn(),
		Tool:           tool,
		Arguments:      args,
		Outcome:        outcome,
		Detail:         detail,
		Duration:       duration,
	})
}

// write never fails a tool call. An audit row that could not be stored is a
// serious operational problem and a terrible reason to break a conversation
// that otherwise worked, so it is logged loudly and the turn continues.
func (g *Gateway) write(ctx context.Context, call db.PennyToolCall) {
	if g.services.Store == nil {
		return
	}
	if err := g.services.Store.RecordPennyToolCall(ctx, call); err != nil {
		g.logger.Error("penny: tool call not audited",
			"tool", call.Tool, "turn", call.TurnID, "outcome", call.Outcome, "error", err)
	}
}

// proposalSummary is the server's description of a pending action.
//
// Written here rather than taken from the model, because this sentence is what
// the user reads before agreeing to something. A model that can write its own
// confirmation prompt can write a misleading one.
func proposalSummary(tool domain.Tool, args Args) string {
	switch tool.Name {
	case "mealplan.generate":
		days := args.OptionalInt("days", 7)
		if budget := args.OptionalFloat("budget"); budget != nil {
			return fmt.Sprintf("Build a new %d-day meal plan with a budget of $%.2f. This replaces your current plan.", days, *budget)
		}
		return fmt.Sprintf("Build a new %d-day meal plan. This replaces your current plan.", days)
	case "grocery.create":
		return "Turn this meal plan into your grocery list."
	case "budget.set_weekly":
		if amount := args.OptionalFloat("amount"); amount != nil {
			return fmt.Sprintf("Set your weekly grocery budget to $%.2f.", *amount)
		}
		return "Change your weekly grocery budget."
	default:
		return fmt.Sprintf("Run %s.", tool.Name)
	}
}
