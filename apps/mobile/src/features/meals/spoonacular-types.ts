/**
 * Spoonacular-shaped recipe data.
 *
 * BACKEND SEAM: replace mock with server Spoonacular adapter (key lives server-side, never EXPO_PUBLIC_*)
 *
 * The app never talks to Spoonacular directly. The backend holds the API key
 * and reshapes responses into this interface; the mobile client only ever sees
 * `SpoonacularRecipe`. The mock catalog in this feature speaks the same shape
 * so the UI can be built and tested before the adapter exists.
 */
export interface SpoonacularIngredient {
  /** Spoonacular ingredient id. */
  id: number;
  /** e.g. "1 cup diced onion". */
  original: string;
  /** Canonicalised name, e.g. "onion". */
  nameClean: string | null;
  amount: number;
  unit: string;
}

export interface SpoonacularRecipe {
  /** Spoonacular recipe id. */
  id: number;
  title: string;
  /** `spoonacular.com` CDN image URL; null in mock data until the adapter lands. */
  imageUrl: string | null;
  /** Ready-in minutes. */
  readyInMinutes: number | null;
  servings: number;
  /** Estimated cost per serving in USD (Spoonacular `pricePerServing` / 100). */
  pricePerServingUsd: number | null;
  /** e.g. "breakfast", "lunch", "dinner". */
  dishTypes: string[];
  /** e.g. "american", "mexican". */
  cuisines: string[];
  /** e.g. "vegetarian", "vegan", "gluten free". */
  diets: string[];
  extendedIngredients: SpoonacularIngredient[];
  /** Plain-text instructions. */
  instructions: string | null;
  /** Where this record came from: the real API or the local mock catalog. */
  provenance: 'spoonacular' | 'mock';
}

/**
 * Maps a Spoonacular recipe onto the app's meal-type enum. Spoonacular
 * `dishTypes` are free-form ("side dish", "main course"), so unknown types
 * fall back to dinner — never dropped silently.
 */
export function spoonacularMealType(dishTypes: string[]): 'breakfast' | 'lunch' | 'dinner' {
  const lower = dishTypes.map((type) => type.toLowerCase());
  if (lower.some((type) => type.includes('breakfast'))) return 'breakfast';
  if (lower.some((type) => type.includes('lunch'))) return 'lunch';
  return 'dinner';
}

// ---------------------------------------------------------------------------
// Conversion to the shared Recipe model
// ---------------------------------------------------------------------------

import type { Recipe } from '@/features/meals/recipe-model';

/**
 * Converts a Spoonacular record into the app's one shared `Recipe` model so
 * database picks flow through the same pipeline as everything else
 * (assign → week → grocery list).
 *
 * Mock records carry no quantified ingredients, so their ingredient lines are
 * empty: the basket never invents quantities the source never stated. Real
 * adapter records map `extendedIngredients` onto canonical ingredient ids.
 */
export function spoonacularToRecipe(spoonacular: SpoonacularRecipe): Recipe {
  const mealType = spoonacularMealType(spoonacular.dishTypes);
  return {
    recipeId: `spoonacular-${spoonacular.id}`,
    ownerUserId: null,
    title: spoonacular.title,
    description: null,
    sourceType: 'hth_library',
    sourceUrl: null,
    sourceName: spoonacular.provenance === 'spoonacular' ? 'Spoonacular' : 'HTH mock catalog',
    licenseId: null,
    attributionText: null,
    visibility: 'public',
    reviewStatus: 'approved',
    servings: spoonacular.servings,
    servingsConfidence: 'source',
    servingSizeText: null,
    scalable: true,
    prepTimeMinutes: null,
    cookTimeMinutes: null,
    totalTimeMinutes: spoonacular.readyInMinutes,
    timeConfidence: spoonacular.readyInMinutes === null ? 'missing' : 'source',
    mealTypes: [mealType],
    cuisine: spoonacular.cuisines[0] ?? null,
    difficulty: null,
    equipmentRequired: [],
    isComponent: false,
    tags: [`meal.${mealType}`],
    ingredients: [],
    instructions: [],
    nutrition: null,
    baseMealPlanEligible: true,
    // Mock records carry no ingredient lines at all: the basket skips them
    // rather than inventing quantities the source never stated.
    missingInformation: [],
  };
}
