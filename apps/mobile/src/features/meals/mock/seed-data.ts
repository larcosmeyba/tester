/**
 * DEVELOPMENT ONLY.
 *
 * The seed database shipped with the product spec (10 recipes, 35 ingredients,
 * 35 price rows) — the same JSON shape the real backend serves. Loading it here
 * lets the app run end-to-end before Padraic's endpoints are reachable.
 *
 * Nothing in `services/api` imports this except through the `env.useMockServices`
 * switch, and that switch is forced off in production builds.
 */
import ingredientCatalogJson from '@/data/meal-seed/ingredient_catalog.json';
import priceEstimatesJson from '@/data/meal-seed/price_estimates.json';
import seedRecipesJson from '@/data/meal-seed/seed_recipes.json';
import { ingredientCatalogSchema, priceBookSchema, IngredientCatalog } from '@/features/meals/ingredient-model';
import { recipeListSchema, type Recipe } from '@/features/meals/recipe-model';
import type { PriceEstimate } from '@/features/meals/ingredient-model';

/**
 * Parsing the fixtures through the same schemas the network layer uses means a
 * fixture that drifts from the contract fails here, loudly, in development.
 */
export const seedRecipes: Recipe[] = recipeListSchema.parse(seedRecipesJson);

export const seedIngredients = ingredientCatalogSchema.parse(ingredientCatalogJson);

export const seedCatalog = new IngredientCatalog(seedIngredients);

export const seedPrices: PriceEstimate[] = priceBookSchema.parse(priceEstimatesJson);

/** Tier-aware price lookup: keep the best (lowest) tier per ingredient. */
const priceById = new Map<string, PriceEstimate>();
for (const row of seedPrices) {
  const existing = priceById.get(row.ingredientId);
  if (existing && existing.tier <= row.tier) continue;
  priceById.set(row.ingredientId, row);
}

export function resolvePrice(ingredientId: string | null): PriceEstimate | null {
  if (!ingredientId) return null;
  const direct = priceById.get(ingredientId);
  if (direct) return direct;
  // Parent fallback (lowers confidence): chicken_thigh → chicken.
  const parent = seedCatalog.get(ingredientId)?.parentIngredientId;
  return parent ? priceById.get(parent) ?? null : null;
}

export const libraryRecipes = (): Recipe[] =>
  seedRecipes.filter((r) => r.visibility === 'public' && r.reviewStatus === 'approved');
