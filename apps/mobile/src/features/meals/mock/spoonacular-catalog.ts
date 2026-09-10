/**
 * Spoonacular-shaped mock catalog for the Recipe Database.
 *
 * BACKEND SEAM: replace mock with server Spoonacular adapter (key lives server-side, never EXPO_PUBLIC_*)
 *
 * The nine breakfast/lunch entries are transcribed from the iOS screenshots
 * (titles, times, servings and estimated prices verbatim); the dinner entries
 * are clearly-marked mock depth so the Dinner filter is not empty. `imageUrl`
 * is null throughout the mock — the adapter fills in real CDN images.
 */
import type { SpoonacularRecipe } from '@/features/meals/spoonacular-types';

function mockRecipe(
  id: number,
  title: string,
  readyInMinutes: number,
  servings: number,
  pricePerServingUsd: number,
  dishTypes: string[],
  cuisines: string[] = [],
): SpoonacularRecipe {
  return {
    id,
    title,
    imageUrl: null,
    readyInMinutes,
    servings,
    pricePerServingUsd,
    dishTypes,
    cuisines,
    diets: [],
    extendedIngredients: [],
    instructions: null,
    provenance: 'mock',
  };
}

export const MOCK_SPOONACULAR_CATALOG: SpoonacularRecipe[] = [
  // --- iOS screenshot entries (verbatim) ---
  mockRecipe(101, 'Avocado Toast & Eggs', 10, 2, 2.5, ['breakfast']),
  mockRecipe(102, '5 Egg Breakfast', 15, 4, 3.85, ['breakfast']),
  mockRecipe(103, 'Oatmeal with Berries', 10, 2, 1.9, ['breakfast']),
  mockRecipe(104, 'Banana Pancakes', 20, 4, 2.4, ['breakfast']),
  mockRecipe(105, 'Greek Yogurt Parfait', 5, 1, 2.1, ['breakfast']),
  mockRecipe(106, 'Smoothie Bowl', 8, 1, 2.6, ['breakfast']),
  mockRecipe(107, 'Veggie Omelette', 15, 2, 2.3, ['breakfast']),
  mockRecipe(108, 'Veggie Rice Bowl', 20, 4, 3.75, ['lunch']),
  mockRecipe(109, 'Turkey Taco Bowls', 20, 4, 4.21, ['lunch']),
  // --- mock depth for the Dinner filter ---
  mockRecipe(110, 'Chicken & Veggie Stir Fry', 25, 4, 4.5, ['dinner'], ['asian']),
  mockRecipe(111, 'Black Bean Chili', 35, 6, 2.95, ['dinner'], ['mexican']),
  mockRecipe(112, 'Spaghetti with Marinara', 30, 4, 3.1, ['dinner'], ['italian']),
];
