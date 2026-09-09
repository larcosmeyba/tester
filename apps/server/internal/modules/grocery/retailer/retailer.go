// Package retailer is the seam between a Help The Hive grocery list and a shop
// that will sell it.
//
// It exists so that no retailer's name, product ids, credentials or quirks
// appear anywhere in the grocery module. The list is built first, entirely on
// Help The Hive's own terms — canonical ingredients, our own package rounding,
// our own estimates — and only then, optionally, offered to a retailer.
//
// That order matters. A list built to suit a retailer is a list that changes
// when the retailer does, and a user who cannot use that retailer gets a worse
// list for no reason. Everything about a plan, its costs and its shopping list
// works with no retailer configured at all; a handoff adds a checkout link and
// nothing else.
//
// Adding Instacart or Kroger means adding a Handoff implementation in its own
// package and naming it in main.go. It means changing nothing here, and nothing
// in grocery.
package retailer

import (
	"context"
	"errors"

	"github.com/helpthehive/server/internal/domain/meals"
)

// ErrNotConfigured is returned when no retailer is available. It is a normal
// state, not a fault: it is what every deployment does today.
var ErrNotConfigured = errors.New("no grocery retailer is configured")

// Cart is what a retailer gives back: somewhere to send the user, and an honest
// account of what it could not match.
//
// UnmatchedIngredientIDs is not an error case. A retailer that does not stock
// something is a fact the user is entitled to see before they leave the app,
// rather than a surprise at the checkout.
type Cart struct {
	Retailer               string
	ExternalCartID         string
	CheckoutURL            string
	UnmatchedIngredientIDs []string
}

// Handoff turns a finished grocery list into a cart at one retailer.
//
// The list arrives already consolidated, pantry-aware and priced. An
// implementation maps ingredients to that retailer's products and returns
// somewhere to send the user; it does not re-decide what is on the list.
type Handoff interface {
	// Name is the retailer's identifier, as it appears in configuration.
	Name() string
	// Prepare builds a cart from a consolidated list.
	Prepare(ctx context.Context, list meals.GroceryListResult) (Cart, error)
}

// Unconfigured is the default. It is what makes "no retailer" an ordinary,
// tested path rather than a nil check scattered through the grocery module.
type Unconfigured struct{}

func (Unconfigured) Name() string { return "none" }

func (Unconfigured) Prepare(context.Context, meals.GroceryListResult) (Cart, error) {
	return Cart{}, ErrNotConfigured
}
