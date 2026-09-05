package auth

import (
	"context"
	"errors"
)

type Identity struct {
	Subject       string
	Email         string
	EmailVerified bool
}

type identityContextKey struct{}

func ContextWithIdentity(ctx context.Context, identity Identity) context.Context {
	return context.WithValue(ctx, identityContextKey{}, identity)
}

func IdentityFromContext(ctx context.Context) (Identity, bool) {
	identity, ok := ctx.Value(identityContextKey{}).(Identity)
	return identity, ok
}

func RequireIdentity(ctx context.Context) (Identity, error) {
	identity, ok := IdentityFromContext(ctx)
	if !ok || identity.Subject == "" {
		return Identity{}, errors.New("authentication required")
	}
	return identity, nil
}
