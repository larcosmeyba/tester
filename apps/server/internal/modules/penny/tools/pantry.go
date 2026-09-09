package tools

import (
	"context"
	"fmt"
	"sort"
	"time"

	"github.com/helpthehive/server/internal/auth"
	"github.com/helpthehive/server/internal/db"
)

type pantryItemView struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	Quantity string `json:"quantity"`
	Location string `json:"location"`
	Expires  string `json:"expires,omitempty"`
	Category string `json:"category,omitempty"`
	// Negative when the item is already past its date. Penny reads better prose
	// off a number than off two dates she has to subtract.
	DaysLeft int `json:"days_left"`
}

const (
	locationPantry = "PANTRY"
	locationFridge = "REFRIGERATOR"
	locationFreeze = "FREEZER"
)

func listPantry(ctx context.Context, g *Gateway, identity auth.Identity, args Args) (any, error) {
	filter := db.PantryFilter{}
	active := "ACTIVE"
	filter.Status = &active

	if args.Has("location") {
		location, err := args.Enum("location", locationPantry, locationFridge, locationFreeze)
		if err != nil {
			return nil, err
		}
		filter.Location = &location
	}

	items, err := g.services.Pantry.List(ctx, identity, filter)
	if err != nil {
		return nil, err
	}
	return pantryViews(items, g.now()), nil
}

func expiringPantry(ctx context.Context, g *Gateway, identity auth.Identity, args Args) (any, error) {
	within := args.OptionalInt("within_days", 7)
	if within < 0 || within > 90 {
		return nil, fmt.Errorf("within_days must be between 0 and 90")
	}

	active := "ACTIVE"
	items, err := g.services.Pantry.List(ctx, identity, db.PantryFilter{Status: &active})
	if err != nil {
		return nil, err
	}

	now := g.now()
	cutoff := now.AddDate(0, 0, within)
	soon := make([]db.PantryItem, 0, len(items))
	for _, item := range items {
		if !item.ExpirationDate.After(cutoff) {
			soon = append(soon, item)
		}
	}
	sort.Slice(soon, func(i, j int) bool {
		return soon[i].ExpirationDate.Before(soon[j].ExpirationDate)
	})
	return pantryViews(soon, now), nil
}

func addPantryItem(ctx context.Context, g *Gateway, identity auth.Identity, args Args) (any, error) {
	name, err := args.String("name")
	if err != nil {
		return nil, err
	}
	quantity, err := args.String("quantity")
	if err != nil {
		return nil, err
	}
	location, err := args.Enum("location", locationPantry, locationFridge, locationFreeze)
	if err != nil {
		return nil, err
	}

	// A missing expiry date is filled with a conservative default rather than
	// refused, because a user telling Penny "I bought milk" should not have to
	// answer a follow-up question about dates to get it recorded. The default
	// is short so the item surfaces as expiring rather than sitting silently.
	expires := g.now().AddDate(0, 0, defaultShelfLifeDays(location))
	if args.Has("expiration_date") {
		if expires, err = args.Date("expiration_date"); err != nil {
			return nil, err
		}
	}

	item, err := g.services.Pantry.Add(ctx, identity, db.CreatePantryItemParams{
		Name:           name,
		Quantity:       quantity,
		Location:       location,
		ExpirationDate: expires,
		Category:       args.OptionalString("category", "Other"),
	})
	if err != nil {
		return nil, err
	}
	return pantryView(item, g.now()), nil
}

func updatePantryItem(ctx context.Context, g *Gateway, identity auth.Identity, args Args) (any, error) {
	id, err := args.String("item_id")
	if err != nil {
		return nil, err
	}

	patch := db.PantryItemPatch{}
	if args.Has("name") {
		name, err := args.String("name")
		if err != nil {
			return nil, err
		}
		patch.Name = &name
	}
	if args.Has("quantity") {
		quantity, err := args.String("quantity")
		if err != nil {
			return nil, err
		}
		patch.Quantity = &quantity
	}
	if args.Has("location") {
		location, err := args.Enum("location", locationPantry, locationFridge, locationFreeze)
		if err != nil {
			return nil, err
		}
		patch.Location = &location
	}
	if args.Has("expiration_date") {
		expires, err := args.Date("expiration_date")
		if err != nil {
			return nil, err
		}
		patch.ExpirationDate = &expires
	}
	if args.Has("category") {
		category, err := args.String("category")
		if err != nil {
			return nil, err
		}
		patch.Category = &category
	}

	// The service resolves the item against the authenticated user, so an id
	// belonging to somebody else is a not-found rather than a write.
	item, err := g.services.Pantry.Update(ctx, identity, id, patch)
	if err != nil {
		return nil, err
	}
	return pantryView(item, g.now()), nil
}

func markPantryItemUsed(ctx context.Context, g *Gateway, identity auth.Identity, args Args) (any, error) {
	id, err := args.String("item_id")
	if err != nil {
		return nil, err
	}
	item, err := g.services.Pantry.MarkUsed(ctx, identity, id)
	if err != nil {
		return nil, err
	}
	return pantryView(item, g.now()), nil
}

func pantryViews(items []db.PantryItem, now time.Time) []pantryItemView {
	out := make([]pantryItemView, 0, len(items))
	for _, item := range items {
		out = append(out, pantryView(item, now))
	}
	return out
}

func pantryView(item db.PantryItem, now time.Time) pantryItemView {
	return pantryItemView{
		ID:       item.ID,
		Name:     item.Name,
		Quantity: item.Quantity,
		Location: item.Location,
		Expires:  item.ExpirationDate.Format("2006-01-02"),
		Category: item.Category,
		DaysLeft: int(item.ExpirationDate.Sub(now).Hours() / 24),
	}
}

// defaultShelfLifeDays is a placeholder, not a claim about food safety. It only
// decides when an item nags the user, and the user can change the date.
func defaultShelfLifeDays(location string) int {
	switch location {
	case locationFreeze:
		return 90
	case locationFridge:
		return 7
	default:
		return 30
	}
}
