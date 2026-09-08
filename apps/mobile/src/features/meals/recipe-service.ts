/**
 * RecipeService — the recipe library and the user's own recipes.
 *
 * The server returns the public library plus whatever the viewer owns, decided
 * from the bearer token. This service never filters by ownership itself: doing
 * that in the client would mean the data had already been sent.
 */
import { graphqlClient } from '@/graphql/client';
import {
  GroceryListFromRecipesDocument,
  RecipeDocument,
  RecipesDocument,
  SaveRecipeDocument,
  SavedRecipesDocument,
  UnsaveRecipeDocument,
} from '@/graphql/meal-operations';
import { useMockServices } from '@/constants/env';
import { toApiError } from '@/services/graphql-error';
import { toWireShape } from '@/features/meals/graphql-wire';
import { ApiError } from '@/services/api-error';
import {
  costRangeSchema,
  groceryListSchema,
  type CostRange,
  type GroceryList,
} from '@/features/meals/meal-plan-model';
import { recipeListSchema, recipeSchema, type Recipe } from '@/features/meals/recipe-model';
import { mockRecipeService } from '@/features/meals/mock/mock-recipe-service';

export type RecipeQuery = {
  /** Taxonomy ids: OR within a family, AND across families. */
  tagIds?: string[];
  mealType?: string;
  search?: string;
};

export type GroceryListFromRecipesInput = {
  recipeIds: string[];
  householdSize: number;
  pantryItems: string[];
};

export type RecipeService = {
  list(query?: RecipeQuery): Promise<Recipe[]>;
  get(recipeId: string): Promise<Recipe>;
  /** Recipes the user has saved. */
  listSaved(): Promise<Recipe[]>;
  save(recipeId: string): Promise<boolean>;
  unsave(recipeId: string): Promise<boolean>;
  /** Choose My Recipes: selected recipes to a consolidated, pantry-aware list. */
  groceryListFromRecipes(input: GroceryListFromRecipesInput): Promise<{
    list: GroceryList;
    cost: CostRange;
  }>;
};

const graphqlRecipeService: RecipeService = {
  async list(query) {
    try {
      const result = await graphqlClient.request(RecipesDocument, {
        query: query
          ? {
              tagIds: query.tagIds,
              mealType: query.mealType as never,
              search: query.search,
            }
          : null,
      });
      return recipeListSchema.parse(toWireShape(result.recipes));
    } catch (error) {
      throw toApiError(error);
    }
  },

  async get(recipeId) {
    try {
      const result = await graphqlClient.request(RecipeDocument, { recipeId });
      if (!result.recipe) {
        // A recipe the viewer may not see is absent, not forbidden.
        throw new ApiError('not_found', 'That recipe is not available.');
      }
      return recipeSchema.parse(toWireShape(result.recipe));
    } catch (error) {
      throw toApiError(error);
    }
  },

  async listSaved() {
    try {
      const result = await graphqlClient.request(SavedRecipesDocument);
      return recipeListSchema.parse(toWireShape(result.savedRecipes));
    } catch (error) {
      throw toApiError(error);
    }
  },

  async save(recipeId) {
    try {
      const result = await graphqlClient.request(SaveRecipeDocument, { recipeId });
      return result.saveRecipe;
    } catch (error) {
      throw toApiError(error);
    }
  },

  async unsave(recipeId) {
    try {
      const result = await graphqlClient.request(UnsaveRecipeDocument, { recipeId });
      return result.unsaveRecipe;
    } catch (error) {
      throw toApiError(error);
    }
  },

  async groceryListFromRecipes(input) {
    try {
      const result = await graphqlClient.request(GroceryListFromRecipesDocument, { input });
      return {
        list: groceryListSchema.parse(toWireShape(result.groceryListFromRecipes.sections)),
        cost: costRangeSchema.parse(toWireShape(result.groceryListFromRecipes.cost)),
      };
    } catch (error) {
      throw toApiError(error);
    }
  },
};

/**
 * The development mock predates saving recipes, so those two calls report the
 * feature as unavailable rather than pretending to have worked.
 */
const mockWithSaves: RecipeService = {
  ...mockRecipeService,
  listSaved: () => Promise.resolve([]),
  save: () => Promise.reject(new ApiError('not_implemented', 'Saving recipes needs the server.')),
  unsave: () => Promise.reject(new ApiError('not_implemented', 'Saving recipes needs the server.')),
};

export const recipeService: RecipeService = useMockServices ? mockWithSaves : graphqlRecipeService;

export { graphqlRecipeService };
