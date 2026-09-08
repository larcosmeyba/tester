package graphql

import (
	"time"

	"github.com/helpthehive/server/internal/modules/benefits"
	"github.com/helpthehive/server/internal/modules/catalog"
	"github.com/helpthehive/server/internal/modules/grocery"
	"github.com/helpthehive/server/internal/modules/mealplans"
	"github.com/helpthehive/server/internal/modules/mealprep"
	"github.com/helpthehive/server/internal/modules/mealprofile"
	"github.com/helpthehive/server/internal/modules/pantry"
	"github.com/helpthehive/server/internal/modules/recipes"
	"github.com/helpthehive/server/internal/modules/users"
)

// Resolver holds one service per domain. The transport layer chooses which
// domain answers a field; it contains no business logic of its own, and no
// service reaches another through it.
// RecipeLibrary rather than Recipes: gqlgen generates a Recipes method on the
// query resolver, which embeds this struct, and a field of the same name would
// be shadowed by it.
type Resolver struct {
	Users         *users.Service
	Pantry        *pantry.Service
	RecipeLibrary *recipes.Service
	// RecipeImporter rather than RecipeImports, for the same reason as
	// RecipeLibrary: gqlgen generates a RecipeImports method on the query
	// resolver, which would shadow a field of that name.
	RecipeImporter *recipes.ImportService
	Catalog        *catalog.Service
	MealPlans      *mealplans.Service
	// MealProfiles, plural, because gqlgen generates a MealProfile method on the
	// query resolver — which embeds this struct — and a field of that name
	// would be shadowed by it. Same reason as RecipeLibrary above.
	MealProfiles *mealprofile.Service
	MealPrep     *mealprep.Service
	Grocery      *grocery.Service
	// Benefits is attached with WithBenefits rather than taken by NewResolver,
	// so adding the government benefits system did not change the signature
	// every existing caller passes through.
	Benefits *benefits.Service
	Now      func() time.Time
}

// WithBenefits attaches the government benefits service.
func (r *Resolver) WithBenefits(service *benefits.Service) *Resolver {
	r.Benefits = service
	return r
}

func NewResolver(
	usersService *users.Service,
	pantryService *pantry.Service,
	recipesService *recipes.Service,
	recipeImportService *recipes.ImportService,
	catalogService *catalog.Service,
	mealPlansService *mealplans.Service,
	mealProfileService *mealprofile.Service,
	mealPrepService *mealprep.Service,
	groceryService *grocery.Service,
) *Resolver {
	return &Resolver{
		Users:          usersService,
		Pantry:         pantryService,
		RecipeLibrary:  recipesService,
		RecipeImporter: recipeImportService,
		Catalog:        catalogService,
		MealPlans:      mealPlansService,
		MealProfiles:   mealProfileService,
		MealPrep:       mealPrepService,
		Grocery:        groceryService,
		Now:            time.Now,
	}
}
