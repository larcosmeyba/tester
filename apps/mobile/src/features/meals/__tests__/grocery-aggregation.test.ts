/**
 * Grocery consolidation.
 *
 * The spec's canonical example (Doc 03 §7): two recipes each needing 8 oz of
 * salsa must buy ONE 16 oz jar, not two. These tests run against the real seed
 * database, so they also catch a fixture that drifts from the contract.
 */
import { buildBasket, groupByAisle, scaleFactorsFor, costRangeFrom } from '@/features/meals/mock/grocery-aggregation';
import { libraryRecipes, seedCatalog } from '@/features/meals/mock/seed-data';
import type { Recipe } from '@/features/meals/recipe-model';

const recipeWith = (
  overrides: Partial<Recipe> & { ingredients: Recipe['ingredients'] },
): Recipe => ({
  recipeId: overrides.recipeId ?? 'r1',
  ownerUserId: null,
  title: overrides.title ?? 'Test Recipe',
  description: null,
  sourceType: 'hth_library',
  sourceUrl: null,
  sourceName: null,
  licenseId: null,
  attributionText: null,
  visibility: 'public',
  reviewStatus: 'approved',
  servings: overrides.servings ?? 4,
  servingsConfidence: 'source',
  servingSizeText: null,
  scalable: overrides.scalable ?? true,
  prepTimeMinutes: null,
  cookTimeMinutes: null,
  totalTimeMinutes: 30,
  timeConfidence: 'source',
  mealTypes: ['dinner'],
  cuisine: null,
  difficulty: null,
  equipmentRequired: [],
  isComponent: false,
  tags: [],
  ingredients: overrides.ingredients,
  instructions: [],
  nutrition: null,
  baseMealPlanEligible: true,
  missingInformation: [],
});

const line = (
  position: number,
  ingredientId: string,
  quantity: number | null,
  extra: Partial<Recipe['ingredients'][number]> = {},
) => ({
  position,
  rawText: `${quantity ?? '?'} ${ingredientId}`,
  ingredientId,
  displayName: null,
  quantity,
  unit: null,
  preparation: null,
  grams: null,
  isOptional: false,
  isToTaste: false,
  missingInformation: null,
  ...extra,
});

