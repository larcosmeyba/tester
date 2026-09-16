/**
 * Video-import GraphQL documents.
 *
 * The backend flow: `importRecipeFromVideo` starts the job and returns
 * immediately; the client polls `recipeImport(importId)` until the status is
 * `succeeded` (draft ready), `failed` (named errorCode), or `cancelled`; then
 * `acceptRecipeImport` saves the draft as one of the viewer's recipes, with an
 * optional patch for the values a video commonly fails to state (servings,
 * per-line quantity/unit).
 *
 * These documents mirror `packages/api-contract/meals.graphql`. The result
 * types are written by hand here (rather than generated) because the mobile
 * documents are handwritten too; the draft is parsed by the shared
 * `recipeSchema`, so a schema drift fails at the service boundary.
 */
import type { GraphQLDocument } from '@/graphql/operations';

const RECIPE_DRAFT_FIELDS = `
  fragment RecipeDraftFields on Recipe {
    recipeId
    title
    servings
    mealTypes
    missingInformation
    ingredients {
      position
      rawText
      displayName
      quantity
      unit
      missingInformation
    }
    instructions {
      step
      text
      minutes
    }
  }
`;

export type ImportRecipeFromVideoResult = {
  importRecipeFromVideo: {
    importId: string;
    sourceUrl: string;
    sourcePlatform: string;
    status: string;
  };
};

export type ImportRecipeFromVideoVariables = {
  input: { url: string; language?: string | null };
};

export const ImportRecipeFromVideoDocument = `
  mutation ImportRecipeFromVideo($input: ImportRecipeFromVideoInput!) {
    importRecipeFromVideo(input: $input) {
      importId
      sourceUrl
      sourcePlatform
      status
    }
  }
` as GraphQLDocument<ImportRecipeFromVideoResult, ImportRecipeFromVideoVariables>;

/** Raw draft shape as the server sends it; parsed by `recipeSchema`. */
export type RecipeImportDraftWire = { [key: string]: unknown };

export type RecipeImportResult = {
  recipeImport: {
    importId: string;
    sourceUrl: string;
    sourcePlatform: string;
    status: string;
    draft: RecipeImportDraftWire | null;
    recipeId: string | null;
    errorCode: string | null;
    errorMessage: string | null;
  } | null;
};

export type RecipeImportVariables = { importId: string };

export const RecipeImportDocument = `
  ${RECIPE_DRAFT_FIELDS}
  query RecipeImport($importId: ID!) {
    recipeImport(importId: $importId) {
      importId
      sourceUrl
      sourcePlatform
      status
      draft {
        ...RecipeDraftFields
      }
      recipeId
      errorCode
      errorMessage
    }
  }
` as GraphQLDocument<RecipeImportResult, RecipeImportVariables>;

export type CancelRecipeImportResult = {
  cancelRecipeImport: { importId: string; status: string };
};

export type CancelRecipeImportVariables = { importId: string };

export const CancelRecipeImportDocument = `
  mutation CancelRecipeImport($importId: ID!) {
    cancelRecipeImport(importId: $importId) {
      importId
      status
    }
  }
` as GraphQLDocument<CancelRecipeImportResult, CancelRecipeImportVariables>;

export type AcceptRecipeImportPatch = {
  servings?: number | null;
  ingredients?: {
    position: number;
    quantity?: number | null;
    unit?: string | null;
  }[];
};

export type AcceptRecipeImportResult = {
  acceptRecipeImport: { recipeId: string; title: string };
};

export type AcceptRecipeImportVariables = {
  importId: string;
  input?: AcceptRecipeImportPatch | null;
};

export const AcceptRecipeImportDocument = `
  mutation AcceptRecipeImport($importId: ID!, $input: AcceptRecipeImportInput) {
    acceptRecipeImport(importId: $importId, input: $input) {
      recipeId
      title
    }
  }
` as GraphQLDocument<AcceptRecipeImportResult, AcceptRecipeImportVariables>;
