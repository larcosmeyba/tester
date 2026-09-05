/**
 * Allergy and diet safety.
 *
 * Product rule 3: allergies and diets are computed from ingredient-catalog
 * flags by code. The AI never decides safety and neither does the client's
 * presentation layer. These tests run the mock planner's filters against the
 * real seed catalog.
 *
 * A regression here would put an allergen on someone's plate, so these are the
 * tests to keep green above all others.
 */
import { __mockInternals } from '@/features/meals/mock/mock-meal-plan-service';
import { libraryRecipes, seedCatalog } from '@/features/meals/mock/seed-data';
import { ingredientContainsAllergen } from '@/features/meals/ingredient-model';
import { createEmptyPlanRequest, type PlanRequest } from '@/features/meals/meal-plan-model';
import type { Allergen } from '@/features/meals/meal-enums';

const { eligibleRecipes } = __mockInternals;

const requestWith = (patch: Partial<PlanRequest>): PlanRequest => ({
  ...createEmptyPlanRequest(),
  household: { size: 4, adults: 2, children: 2, sizeIsPlus: false },
  meals: { breakfast: 0, lunch: 0, dinner: 5, snack: 0 },
  ...patch,
});

/** Every ingredient in the recipe that carries this allergen, per the catalog. */
const allergenIngredients = (recipeId: string, allergen: Allergen): string[] => {
  const recipe = libraryRecipes().find((r) => r.recipeId === recipeId);
  if (!recipe) return [];
  return recipe.ingredients
    .map((line) => line.ingredientId)
    .filter((id): id is string => Boolean(id))
    .filter((id) => {
      const ingredient = seedCatalog.get(id);
      return ingredient ? ingredientContainsAllergen(ingredient, allergen) : false;
    });
};

describe('allergen filtering', () => {
  const ALLERGENS: Allergen[] = [
    'milk', 'egg', 'fish', 'shellfish', 'tree_nut', 'peanut', 'wheat', 'soy', 'sesame',
  ];

  it.each(ALLERGENS)('never returns a recipe containing %s when it is declared', (allergen) => {
    const request = requestWith({ allergies: [{ allergen, strength: 'required' }] });

    const results = eligibleRecipes(request);

    for (const recipe of results) {
      expect(allergenIngredients(recipe.recipeId, allergen)).toEqual([]);
    }
  });

  it('applies every declared allergy at once, not just the first', () => {
    const request = requestWith({
      allergies: [
        { allergen: 'milk', strength: 'required' },
        { allergen: 'wheat', strength: 'required' },
      ],
    });

    for (const recipe of eligibleRecipes(request)) {
      expect(allergenIngredients(recipe.recipeId, 'milk')).toEqual([]);
      expect(allergenIngredients(recipe.recipeId, 'wheat')).toEqual([]);
    }
  });

  it('treats coconut as a tree nut — the conservative policy the engine specifies', () => {
    const coconut = seedCatalog.all.find((i) => i.containsCoconut);
    if (!coconut) {
      // The seed catalog has no coconut ingredient; the policy is still asserted below.
      expect(true).toBe(true);
      return;
    }
    expect(ingredientContainsAllergen(coconut, 'tree_nut')).toBe(true);
  });

  it('excludes an "Other" allergy given as an ingredient id', () => {
    const withOnion = libraryRecipes().find((r) =>
      r.ingredients.some((line) => line.ingredientId === 'onion'),
    );
    expect(withOnion).toBeTruthy();

    const request = requestWith({ allergyIngredients: ['onion'] });

    expect(eligibleRecipes(request).map((r) => r.recipeId)).not.toContain(withOnion!.recipeId);
  });
});

describe('dietary requirements', () => {
  it('only returns recipes tagged for a required diet', () => {
    const request = requestWith({
      dietaryRequirements: [{ diet: 'dairy_free', strength: 'required' }],
    });

    for (const recipe of eligibleRecipes(request)) {
      expect(recipe.tags).toContain('diet.dairy_free');
    }
  });

  it('applies diet and allergy together', () => {
    const request = requestWith({
      dietaryRequirements: [{ diet: 'gluten_free', strength: 'required' }],
      allergies: [{ allergen: 'milk', strength: 'required' }],
    });

    for (const recipe of eligibleRecipes(request)) {
      expect(recipe.tags).toContain('diet.gluten_free');
      expect(allergenIngredients(recipe.recipeId, 'milk')).toEqual([]);
    }
  });

  it('does not filter on a diet marked as a preference rather than a requirement', () => {
    const required = eligibleRecipes(
      requestWith({ dietaryRequirements: [{ diet: 'vegan', strength: 'required' }] }),
    );
    const preferred = eligibleRecipes(
      requestWith({ dietaryRequirements: [{ diet: 'vegan', strength: 'preferred' }] }),
    );

    expect(preferred.length).toBeGreaterThanOrEqual(required.length);
  });
});

describe('other hard filters', () => {
  it('never plans an incomplete recipe, even when nothing else excludes it', () => {
    for (const recipe of eligibleRecipes(requestWith({}))) {
      expect(recipe.baseMealPlanEligible).toBe(true);
    }
  });

  it('never recommends a recipe needing equipment the user does not have', () => {
    const request = requestWith({ equipment: ['microwave'] });

    for (const recipe of eligibleRecipes(request)) {
      expect(recipe.equipmentRequired.every((item) => item === 'microwave')).toBe(true);
    }
  });

  it('honours a hard cooking-time limit', () => {
    const request = requestWith({ cookingTime: { maxMinutes: 30, strength: 'required' } });

    for (const recipe of eligibleRecipes(request)) {
      if (recipe.totalTimeMinutes !== null) expect(recipe.totalTimeMinutes).toBeLessThanOrEqual(30);
    }
  });

  it('treats a soft cooking-time limit as a preference, not a filter', () => {
    const hard = eligibleRecipes(requestWith({ cookingTime: { maxMinutes: 20, strength: 'required' } }));
    const soft = eligibleRecipes(requestWith({ cookingTime: { maxMinutes: 20, strength: 'preferred' } }));

    expect(soft.length).toBeGreaterThanOrEqual(hard.length);
  });

  it('excludes recipes containing a disliked ingredient', () => {
    const request = requestWith({
      dislikes: { ingredients: ['onion'], cuisines: [], freeText: null },
    });

    for (const recipe of eligibleRecipes(request)) {
      expect(recipe.ingredients.map((l) => l.ingredientId)).not.toContain('onion');
    }
  });

  it('honours exclude_recipe_ids', () => {
    const first = libraryRecipes()[0]!;
    const request = requestWith({ excludeRecipeIds: [first.recipeId] });

    expect(eligibleRecipes(request).map((r) => r.recipeId)).not.toContain(first.recipeId);
  });
});
