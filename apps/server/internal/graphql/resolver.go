package graphql

import (
	"time"

	"github.com/helpthehive/server/internal/modules/meals"
	"github.com/helpthehive/server/internal/modules/pantry"
	"github.com/helpthehive/server/internal/modules/users"
)

type Resolver struct {
	Users  *users.Service
	Pantry *pantry.Service
	Meals  *meals.Service
	Now    func() time.Time
}

func NewResolver(usersService *users.Service, pantryService *pantry.Service, mealsService *meals.Service) *Resolver {
	return &Resolver{
		Users:  usersService,
		Pantry: pantryService,
		Meals:  mealsService,
		Now:    time.Now,
	}
}
