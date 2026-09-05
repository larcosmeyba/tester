package users

import (
	"context"
	"errors"
	"regexp"
	"strings"
	"time"

	"github.com/helpthehive/server/internal/auth"
	"github.com/helpthehive/server/internal/db"
)

const HandleRenameCooldown = 30 * 24 * time.Hour

var handlePattern = regexp.MustCompile(`^[a-z][a-z0-9_]{2,29}$`)

var reservedHandles = map[string]struct{}{
	"admin": {}, "api": {}, "auth": {}, "support": {}, "help": {}, "settings": {},
	"user": {}, "users": {}, "profile": {}, "profiles": {}, "share": {}, "helpthehive": {},
}

type HandleReason string

const (
	HandleAvailable     HandleReason = "AVAILABLE"
	HandleCurrent       HandleReason = "CURRENT"
	HandleInvalidFormat HandleReason = "INVALID_FORMAT"
	HandleReserved      HandleReason = "RESERVED"
	HandleUnavailable   HandleReason = "UNAVAILABLE"
	HandleCooldown      HandleReason = "COOLDOWN"
)

type HandleAvailability struct {
	Handle     string
	Available  bool
	Reason     HandleReason
	RetryAfter *time.Time
}

type HandleError struct {
	Reason     HandleReason
	Handle     string
	RetryAfter *time.Time
}

func (e *HandleError) Error() string {
	switch e.Reason {
	case HandleInvalidFormat:
		return "handle must start with a letter and contain 3 to 30 lowercase letters, numbers, or underscores"
	case HandleReserved:
		return "handle is reserved"
	case HandleUnavailable:
		return "handle is unavailable"
	case HandleCooldown:
		return "handle can only be changed once every 30 days"
	default:
		return "unable to update handle"
	}
}

type Service struct {
	store *db.Store
}

func NewService(store *db.Store) *Service {
	return &Service{store: store}
}

func (s *Service) Viewer(ctx context.Context, identity auth.Identity) (db.Viewer, error) {
	if identity.Subject == "" {
		return db.Viewer{}, errors.New("auth subject is required")
	}
	return s.store.EnsureViewer(ctx, identity.Subject, optionalEmail(identity.Email))
}

func (s *Service) UpdateProfile(ctx context.Context, identity auth.Identity, patch db.ProfilePatch) (db.Profile, error) {
	trimProfilePatch(&patch)
	if err := validateProfilePatch(patch); err != nil {
		return db.Profile{}, err
	}
	viewer, err := s.Viewer(ctx, identity)
	if err != nil {
		return db.Profile{}, err
	}
	return s.store.UpdateProfile(ctx, viewer.User.ID, patch)
}

func (s *Service) DeleteViewer(ctx context.Context, identity auth.Identity) (bool, error) {
	viewer, err := s.Viewer(ctx, identity)
	if err != nil {
		return false, err
	}
	return s.store.DeleteUser(ctx, viewer.User.ID)
}

func (s *Service) UpdatePreferences(ctx context.Context, identity auth.Identity, patch db.PreferencesPatch) (db.Preferences, error) {
	viewer, err := s.Viewer(ctx, identity)
	if err != nil {
		return db.Preferences{}, err
	}
	trimPreferencesPatch(&patch)
	return s.store.UpdatePreferences(ctx, viewer.User.ID, patch)
}

func (s *Service) HandleAvailability(ctx context.Context, identity auth.Identity, candidate string) (HandleAvailability, error) {
	handle, reason := normalizeAndValidateHandle(candidate)
	if reason != HandleAvailable {
		return HandleAvailability{Handle: handle, Reason: reason}, nil
	}
	viewer, err := s.Viewer(ctx, identity)
	if err != nil {
		return HandleAvailability{}, err
	}
	existing, err := s.store.FindHandle(ctx, handle)
	if err != nil {
		return HandleAvailability{}, err
	}
	if existing != nil {
		if existing.UserID == viewer.User.ID && existing.IsCurrent {
			return HandleAvailability{Handle: handle, Available: true, Reason: HandleCurrent}, nil
		}
		return HandleAvailability{Handle: handle, Reason: HandleUnavailable}, nil
	}
	current, err := s.store.CurrentHandle(ctx, viewer.User.ID)
	if err != nil {
		return HandleAvailability{}, err
	}
	if current != nil {
		retryAfter := current.CreatedAt.Add(HandleRenameCooldown)
		if time.Now().Before(retryAfter) {
			return HandleAvailability{Handle: handle, Reason: HandleCooldown, RetryAfter: &retryAfter}, nil
		}
	}
	return HandleAvailability{Handle: handle, Available: true, Reason: HandleAvailable}, nil
}

