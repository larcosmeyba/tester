package graphql

import (
	"time"

	"github.com/helpthehive/server/internal/modules/pantry"
	"github.com/helpthehive/server/internal/modules/users"
)

type Resolver struct {
	Users  *users.Service
	Pantry *pantry.Service
	Now    func() time.Time
}

func NewResolver(usersService *users.Service, pantryService *pantry.Service) *Resolver {
	return &Resolver{
		Users:  usersService,
		Pantry: pantryService,
		Now:    time.Now,
	}
}
