package graphql

import (
	"errors"

	"github.com/helpthehive/server/internal/db"
	"github.com/helpthehive/server/internal/domain/meals"
	"github.com/helpthehive/server/internal/graphql/model"
	"github.com/helpthehive/server/internal/modules/recipes"
	"github.com/vektah/gqlparser/v2/gqlerror"
)

// recipeImportModel maps a stored import onto the contract.
//
// The draft is rendered with the same recipeModel as any other recipe: there
// is no second recipe shape for imports, so nothing about missing information
// or plannability can drift between the two.
func recipeImportModel(imp meals.RecipeImport) *model.RecipeImport {
	out := &model.RecipeImport{
		ImportID:       imp.ID,
		SourceURL:      imp.SourceURL,
		SourcePlatform: imp.SourcePlatform,
		Status:         model.RecipeImportStatus(imp.Status),
		RecipeID:       imp.RecipeID,
		ErrorCode:      imp.ErrorCode,
		ErrorMessage:   imp.ErrorMessage,
		CreatedAt:      db.FormatTime(imp.CreatedAt),
	}

	if imp.Draft != nil {
		out.Draft = recipeModel(*imp.Draft)
	}
	if imp.CompletedAt != nil {
		completed := db.FormatTime(*imp.CompletedAt)
		out.CompletedAt = &completed
	}
	return out
}

func recipeImportModels(imports []meals.RecipeImport) []*model.RecipeImport {
	out := make([]*model.RecipeImport, 0, len(imports))
	for _, imp := range imports {
		out = append(out, recipeImportModel(imp))
	}
	return out
}

// importError turns an import failure into something safe to send a client.
//
// Each case gets its own code because each needs different words in front of a
// user: "we could not read that link" and "you are already importing that
// video" are not the same problem. Anything the viewer may not see still comes
// back as NOT_FOUND, via mealError.
func importError(err error) error {
	if err == nil {
		return nil
	}

	switch {
	case errors.Is(err, recipes.ErrImportUnavailable):
		return &gqlerror.Error{
			Message:    "Importing recipes from video is not available.",
			Extensions: map[string]any{"code": "IMPORT_UNAVAILABLE"},
		}
	case errors.Is(err, recipes.ErrInvalidSourceURL):
		return &gqlerror.Error{
			Message:    "That does not look like a video link.",
			Extensions: map[string]any{"code": "INVALID_SOURCE_URL"},
		}
	case errors.Is(err, recipes.ErrImportInProgress):
		return &gqlerror.Error{
			Message:    "That video is already being imported.",
			Extensions: map[string]any{"code": "IMPORT_IN_PROGRESS"},
		}
	case errors.Is(err, recipes.ErrImportNotSucceeded):
		return &gqlerror.Error{
			Message:    "That import has no recipe to accept yet.",
			Extensions: map[string]any{"code": "IMPORT_NOT_READY"},
		}
	}
	return mealError(err)
}