func (s *Service) UpdateHandle(ctx context.Context, identity auth.Identity, candidate string) (db.Profile, error) {
	handle, reason := normalizeAndValidateHandle(candidate)
	if reason != HandleAvailable {
		return db.Profile{}, &HandleError{Reason: reason, Handle: handle}
	}
	viewer, err := s.Viewer(ctx, identity)
	if err != nil {
		return db.Profile{}, err
	}
	profile, err := s.store.UpdateHandle(ctx, viewer.User.ID, handle, HandleRenameCooldown)
	if errors.Is(err, db.ErrHandleUnavailable) {
		return db.Profile{}, &HandleError{Reason: HandleUnavailable, Handle: handle}
	}
	var cooldown *db.HandleCooldownError
	if errors.As(err, &cooldown) {
		return db.Profile{}, &HandleError{Reason: HandleCooldown, Handle: handle, RetryAfter: &cooldown.RetryAfter}
	}
	return profile, err
}

func (s *Service) CompleteOnboarding(ctx context.Context, identity auth.Identity, profile db.ProfilePatch, preferences db.PreferencesPatch, hasProfile bool, hasPreferences bool) (db.Viewer, error) {
	viewer, err := s.Viewer(ctx, identity)
	if err != nil {
		return db.Viewer{}, err
	}
	if hasProfile {
		trimProfilePatch(&profile)
		if err := validateProfilePatch(profile); err != nil {
			return db.Viewer{}, err
		}
		if _, err := s.store.UpdateProfile(ctx, viewer.User.ID, profile); err != nil {
			return db.Viewer{}, err
		}
	}
	if hasPreferences {
		trimPreferencesPatch(&preferences)
		if _, err := s.store.UpdatePreferences(ctx, viewer.User.ID, preferences); err != nil {
			return db.Viewer{}, err
		}
	}
	if _, err := s.store.CompleteOnboarding(ctx, viewer.User.ID); err != nil {
		return db.Viewer{}, err
	}
	return s.Viewer(ctx, identity)
}

func (s *Service) RegisterPushToken(ctx context.Context, identity auth.Identity, token string, platform string, deviceID *string) (db.PushToken, error) {
	token = strings.TrimSpace(token)
	if token == "" {
		return db.PushToken{}, errors.New("push token is required")
	}
	if deviceID != nil {
		trimmed := strings.TrimSpace(*deviceID)
		deviceID = &trimmed
	}
	viewer, err := s.Viewer(ctx, identity)
	if err != nil {
		return db.PushToken{}, err
	}
	return s.store.UpsertPushToken(ctx, viewer.User.ID, token, platform, deviceID)
}

func (s *Service) DeletePushToken(ctx context.Context, identity auth.Identity, token string) (bool, error) {
	token = strings.TrimSpace(token)
	if token == "" {
		return false, errors.New("push token is required")
	}
	viewer, err := s.Viewer(ctx, identity)
	if err != nil {
		return false, err
	}
	return s.store.DeletePushToken(ctx, viewer.User.ID, token)
}

func optionalEmail(email string) *string {
	trimmed := strings.TrimSpace(email)
	if trimmed == "" {
		return nil
	}
	return &trimmed
}

func normalizeAndValidateHandle(candidate string) (string, HandleReason) {
	handle := strings.ToLower(strings.TrimSpace(candidate))
	if !handlePattern.MatchString(handle) {
		return handle, HandleInvalidFormat
	}
	if _, reserved := reservedHandles[handle]; reserved {
		return handle, HandleReserved
	}
	return handle, HandleAvailable
}

func trimProfilePatch(patch *db.ProfilePatch) {
	trimStringPtr(&patch.FirstName)
	trimStringPtr(&patch.LastName)
	trimStringPtr(&patch.Phone)
	trimStringPtr(&patch.Zip)
	trimStringPtr(&patch.ProfileImageURI)
}

func validateProfilePatch(patch db.ProfilePatch) error {
	if patch.FirstName != nil && *patch.FirstName == "" {
		return errors.New("first name is required")
	}
	if patch.LastName != nil && *patch.LastName == "" {
		return errors.New("last name is required")
	}
	if patch.HouseholdSize != nil && *patch.HouseholdSize <= 0 {
		return errors.New("household size must be greater than zero")
	}
	return nil
}

func trimPreferencesPatch(patch *db.PreferencesPatch) {
	trimStringPtr(&patch.WeeklyBudget)
	trimStringSlice(patch.PreferredFinanceTopics)
	trimStringSlice(patch.PreferredResources)
}

func trimStringPtr(value **string) {
	if *value == nil {
		return
	}
	trimmed := strings.TrimSpace(**value)
	*value = &trimmed
}

func trimStringSlice(values []string) {
	for index := range values {
		values[index] = strings.TrimSpace(values[index])
	}
}