describe('buildBasket', () => {
  it('aggregates the same ingredient across recipes into one line', () => {
    const a = recipeWith({ recipeId: 'a', ingredients: [line(1, 'rice_white', 1)] });
    const b = recipeWith({ recipeId: 'b', ingredients: [line(1, 'rice_white', 0.5)] });

    const basket = buildBasket([a, b], new Set());

    const rice = basket.items.filter((item) => item.ingredientId === 'rice_white');
    expect(rice).toHaveLength(1);
    expect(rice[0]?.neededQty).toBeCloseTo(1.5);
    // Both recipes are credited, so the UI can say what each item is for.
    expect(rice[0]?.usedBy.sort()).toEqual(['a', 'b']);
  });

  it('rounds up to whole packages rather than pricing a fraction of one', () => {
    // black_beans_canned is sold by the can — never divisible.
    const recipe = recipeWith({ ingredients: [line(1, 'black_beans_canned', 1.2)] });

    const basket = buildBasket([recipe], new Set());
    const beans = basket.items.find((item) => item.ingredientId === 'black_beans_canned');

    expect(beans?.packages).toBe(2);
    expect(beans?.packageLabel).toMatch(/^2 × /);
    expect(beans?.estimatedPrice).toBeGreaterThan(0);
  });

  it('charges nothing for pantry items but still lists them', () => {
    const recipe = recipeWith({ ingredients: [line(1, 'rice_white', 2)] });

    const basket = buildBasket([recipe], new Set(['rice_white']));
    const rice = basket.items.find((item) => item.ingredientId === 'rice_white');

    expect(rice?.inPantry).toBe(true);
    expect(rice?.estimatedPrice).toBe(0);
    expect(basket.checkoutCost.point).toBe(0);
  });

  it('honours parent matching — pantry "chicken" covers "chicken_thigh_bs"', () => {
    const parent = seedCatalog.get('chicken_thigh_bs')?.parentIngredientId;
    expect(parent).toBeTruthy();

    const recipe = recipeWith({ ingredients: [line(1, 'chicken_thigh_bs', 1.5)] });
    const basket = buildBasket([recipe], new Set([parent!]));

    expect(basket.items.find((i) => i.ingredientId === 'chicken_thigh_bs')?.inPantry).toBe(true);
  });

  it('skips ingredients whose quantity the source never stated, instead of guessing one', () => {
    const recipe = recipeWith({
      ingredients: [
        line(1, 'rice_white', 1),
        line(2, 'chicken_thigh_bs', null, { missingInformation: 'Chicken quantity was not specified.' }),
      ],
    });

    const basket = buildBasket([recipe], new Set());

    expect(basket.items.map((i) => i.ingredientId)).toContain('rice_white');
    expect(basket.items.map((i) => i.ingredientId)).not.toContain('chicken_thigh_bs');
  });

  it('excludes optional and to-taste lines from the basket', () => {
    const recipe = recipeWith({
      ingredients: [
        line(1, 'rice_white', 1),
        line(2, 'onion', 1, { isOptional: true }),
        line(3, 'salt', 1, { isToTaste: true }),
      ],
    });

    const basket = buildBasket([recipe], new Set());

    expect(basket.items.map((i) => i.ingredientId)).toEqual(['rice_white']);
  });

  it('reports low confidence for a seed database of tier 3/4 prices', () => {
    const recipe = recipeWith({ ingredients: [line(1, 'chicken_thigh_bs', 1.5)] });

    const basket = buildBasket([recipe], new Set());

    // Tier 1 retailer pricing is empty in the MVP, so ranges must stay wide.
    expect(basket.checkoutCost.confidence).toBe('low');
    expect(basket.checkoutCost.low).toBeLessThan(basket.checkoutCost.point);
    expect(basket.checkoutCost.high).toBeGreaterThan(basket.checkoutCost.point);
  });

  it('consolidates a real pair of seed recipes without duplicating shared ingredients', () => {
    const [first, second] = libraryRecipes();
    expect(first && second).toBeTruthy();

    const basket = buildBasket([first!, second!], new Set());
    const ids = basket.items.map((item) => item.ingredientId);

    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('groupByAisle', () => {
  it('groups items into store sections in the spec order', () => {
    const recipe = recipeWith({
      ingredients: [line(1, 'rice_white', 1), line(2, 'onion', 1), line(3, 'chicken_thigh_bs', 1)],
    });

    const sections = groupByAisle(buildBasket([recipe], new Set()).items);
    const aisles = sections.map((section) => section.aisle);

    // Produce always precedes meat, which precedes pantry.
    expect(aisles.indexOf('produce')).toBeLessThan(aisles.indexOf('meat_seafood'));
    expect(aisles.indexOf('meat_seafood')).toBeLessThan(aisles.indexOf('pantry'));
    expect(sections.every((section) => section.items.length > 0)).toBe(true);
  });
});

describe('scaleFactorsFor', () => {
  it('leaves a 4-serving recipe alone for a household of 4', () => {
    const recipe = recipeWith({ servings: 4, ingredients: [line(1, 'rice_white', 1)] });
    expect(scaleFactorsFor([recipe], 4).get('r1')).toBe(1);
  });

  it('doubles a 4-serving recipe for a household of 8', () => {
    const recipe = recipeWith({ servings: 4, ingredients: [line(1, 'rice_white', 1)] });
    expect(scaleFactorsFor([recipe], 8).get('r1')).toBe(2);
  });

  it('never scales a recipe marked not scalable', () => {
    const recipe = recipeWith({ servings: 2, scalable: false, ingredients: [line(1, 'rice_white', 1)] });
    expect(scaleFactorsFor([recipe], 8).get('r1')).toBe(1);
  });

  it('scales the basket with the household', () => {
    const recipe = recipeWith({ servings: 4, ingredients: [line(1, 'rice_white', 1)] });

    const forFour = buildBasket([recipe], new Set(), scaleFactorsFor([recipe], 4));
    const forEight = buildBasket([recipe], new Set(), scaleFactorsFor([recipe], 8));

    expect(forEight.items[0]!.neededQty).toBeCloseTo(forFour.items[0]!.neededQty * 2);
  });
});

describe('costRangeFrom', () => {
  it('always produces a range around the point, never a bare number', () => {
    const range = costRangeFrom(54.1, 'low');
    expect(range.low).toBeLessThan(range.point);
    expect(range.high).toBeGreaterThan(range.point);
  });

  it('tightens the range as confidence rises', () => {
    const low = costRangeFrom(100, 'low');
    const high = costRangeFrom(100, 'high');
    expect(high.high - high.low).toBeLessThan(low.high - low.low);
  });
});
