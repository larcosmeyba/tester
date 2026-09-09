package penny

import (
	"context"
	"errors"
	"time"
)

// Rate limiting, because Penny costs money per turn and a loop costs money per
// second.
//
// The limits are per user and enforced against the database rather than an
// in-process counter. That is slower and it is correct across more than one
// server, which is the deployment this runs in. A counter in memory limits a
// user to N turns per replica, which is not a limit.

var ErrRateLimited = errors.New("rate limited")

type Limits struct {
	// Turns a user may take per window.
	TurnsPerHour int
	// Tool calls a user may make per window, across all turns. This is the one
	// that matters for a model stuck in a loop: it runs out of tool budget long
	// before it runs out of turns.
	ToolCallsPerHour int
	Window           time.Duration
}

func DefaultLimits() Limits {
	return Limits{
		TurnsPerHour:     60,
		ToolCallsPerHour: 300,
		Window:           time.Hour,
	}
}

type limitCounter interface {
	CountPennyMessagesSince(ctx context.Context, userID string, since time.Time) (int, error)
	CountPennyToolCalls(ctx context.Context, userID string, since time.Time) (int, error)
}

type Limiter struct {
	limits  Limits
	counter limitCounter
	now     func() time.Time
}

func NewLimiter(limits Limits, counter limitCounter) *Limiter {
	return &Limiter{limits: limits, counter: counter, now: time.Now}
}

// AllowTurn checks both budgets before a turn starts.
//
// A user who is over their tool budget is stopped here rather than partway
// through, because a turn that dies after three tool calls has already spent
// the money and produced nothing.
func (l *Limiter) AllowTurn(ctx context.Context, userID string) error {
	since := l.now().Add(-l.limits.Window)

	turns, err := l.counter.CountPennyMessagesSince(ctx, userID, since)
	if err != nil {
		// A limiter that cannot read its counter fails open. The alternative is
		// that a database hiccup takes Penny down for everybody, which is a
		// worse outcome than an hour of unmetered use by one account — and the
		// audit log still records every call.
		return nil
	}
	if turns >= l.limits.TurnsPerHour {
		return ErrRateLimited
	}

	calls, err := l.counter.CountPennyToolCalls(ctx, userID, since)
	if err != nil {
		return nil
	}
	if calls >= l.limits.ToolCallsPerHour {
		return ErrRateLimited
	}
	return nil
}
