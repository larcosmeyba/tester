// Package mealprofile owns the user's standing answers to the meal
// questionnaire: household, dietary requirements, allergies, dislikes, budget,
// meals needed, cooking time, leftovers and nutrition goals.
//
// It exists because those answers used to live only inside each plan's request
// snapshot. A returning user was re-interrogated every week, the budget
// collected at onboarding never reached the planner, and nothing else in the
// product could read what somebody had already said.
//
// The profile fills in a request; it never overrides one. A client that states
// an answer keeps it — including "no allergies" — and the server validates the
// result either way, so nothing here can weaken a safety filter.
package mealprofile

import (
	"context"
	"errors"

	"github.com/helpthehive/server/internal/auth"
	"github.com/helpthehive/server/internal/db"
	"github.com/helpthehive/server/internal/domain/meals"
	"github.com/helpthehive/server/internal/modules/users"
)

// Repository is what this module needs from the database. It is declared here
// rather than imported so the module states its own requirements; *db.Store
// satisfies it.
type Repository interface {
	GetMealProfile(ctx context.Context, userID string) (meals.MealProfile, error)
	SaveMealProfile(ctx context.Context, profile meals.MealProfile) (meals.MealProfile, error)
}

// Service resolves the viewer from the verified token on every call. No method
// accepts a user id from the caller.
type Service struct {
	repo  Repository
	users *users.Service
}

func NewService(repo Repository, usersService *users.Service) *Service {
	return &Service{repo: repo, users: usersService}
}

func (s *Service) userID(ctx context.Context, identity auth.Identity) (string, error) {
	viewer, err := s.users.Viewer(ctx, identity)
	if err != nil {
		return "", err
	}
	return viewer.User.ID, nil
}

// Get returns the viewer's saved answers, or nil when they have never answered.
// Having no profile is a normal state, not an error: it is what an unfinished
// questionnaire looks like.
func (s *Service) Get(ctx context.Context, identity auth.Identity) (*meals.MealProfile, error) {
	userID, err := s.userID(ctx, identity)
	if err != nil {
		return nil, err
	}
	return s.ForUser(ctx, userID)
}

// ForUser is the same read, for a user id the caller has already resolved from
// a verified token. The meal plan module uses it to complete a request.
func (s *Service) ForUser(ctx context.Context, userID string) (*meals.MealProfile, error) {
	profile, err := s.repo.GetMealProfile(ctx, userID)
	if db.IsNotFound(err) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &profile, nil
}

// Save replaces the viewer's answers.
//
// It is a whole-profile write: a questionnaire is the user's current answer,
// and merging would make removing an allergy or a dislike impossible. The
// profile is held to exactly the bounds a request is held to, so an answer
// that would be rejected at generation time is rejected here instead — where
// the user can still see the form they typed it into.
func (s *Service) Save(ctx context.Context, identity auth.Identity, profile meals.MealProfile) (meals.MealProfile, error) {
	userID, err := s.userID(ctx, identity)
	if err != nil {
		return meals.MealProfile{}, err
	}
	profile.UserID = userID

	normalize(&profile)
	if err := profile.Validate(); err != nil {
		return meals.MealProfile{}, err
	}
	return s.repo.SaveMealProfile(ctx, profile)
}

// normalize trims and deduplicates the lists, and applies the derived values a
// client is not trusted to compute.
func normalize(profile *meals.MealProfile) {
	if profile.Budget.Currency == "" {
		profile.Budget.Currency = "USD"
	}
	if profile.Budget.Mode == "" {
		profile.Budget.Mode = "balanced"
	}
	if profile.Leftovers == "" {
		profile.Leftovers = "sometimes"
	}
	if profile.CookingTime.Strength == "" {
		profile.CookingTime.Strength = meals.StrengthPreferred
	}
	if profile.Days <= 0 {
		profile.Days = meals.MaxPlanDays
	}
	if profile.Household.Size <= 0 {
		profile.Household.Size = meals.MinHouseholdSize
	}

	profile.AllergyIngredients = meals.Dedupe(profile.AllergyIngredients)
	profile.Likes.Ingredients = meals.Dedupe(profile.Likes.Ingredients)
	profile.Likes.Cuisines = meals.Dedupe(profile.Likes.Cuisines)
	profile.Dislikes.Ingredients = meals.Dedupe(profile.Dislikes.Ingredients)
	profile.Dislikes.Cuisines = meals.Dedupe(profile.Dislikes.Cuisines)
	profile.Equipment = meals.Dedupe(profile.Equipment)
	profile.CookingStyle = meals.Dedupe(profile.CookingStyle)

	// An allergy is never a preference. Anything else is rejected by Validate
	// rather than downgraded here, so a client bug cannot silently weaken a
	// safety filter — but a blank strength is the client saying nothing, and
	// the only thing an allergy can mean is required.
	for i := range profile.Allergies {
		if profile.Allergies[i].Strength == "" {
			profile.Allergies[i].Strength = meals.StrengthRequired
		}
	}
	for i := range profile.Diets {
		if profile.Diets[i].Strength == "" {
			profile.Diets[i].Strength = meals.StrengthRequired
		}
	}
	for i := range profile.NutritionGoals {
		if profile.NutritionGoals[i].Strength == "" {
			profile.NutritionGoals[i].Strength = meals.StrengthPreferred
		}
	}
}

// ErrNoProfile is returned when an operation needs answers the user has never
// given. Callers that can proceed without them should use ForUser instead.
var ErrNoProfile = errors.New("no meal profile has been saved yet")
