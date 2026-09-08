package graphql

import (
	"errors"

	"github.com/helpthehive/server/internal/modules/meals"
	"github.com/vektah/gqlparser/v2/gqlerror"
)

// mealError turns a service error into something safe to send a client.
//
// Anything the viewer may not see is reported as NOT_FOUND, never as
// FORBIDDEN: telling somebody that a plan exists but is not theirs is itself a
// disclosure. Every other error keeps the service's own message, which is
// written to be safe to display and never echoes stored data.
func mealError(err error) error {
	if err == nil {
		return nil
	}
	if errors.Is(err, meals.ErrNotFound) {
		return &gqlerror.Error{
			Message:    "not found",
			Extensions: map[string]any{"code": "NOT_FOUND"},
		}
	}
	return err
}
