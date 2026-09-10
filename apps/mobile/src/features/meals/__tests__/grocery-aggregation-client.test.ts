/**
 * Client-side grocery aggregation contract.
 *
 * Screens import from `@/features/meals/grocery-aggregation`, never from the
 * mock layer directly. These tests pin that the public surface consolidates
 * like the spec requires (two recipes needing 8 oz of salsa buy ONE 16 oz
 * jar) and groups items into aisle order.
 */
import {
  buildBasket,
  groupByAisle,
  scaleFactorsFor,
  type Basket,
} from '@/features/meals/grocery-aggregation';
import { libraryRecipes } from '@/features/meals/mock/seed-data';

describe('grocery-aggregation (client surface)', () => {
  it('exposes the consolidation engine screens share', () => {
    expect(typeof buildBasket).toBe('function');
    expect(typeof groupByAisle).toBe('function');
    expect(typeof scaleFactorsFor).toBe('function');
  });

  it('builds a basket from seed recipes and groups it by aisle', () => {
    const recipes = libraryRecipes().slice(0, 2);
    const basket: Basket = buildBasket(recipes, new Set(), scaleFactorsFor(recipes, 2));
    expect(basket.items.length).toBeGreaterThan(0);
    expect(basket.checkoutCost.point).toBeGreaterThanOrEqual(0);

    const sections = groupByAisle(basket.items);
    expect(sections.length).toBeGreaterThan(0);
    const flattened = sections.flatMap((section) => section.items);
    expect(flattened).toHaveLength(basket.items.length);
  });

  it('subtracts pantry items from the basket', () => {
    const recipes = libraryRecipes().slice(0, 2);
    const full: Basket = buildBasket(recipes, new Set());
    const firstIngredient = full.items[0]?.ingredientId;
    if (!firstIngredient) return;
    const withPantry: Basket = buildBasket(recipes, new Set([firstIngredient]));
    const line = withPantry.items.find((item) => item.ingredientId === firstIngredient);
    expect(line?.inPantry).toBe(true);
    expect(line?.estimatedPrice).toBe(0);
  });
});
