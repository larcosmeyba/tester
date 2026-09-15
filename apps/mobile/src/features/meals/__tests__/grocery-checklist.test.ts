/**
 * Grocery checklist logic (Swift `PlanGroceryListView` rebuild).
 *
 * Covers the client-side guarantees the Swift screens promise: no duplicate
 * lines, correct estimated totals, the "left to buy" math, check-off
 * counting, and the clearly-labeled price fallback.
 */
import {
  allChecklistItems,
  checkoffProgress,
  checklistSections,
  dedupeGroceryItems,
  displayQuantity,
  estimatedTotal,
  fallbackEstimate,
  priceForItem,
  remainingTotal,
} from '@/features/meals/grocery-checklist';
import type { GroceryItem, GrocerySection } from '@/features/meals/meal-plan-model';

const item = (overrides: Partial<GroceryItem> = {}): GroceryItem => ({
  ingredientId: 'rice_white',
  displayName: 'Rice',
  neededQty: 1,
  unit: 'cup',
  packages: null,
  packageLabel: null,
  estimatedPrice: 2.5,
  priceTier: null,
  inPantry: false,
  usedBy: [],
  ...overrides,
});

const section = (
  aisleLabel: string,
  items: GroceryItem[],
  aisle: 'produce' | 'meat_seafood' | 'dairy_refrigerated' | 'pantry' | 'canned' | 'frozen' | 'bakery' | 'spice' | 'other' = 'other',
): GrocerySection => ({ aisle, aisleLabel, items });

