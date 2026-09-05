package pantry

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/helpthehive/server/internal/auth"
	"github.com/helpthehive/server/internal/db"
	"github.com/helpthehive/server/internal/modules/users"
)

type Service struct {
	store *db.Store
	users *users.Service
	now   func() time.Time
}

func NewService(store *db.Store, users *users.Service) *Service {
	return &Service{store: store, users: users, now: time.Now}
}

func (s *Service) List(ctx context.Context, identity auth.Identity, filter db.PantryFilter) ([]db.PantryItem, error) {
	viewer, err := s.users.Viewer(ctx, identity)
	if err != nil {
		return nil, err
	}
	return s.store.ListPantryItems(ctx, viewer.User.ID, filter)
}

func (s *Service) WasteStats(ctx context.Context, identity auth.Identity) (db.WasteStats, error) {
	items, err := s.List(ctx, identity, db.PantryFilter{})
	if err != nil {
		return db.WasteStats{}, err
	}
	return db.ComputeWasteStats(items, s.now()), nil
}

func (s *Service) Add(ctx context.Context, identity auth.Identity, params db.CreatePantryItemParams) (db.PantryItem, error) {
	viewer, err := s.users.Viewer(ctx, identity)
	if err != nil {
		return db.PantryItem{}, err
	}
	params.UserID = viewer.User.ID
	normalizeCreateParams(&params)
	if err := validateCreateParams(params); err != nil {
		return db.PantryItem{}, err
	}
	return s.store.CreatePantryItem(ctx, params)
}

func (s *Service) Update(ctx context.Context, identity auth.Identity, id string, patch db.PantryItemPatch) (db.PantryItem, error) {
	viewer, err := s.users.Viewer(ctx, identity)
	if err != nil {
		return db.PantryItem{}, err
	}
	id = strings.TrimSpace(id)
	if id == "" {
		return db.PantryItem{}, errors.New("pantry item id is required")
	}
	normalizePatch(&patch)
	if err := validatePatch(patch); err != nil {
		return db.PantryItem{}, err
	}
	item, err := s.store.UpdatePantryItem(ctx, viewer.User.ID, id, patch)
	if db.IsNotFound(err) {
		return db.PantryItem{}, errors.New("pantry item not found")
	}
	return item, err
}

func (s *Service) MarkUsed(ctx context.Context, identity auth.Identity, id string) (db.PantryItem, error) {
	viewer, err := s.users.Viewer(ctx, identity)
	if err != nil {
		return db.PantryItem{}, err
	}
	id = strings.TrimSpace(id)
	if id == "" {
		return db.PantryItem{}, errors.New("pantry item id is required")
	}
	item, err := s.store.MarkPantryItemUsed(ctx, viewer.User.ID, id)
	if db.IsNotFound(err) {
		return db.PantryItem{}, errors.New("pantry item not found")
	}
	return item, err
}

func (s *Service) Delete(ctx context.Context, identity auth.Identity, id string) (bool, error) {
	viewer, err := s.users.Viewer(ctx, identity)
	if err != nil {
		return false, err
	}
	id = strings.TrimSpace(id)
	if id == "" {
		return false, errors.New("pantry item id is required")
	}
	return s.store.DeletePantryItem(ctx, viewer.User.ID, id)
}

func normalizeCreateParams(params *db.CreatePantryItemParams) {
	params.Name = strings.TrimSpace(params.Name)
	params.Quantity = strings.TrimSpace(params.Quantity)
	params.Location = strings.TrimSpace(params.Location)
	params.Category = strings.TrimSpace(params.Category)
}

func validateCreateParams(params db.CreatePantryItemParams) error {
	if params.Name == "" {
		return errors.New("name is required")
	}
	if params.Quantity == "" {
		return errors.New("quantity is required")
	}
	if params.Category == "" {
		return errors.New("category is required")
	}
	if !validLocation(params.Location) {
		return errors.New("location is invalid")
	}
	if params.ExpirationDate.IsZero() {
		return errors.New("expiration date is required")
	}
	return nil
}

func normalizePatch(patch *db.PantryItemPatch) {
	trimStringPtr(&patch.Name)
	trimStringPtr(&patch.Quantity)
	trimStringPtr(&patch.Location)
	trimStringPtr(&patch.Category)
	trimStringPtr(&patch.Status)
}

func validatePatch(patch db.PantryItemPatch) error {
	if patch.Name != nil && *patch.Name == "" {
		return errors.New("name cannot be empty")
	}
	if patch.Quantity != nil && *patch.Quantity == "" {
		return errors.New("quantity cannot be empty")
	}
	if patch.Category != nil && *patch.Category == "" {
		return errors.New("category cannot be empty")
	}
	if patch.Location != nil && !validLocation(*patch.Location) {
		return errors.New("location is invalid")
	}
	if patch.Status != nil && !validStatus(*patch.Status) {
		return errors.New("status is invalid")
	}
	return nil
}

func validLocation(value string) bool {
	switch value {
	case "PANTRY", "REFRIGERATOR", "FREEZER":
		return true
	default:
		return false
	}
}

func validStatus(value string) bool {
	switch value {
	case "ACTIVE", "USED", "EXPIRED":
		return true
	default:
		return false
	}
}

func trimStringPtr(value **string) {
	if *value == nil {
		return
	}
	trimmed := strings.TrimSpace(**value)
	*value = &trimmed
}
