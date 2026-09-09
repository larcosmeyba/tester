package meals

import "time"

// MealProfile is the user's standing answers to the meal questionnaire.
//
// It exists so a returning user is not re-interrogated every week, and so the
// rest of the product can read what they have already said. It is *not* what a
// plan is generated from: a plan is always built from an explicit PlanRequest,
// snapshotted with it, so a plan stays reproducible even after the profile
// changes underneath it.
//
// The one thing that makes this safe is ApplyTo: the profile only ever fills
// in what a request left unsaid. A client that states an answer keeps it, and
// a client that states none inherits the user's own.
type MealProfile struct {
	UserID    string
	Household Household
	Budget    Budget
	Meals     MealCounts
	Days      int
	Diets     []DietRequirement
	Allergies []AllergyRequirement
	// Canonical ingredient ids for allergies the user named themselves.
	AllergyIngredients []string
	NutritionGoals     []NutritionPreference
	Likes              FoodPreferences
	Dislikes           FoodPreferences
	CookingTime        CookingTime
	Equipment          []string
	CookingStyle       []string
	Leftovers          string
	DietaryOtherText   *string
	CreatedAt          time.Time
	UpdatedAt          time.Time
}

// ApplyTo fills in a request from the saved profile, and returns it.
//
// Every rule here is "only when the client said nothing". A partially answered
// questionnaire is completed from the profile; a fully answered one is
// untouched. Nothing the client *did* say is ever overridden — including
// saying "no allergies", which is why the allergy and diet lists are only
// filled when the request omitted the field entirely.
//
// Safety is not weakened by this: filling in a stored allergy can only narrow
// what may be planned, and the server re-validates the result either way.
func (p MealProfile) ApplyTo(request PlanRequest) PlanRequest {
	if request.Household.Size <= 0 {
		request.Household = p.Household
	}
	if request.Days <= 0 {
		request.Days = p.Days
	}
	if request.Meals.Total() == 0 {
		request.Meals = p.Meals
	}
	if !request.Budget.Enabled() && p.Budget.Enabled() {
		request.Budget = p.Budget
	}
	if request.Budget.Currency == "" {
		request.Budget.Currency = p.Budget.Currency
	}
	if request.Budget.Mode == "" {
		request.Budget.Mode = p.Budget.Mode
	}
	if request.DietaryRequirements == nil {
		request.DietaryRequirements = p.Diets
	}
	if request.Allergies == nil {
		request.Allergies = p.Allergies
	}
	if request.AllergyIngredients == nil {
		request.AllergyIngredients = p.AllergyIngredients
	}
	if request.NutritionPreferences == nil {
		request.NutritionPreferences = p.NutritionGoals
	}
	if request.Likes.Ingredients == nil && request.Likes.Cuisines == nil {
		request.Likes = p.Likes
	}
	if request.Dislikes.Ingredients == nil && request.Dislikes.Cuisines == nil {
		request.Dislikes = p.Dislikes
	}
	if request.CookingTime.MaxMinutes == nil {
		request.CookingTime = p.CookingTime
	}
	if request.Equipment == nil {
		request.Equipment = p.Equipment
	}
	if request.CookingStyle == nil {
		request.CookingStyle = p.CookingStyle
	}
	if request.Leftovers == "" {
		request.Leftovers = p.Leftovers
	}
	if request.DietaryOtherText == nil {
		request.DietaryOtherText = p.DietaryOtherText
	}
	return request
}

// Preference kinds and targets, as stored.
const (
	PreferenceLike    = "like"
	PreferenceDislike = "dislike"

	PreferenceIngredient = "ingredient"
	PreferenceCuisine    = "cuisine"
)

// ValidateProfile applies the same bounds a request is held to, so a profile
// can never store an answer that would be rejected the moment it was used.
//
// It is deliberately the same vocabulary check: an allergy that is not
// `required` is rejected here exactly as it is on a request, rather than being
// stored and quietly downgraded later.
func (p MealProfile) Validate() error {
	request := p.ApplyTo(PlanRequest{})
	request.Normalize()
	// A profile may legitimately have no meals chosen yet — that is an
	// unfinished questionnaire, not an invalid one — so the request-level
	// "choose at least one meal" rule is satisfied here before validating the
	// rest of it.
	if request.Meals.Total() == 0 {
		request.Meals = MealCounts{Dinner: 1}
		if request.Days < MinPlanDays {
			request.Days = MinPlanDays
		}
	}
	if request.Household.Size == 0 {
		request.Household.Size = MinHouseholdSize
	}
	if request.Days == 0 {
		request.Days = MinPlanDays
	}
	return request.Validate()
}
