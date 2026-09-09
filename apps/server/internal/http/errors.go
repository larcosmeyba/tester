package serverhttp

import (
	"context"
	"errors"
	"log/slog"

	"github.com/99designs/gqlgen/graphql"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/helpthehive/server/internal/apperrors"
	"github.com/vektah/gqlparser/v2/gqlerror"
)

// newErrorPresenter returns a gqlgen error presenter that never leaks internal
// details to clients. Errors explicitly marked safe (apperrors.PublicError, or
// *gqlerror.Error values that resolvers construct with curated messages) are
// returned as-is; everything else is logged server-side with the request ID
// and replaced with a generic message.
func newErrorPresenter(logger *slog.Logger) graphql.ErrorPresenterFunc {
	if logger == nil {
		logger = slog.Default()
	}
	return func(ctx context.Context, err error) *gqlerror.Error {
		var pub *apperrors.PublicError
		if errors.As(err, &pub) {
			var ext map[string]any
			if pub.Code() != "" {
				ext = map[string]any{"code": pub.Code()}
			}
			return &gqlerror.Error{Message: pub.Error(), Extensions: ext}
		}

		var gqlErr *gqlerror.Error
		if errors.As(err, &gqlErr) {
			// Constructed explicitly by a resolver with a curated message.
			return gqlErr
		}

		logger.ErrorContext(ctx, "graphql internal error",
			"error", err,
			"request_id", middleware.GetReqID(ctx),
		)
		return &gqlerror.Error{
			Message:    "internal server error",
			Extensions: map[string]any{"code": "INTERNAL_ERROR"},
		}
	}
}