describe('dedupeGroceryItems', () => {
  it('merges duplicate ingredient ids into one line', () => {
    const merged = dedupeGroceryItems([
      item({ ingredientId: 'salsa', displayName: 'Salsa', neededQty: 8, unit: 'oz', estimatedPrice: 3 }),
      item({ ingredientId: 'salsa', displayName: 'Salsa', neededQty: 8, unit: 'oz', estimatedPrice: 3 }),
      item({ ingredientId: 'rice_white', displayName: 'Rice', estimatedPrice: 2.5 }),
    ]);

    const salsa = merged.filter((i) => i.ingredientId === 'salsa');
    expect(salsa).toHaveLength(1);
    expect(salsa[0]?.neededQty).toBe(16);
    expect(salsa[0]?.estimatedPrice).toBe(6);
    expect(merged).toHaveLength(2);
  });

  it('unions usedBy so each line still says what it is for', () => {
    const merged = dedupeGroceryItems([
      item({ ingredientId: 'salsa', usedBy: ['recipe-a'] }),
      item({ ingredientId: 'salsa', usedBy: ['recipe-a', 'recipe-b'] }),
    ]);
    expect(merged[0]?.usedBy.sort()).toEqual(['recipe-a', 'recipe-b']);
  });

  it('keeps the pantry flag when any duplicate row is in the pantry', () => {
    const merged = dedupeGroceryItems([
      item({ ingredientId: 'salt', estimatedPrice: 1.2, inPantry: false }),
      item({ ingredientId: 'salt', estimatedPrice: 1.2, inPantry: true }),
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.inPantry).toBe(true);
  });
});

describe('checklistSections', () => {
  it('preserves section order and drops empty sections', () => {
    const sections = checklistSections([
      section('Produce', [item({ ingredientId: 'onion', displayName: 'Onion' })]),
      section('Bakery', []),
      section('Dairy', [item({ ingredientId: 'milk', displayName: 'Milk' })]),
    ]);
    expect(sections.map((s) => s.aisleLabel)).toEqual(['Produce', 'Dairy']);
  });

  it('merges duplicates inside a section', () => {
    const sections = checklistSections([
      section('Produce', [item({ ingredientId: 'onion' }), item({ ingredientId: 'onion' })]),
    ]);
    expect(sections[0]?.items).toHaveLength(1);
  });
});

describe('allChecklistItems', () => {
  it('merges duplicates that span sections', () => {
    const items = allChecklistItems([
      section('Produce', [item({ ingredientId: 'onion', estimatedPrice: 1 })]),
      section('Other', [item({ ingredientId: 'onion', estimatedPrice: 1 })]),
    ]);
    expect(items).toHaveLength(1);
    expect(items[0]?.estimatedPrice).toBe(2);
  });
});

describe('estimatedTotal', () => {
  it('sums every buyable item and skips pantry items', () => {
    const total = estimatedTotal([
      section('Produce', [
        item({ ingredientId: 'onion', estimatedPrice: 1.5 }),
        item({ ingredientId: 'salt', estimatedPrice: 2.0, inPantry: true }),
      ]),
    ]);
    expect(total.amount).toBe(1.5);
    expect(total.usedFallback).toBe(false);
  });

  it('consolidates a duplicated line by summing, never listing it twice', () => {
    const items = allChecklistItems([
      section('Produce', [item({ ingredientId: 'onion', neededQty: 1, estimatedPrice: 1.5 })]),
      section('Other', [item({ ingredientId: 'onion', neededQty: 1, estimatedPrice: 1.5 })]),
    ]);
    expect(items).toHaveLength(1);
    expect(items[0]?.neededQty).toBe(2);
    expect(items[0]?.estimatedPrice).toBe(3);
    expect(estimatedTotal([
      section('Produce', [item({ ingredientId: 'onion', estimatedPrice: 1.5 })]),
      section('Other', [item({ ingredientId: 'onion', estimatedPrice: 1.5 })]),
    ]).amount).toBe(3);
  });

  it('rounds the total to cents', () => {
    const total = estimatedTotal([
      section('Produce', [
        item({ ingredientId: 'a', estimatedPrice: 0.1 }),
        item({ ingredientId: 'b', estimatedPrice: 0.2 }),
      ]),
    ]);
    // 0.1 + 0.2 = 0.30000000000000004 without rounding.
    expect(total.amount).toBe(0.3);
  });
});

describe('remainingTotal', () => {
  const sections = [
    section('Produce', [
      item({ ingredientId: 'onion', estimatedPrice: 1.5 }),
      item({ ingredientId: 'lime', estimatedPrice: 2.0 }),
      item({ ingredientId: 'salt', estimatedPrice: 2.0, inPantry: true }),
    ]),
  ];

  it('starts at the full buyable total with nothing checked', () => {
    expect(remainingTotal(sections, new Set()).amount).toBe(3.5);
  });

  it('drops as items are checked off', () => {
    expect(remainingTotal(sections, new Set(['onion'])).amount).toBe(2.0);
    expect(remainingTotal(sections, new Set(['onion', 'lime'])).amount).toBe(0);
  });

  it('ignores checked ids that are not in the list', () => {
    expect(remainingTotal(sections, new Set(['ghost-id'])).amount).toBe(3.5);
  });
});

describe('checkoffProgress', () => {
  const sections = [
    section('Produce', [
      item({ ingredientId: 'onion' }),
      item({ ingredientId: 'lime' }),
      item({ ingredientId: 'salt', inPantry: true }),
    ]),
  ];

  it('counts pantry items out of the total', () => {
    expect(checkoffProgress(sections, new Set())).toEqual({ checked: 0, total: 2 });
  });

  it('reports N of M as items are checked', () => {
    expect(checkoffProgress(sections, new Set(['onion']))).toEqual({ checked: 1, total: 2 });
    expect(checkoffProgress(sections, new Set(['onion', 'lime']))).toEqual({
      checked: 2,
      total: 2,
    });
  });
});

describe('priceForItem', () => {
  it('uses the backend price when the server priced the item', () => {
    const priced = priceForItem(item({ estimatedPrice: 4.25 }), 'meat_seafood', 'Meat / Seafood');
    expect(priced).toEqual({ amount: 4.25, source: 'server' });
  });

  it('falls back to the labeled category estimate when there is no server price', () => {
    const priced = priceForItem(
      { ...item({ estimatedPrice: NaN }), displayName: 'Chicken Thighs' },
      'meat_seafood',
      'Meat / Seafood',
    );
    expect(priced.source).toBe('fallback-estimate');
    // Swift protein base 5.49 plus deterministic jitter under a dollar.
    expect(priced.amount).toBeGreaterThanOrEqual(5.49);
    expect(priced.amount).toBeLessThan(6.49);
  });

  it('keeps fallback prices stable for the same item name', () => {
    const unpriced = { ...item({ estimatedPrice: NaN }), displayName: 'Black Beans' };
    const first = priceForItem(unpriced, 'canned', 'Canned');
    const second = priceForItem(unpriced, 'canned', 'Canned');
    expect(first.amount).toBe(second.amount);
  });

  it('flags totals that used the fallback', () => {
    const total = estimatedTotal([
      section('Produce', [{ ...item({ ingredientId: 'mystery', estimatedPrice: NaN }) }]),
    ]);
    expect(total.usedFallback).toBe(true);
  });
});

describe('fallbackEstimate', () => {
  it('prices the Swift categories off their table bases', () => {
    expect(fallbackEstimate('produce', 'Produce', 'Apple')).toBeGreaterThanOrEqual(2.19);
    expect(fallbackEstimate('produce', 'Produce', 'Apple')).toBeLessThan(3.19);
    expect(fallbackEstimate('frozen', 'Frozen', 'Peas')).toBeGreaterThanOrEqual(3.99);
  });

  it('falls back to the "other" base for unknown aisles', () => {
    const amount = fallbackEstimate(null, 'Mystery Aisle', 'Gadget');
    expect(amount).toBeGreaterThanOrEqual(2.99);
    expect(amount).toBeLessThan(3.99);
  });
});

describe('displayQuantity', () => {
  it('prefers the package label over a bare number', () => {
    expect(displayQuantity(item({ packageLabel: '2 × 15 oz can' }))).toBe('2 × 15 oz can');
  });

  it('shows "qty unit" when both are known', () => {
    expect(displayQuantity(item({ neededQty: 2, unit: 'cups' }))).toBe('2 cups');
    expect(displayQuantity(item({ neededQty: 0.5, unit: 'cup' }))).toBe('0.5 cup');
  });

  it('shows nothing when the quantity or unit is missing', () => {
    expect(displayQuantity(item({ neededQty: 0, unit: 'cup' }))).toBeNull();
    expect(displayQuantity(item({ neededQty: 2, unit: '' }))).toBeNull();
  });
});
