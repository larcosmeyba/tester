package serverhttp

import (
	"context"

	"github.com/helpthehive/server/internal/db"
)

type StoreReadiness struct {
	Store *db.Store
}

func (s StoreReadiness) Ping(ctx context.Context) error {
	return s.Store.Ping(ctx)
}
