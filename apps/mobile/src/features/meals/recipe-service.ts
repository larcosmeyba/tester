/**
 * RecipeService — the recipe library and the user's own recipes.
 *
 * BACKEND INTEGRATION REQUIRED. The confirmed contract (product Doc 02 §6 /
 * Doc 03 §14) is:
 *
 *   GET  /recipes?tags=diet.vegan,time.30_min&meal=dinner
 *   GET  /recipes/{recipe_id}
 *   POST /grocery-lists/from-recipes   {recipe_ids[], household_size, pantry_items[]}
 *
 * Until those exist, `useMockServices` serves the spec's seed library locally so
 * the browse, select and grocery flows can be built against the real shape.
 */
import { useMockServices } from '@/constants/env';
import { BackendIntegrationRequiredError } from '@/services/api-error';
import type { GroceryList } from '@/features/meals/meal-plan-model';
import type { Recipe } from '@/features/meals/recipe-model';
import { mockRecipeService } from '@/features/meals/mock/mock-recipe-service';

export type RecipeQuery = {
  /** Taxonomy ids: OR within a family, AND across families (Doc 02 §6). */
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
  /** Choose My Recipes: selected recipes → consolidated, pantry-aware list. */
  groceryListFromRecipes(input: GroceryListFromRecipesInput): Promise<{
    list: GroceryList;
    cost: import('@/features/meals/meal-plan-model').CostRange;
  }>;
};

const pendingRecipeService: RecipeService = {
  list: () => Promise.reject(new BackendIntegrationRequiredError('GET /recipes')),
  get: () => Promise.reject(new BackendIntegrationRequiredError('GET /recipes/{recipe_id}')),
  groceryListFromRecipes: () =>
    Promise.reject(new BackendIntegrationRequiredError('POST /grocery-lists/from-recipes')),
};

export const recipeService: RecipeService = useMockServices ? mockRecipeService : pendingRecipeService;

export { pendingRecipeService };
