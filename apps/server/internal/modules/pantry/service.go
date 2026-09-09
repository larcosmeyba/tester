package pantry

import (
	"context"
	"log/slog"
	"strings"
	"time"

	"github.com/helpthehive/server/internal/apperrors"
	"github.com/helpthehive/server/internal/auth"
	"github.com/helpthehive/server/internal/db"
	"github.com/helpthehive/server/internal/domain/meals"
	"github.com/helpthehive/server/internal/modules/catalog"
	"github.com/helpthehive/server/internal/modules/users"
)

// IngredientResolver maps a free-text pantry name onto a canonical ingredient.
//
// Declared here rather than imported so this module states what it needs;
// *catalog.Service satisfies it. It is optional: with no resolver the pantry
// works exactly as it did, items simply stay unresolved and the meal generator
// does not count them.
type IngredientResolver interface {
	ResolveName(ctx context.Context, name string) (catalog.Resolution, error)
}

type Service struct {
	store    *db.Store
	users    *users.Service
	resolver IngredientResolver
	logger   *slog.Logger
	now      func() time.Time
}

func NewService(store *db.Store, users *users.Service) *Service {
	return &Service{store: store, users: users, logger: slog.Default(), now: time.Now}
}

// WithResolver turns on catalogue resolution for items added or renamed here.
func (s *Service) WithResolver(resolver IngredientResolver, logger *slog.Logger) *Service {
	if logger == nil {
		logger = slog.Default()
	}
	s.resolver = resolver
	s.logger = logger
	return s
}

// resolveName asks the catalogue which ingredient a name refers to.
//
// It never fails a write. A catalogue that cannot be read, or a name it does
// not recognise, leaves the item unresolved — the pantry still stores it and
// still shows it, and the only consequence is that the planner does not count
// it. Refusing to save someone's milk because the catalogue was unavailable
// would be the worse outcome by a distance.
func (s *Service) resolveName(ctx context.Context, name string) *string {
	if s.resolver == nil || strings.TrimSpace(name) == "" {
		return nil
	}
	resolution, err := s.resolver.ResolveName(ctx, name)
	if err != nil {
		s.logger.WarnContext(ctx, "pantry ingredient resolution unavailable", "error", err.Error())
		return nil
	}
	if !resolution.Resolved() {
		// Logged without the name: a pantry item is personal data.
		s.logger.DebugContext(ctx, "pantry item left unresolved", "outcome", string(resolution.Outcome))
		return nil
	}
	id := resolution.IngredientID
	return &id
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
	// Only fill it in when the caller did not already say which ingredient this
	// is. An explicit id from a picker is a user's own choice and outranks
	// anything inferred from the text.
	if params.IngredientID == nil {
		params.IngredientID = s.resolveName(ctx, params.Name)
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
		return db.PantryItem{}, apperrors.Public("pantry item id is required")
	}
	normalizePatch(&patch)
	if err := validatePatch(patch); err != nil {
		return db.PantryItem{}, err
	}
	// A rename means the item may now be a different ingredient — or no longer
	// a known one. Re-resolving keeps the link honest instead of leaving a
	// stale id pointing at whatever the name used to say.
	if patch.Name != nil && patch.IngredientID == nil {
		patch.IngredientID = s.resolveName(ctx, *patch.Name)
		patch.ClearIngredient = patch.IngredientID == nil
	}
	item, err := s.store.UpdatePantryItem(ctx, viewer.User.ID, id, patch)
	if db.IsNotFound(err) {
		return db.PantryItem{}, apperrors.Public("pantry item not found")
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
		return db.PantryItem{}, apperrors.Public("pantry item id is required")
	}
	item, err := s.store.MarkPantryItemUsed(ctx, viewer.User.ID, id)
	if db.IsNotFound(err) {
		return db.PantryItem{}, apperrors.Public("pantry item not found")
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
		return false, apperrors.Public("pantry item id is required")
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
		return apperrors.Public("name is required")
	}
	if params.Quantity == "" {
		return apperrors.Public("quantity is required")
	}
	if params.Category == "" {
		return apperrors.Public("category is required")
	}
	if !validLocation(params.Location) {
		return apperrors.Public("location is invalid")
	}
	if params.ExpirationDate.IsZero() {
		return apperrors.Public("expiration date is required")
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
		return apperrors.Public("name cannot be empty")
	}
	if patch.Quantity != nil && *patch.Quantity == "" {
		return apperrors.Public("quantity cannot be empty")
	}
	if patch.Category != nil && *patch.Category == "" {
		return apperrors.Public("category cannot be empty")
	}
	if patch.Location != nil && !validLocation(*patch.Location) {
		return apperrors.Public("location is invalid")
	}
	if patch.Status != nil && !validStatus(*patch.Status) {
		return apperrors.Public("status is invalid")
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

// IngredientIDs is what the meal generator reads: the canonical catalogue ids
// of everything the viewer currently has on hand, most urgent first.
//
// Items whose name has not been resolved to the catalogue are absent. They are
// never guessed at — matching an unknown pantry name to a catalogue entry is
// how somebody ends up with an allergen in their week — so an unresolved item
// stays in the pantry, visible, and simply does not take part in planning.
func (s *Service) IngredientIDs(ctx context.Context, identity auth.Identity) ([]string, error) {
	viewer, err := s.users.Viewer(ctx, identity)
	if err != nil {
		return nil, err
	}
	return s.store.ActivePantryIngredientIDs(ctx, viewer.User.ID)
}

// IngredientIDsForUser is the same read for a user id the caller has already
// resolved from a verified token.
func (s *Service) IngredientIDsForUser(ctx context.Context, userID string) ([]string, error) {
	return s.store.ActivePantryIngredientIDs(ctx, userID)
}

// HoldingsForUser is the quantity-aware read: what the user has, and how much,
// where they said. Rows sharing an ingredient are combined by the domain, which
// knows when two amounts add up and when the total cannot be known.
func (s *Service) HoldingsForUser(ctx context.Context, userID string) (map[string]meals.PantryHolding, error) {
	holdings, err := s.store.ActivePantryHoldings(ctx, userID)
	if err != nil {
		return nil, err
	}
	return meals.HoldingsByIngredient(holdings), nil
}
