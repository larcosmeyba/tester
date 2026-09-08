package meals

import (
	"strconv"
	"testing"
)

// baseRequest is the smallest request that passes Validate: everything else
// here changes one field of it and asserts the reason it is rejected.
func baseRequest() PlanRequest {
	request := PlanRequest{
		QuestionnaireVersion: "1.0",
		Household:            Household{Size: 4},
		Meals:                MealCounts{Dinner: 2},
		Days:                 2,
		Equipment:            []string{"stovetop", "oven", "microwave"},
		Leftovers:            "sometimes",
	}
	request.Normalize()
	return request
}

func TestValidateAcceptsAWellFormedRequest(t *testing.T) {
	request := baseRequest()
	if err := request.Validate(); err != nil {
		t.Fatalf("Validate() error = %v", err)
	}
}

func TestValidateRejectsAnAllergyThatIsNotRequired(t *testing.T) {
	request := baseRequest()
	request.Allergies = []AllergyRequirement{{Allergen: "peanut", Strength: StrengthPreferred}}

	// An allergy is never a preference. It is rejected outright rather than
	// silently upgraded, so a client bug cannot weaken a safety filter unnoticed.
	if err := request.Validate(); err == nil {
		t.Fatal("expected a preferred allergy to be rejected")
	}
}

func TestValidateRejectsUnknownVocabulary(t *testing.T) {
	cases := map[string]func(*PlanRequest){
		"diet": func(r *PlanRequest) {
			r.DietaryRequirements = []DietRequirement{{Diet: "carnivore", Strength: StrengthRequired}}
		},
		"allergen": func(r *PlanRequest) {
			r.Allergies = []AllergyRequirement{{Allergen: "kiwi", Strength: StrengthRequired}}
		},
		"equipment":     func(r *PlanRequest) { r.Equipment = []string{"sous_vide"} },
		"cooking style": func(r *PlanRequest) { r.CookingStyle = []string{"gourmet"} },
		"leftovers":     func(r *PlanRequest) { r.Leftovers = "maybe" },
		"budget mode":   func(r *PlanRequest) { r.Budget.Mode = "cheapest" },
	}
	for name, mutate := range cases {
		request := baseRequest()
		mutate(&request)
		if err := request.Validate(); err == nil {
			t.Fatalf("expected an invalid %s to be rejected", name)
		}
	}
}

func TestValidateBoundsDaysMealsAndHousehold(t *testing.T) {
	tooLong := baseRequest()
	tooLong.Days = 30
	if err := tooLong.Validate(); err == nil {
		t.Fatal("expected a 30-day plan to be rejected")
	}

	noMeals := baseRequest()
	noMeals.Meals = MealCounts{}
	if err := noMeals.Validate(); err == nil {
		t.Fatal("expected a plan with no meals to be rejected")
	}

	// More dinners than days cannot be laid out, so it is rejected rather than
	// silently truncated.
	crowded := baseRequest()
	crowded.Days = 2
	crowded.Meals = MealCounts{Dinner: 5}
	if err := crowded.Validate(); err == nil {
		t.Fatal("expected more dinners than days to be rejected")
	}

	big := baseRequest()
	big.Household.Size = 40
	if err := big.Validate(); err == nil {
		t.Fatal("expected an out-of-range household to be rejected")
	}
}

func TestValidateCapsFreeTextAndIDLists(t *testing.T) {
	long := make([]rune, MaxFreeTextRunes+1)
	for i := range long {
		long[i] = 'a'
	}
	text := string(long)

	request := baseRequest()
	request.Likes.FreeText = &text
	if err := request.Validate(); err == nil {
		t.Fatal("expected oversized free text to be rejected")
	}

	many := make([]string, MaxIDListLength+1)
	for i := range many {
		many[i] = strconv.Itoa(i)
	}
	list := baseRequest()
	list.PantryItems = many
	if err := list.Validate(); err == nil {
		t.Fatal("expected an oversized pantry list to be rejected")
	}
}

func TestNormalizeDerivesBudgetEnabledAndTrimsInput(t *testing.T) {
	request := baseRequest()
	if request.Budget.Enabled() {
		t.Fatal("a zero budget must not count as enabled")
	}
	request.Budget.Amount = 80
	if !request.Budget.Enabled() {
		t.Fatal("a positive budget must count as enabled")
	}

	spaced := "  chicken  "
	request.Likes.FreeText = &spaced
	request.PantryItems = []string{"rice", "rice", " ", "beans"}
	request.Normalize()

	if *request.Likes.FreeText != "chicken" {
		t.Fatalf("free text = %q, want it trimmed", *request.Likes.FreeText)
	}
	if len(request.PantryItems) != 2 {
		t.Fatalf("pantry items = %v, want duplicates and blanks removed", request.PantryItems)
	}
}
