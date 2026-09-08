package graphql

import (
	"errors"

	domain "github.com/helpthehive/server/internal/domain/benefits"
	"github.com/vektah/gqlparser/v2/gqlerror"
)

// benefitsError turns a service error into something safe to send a client.
//
// Anything the viewer may not see is reported as NOT_FOUND, never as FORBIDDEN:
// telling somebody that another person's benefits application exists is itself
// a disclosure. The remaining errors carry messages written to be shown to an
// applicant, and none of them echo a stored answer.
func benefitsError(err error) error {
	if err == nil {
		return nil
	}
	switch {
	case errors.Is(err, domain.ErrNotFound):
		return &gqlerror.Error{
			Message:    "not found",
			Extensions: map[string]any{"code": "NOT_FOUND"},
		}
	case errors.Is(err, domain.ErrNotReady):
		return &gqlerror.Error{
			Message:    "this application still has required answers missing, so it cannot be approved yet",
			Extensions: map[string]any{"code": "NOT_READY"},
		}
	case errors.Is(err, domain.ErrAlreadyApproved):
		return &gqlerror.Error{
			Message:    "this application has already been approved",
			Extensions: map[string]any{"code": "ALREADY_APPROVED"},
		}
	case errors.Is(err, domain.ErrUnknownFieldPath), errors.Is(err, domain.ErrDerivedFieldPath), errors.Is(err, domain.ErrInvalidValue):
		return &gqlerror.Error{
			Message:    err.Error(),
			Extensions: map[string]any{"code": "INVALID_ANSWER"},
		}
	}
	return err
}
