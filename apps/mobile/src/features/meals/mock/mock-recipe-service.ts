/**
 * DEVELOPMENT ONLY — the recipe library, served from the spec's seed database.
 *
 * Implements the same `RecipeService` interface the real backend will, so no
 * screen has to know which one it is talking to.
 */
import { ApiError } from '@/services/api-error';
import type { GroceryListFromRecipesInput, RecipeQuery, RecipeService } from '@/features/meals/recipe-service';
import { hasTag, type Recipe } from '@/features/meals/recipe-model';
import { buildBasket, groupByAisle, scaleFactorsFor } from '@/features/meals/mock/grocery-aggregation';
import { libraryRecipes, seedRecipes } from '@/features/meals/mock/seed-data';

const LATENCY_MS = 350;
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Tag filter: OR within a family (the prefix before "."), AND across families. */
function matchesTags(recipe: Recipe, tagIds: string[]): boolean {
  if (tagIds.length === 0) return true;
  const families = new Map<string, string[]>();
  for (const tag of tagIds) {
    const family = tag.split('.')[0] ?? tag;
    families.set(family, [...(families.get(family) ?? []), tag]);
  }
  return [...families.values()].every((tagsInFamily) => tagsInFamily.some((tag) => hasTag(recipe, tag)));
}

export const mockRecipeService: RecipeService = {
  async list(query: RecipeQuery = {}) {
    await delay(LATENCY_MS);
    const search = query.search?.trim().toLowerCase();

    return libraryRecipes().filter((recipe) => {
      if (!matchesTags(recipe, query.tagIds ?? [])) return false;
      if (query.mealType && !recipe.mealTypes.includes(query.mealType as never)) return false;
      if (search && search.length > 0) {
        const haystack = `${recipe.title} ${recipe.description ?? ''} ${recipe.cuisine ?? ''}`.toLowerCase();
        if (!haystack.includes(search)) return false;
      }
      return true;
    });
  },

  async get(recipeId: string) {
    await delay(LATENCY_MS);
    const recipe = seedRecipes.find((candidate) => candidate.recipeId === recipeId);
    if (!recipe) throw new ApiError('not_found', "We couldn't find that recipe.");
    return recipe;
  },

  async groceryListFromRecipes({ recipeIds, householdSize, pantryItems }: GroceryListFromRecipesInput) {
    await delay(LATENCY_MS * 2);
    const selected = seedRecipes.filter((recipe) => recipeIds.includes(recipe.recipeId));
    if (selected.length === 0) {
      throw new ApiError('validation', 'Pick at least one recipe first.');
    }
    const basket = buildBasket(
      selected,
      new Set(pantryItems),
      scaleFactorsFor(selected, householdSize)
    );
    return { list: groupByAisle(basket.items), cost: basket.checkoutCost };
  },
};
