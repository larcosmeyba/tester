/**
 * Cook What I Have — expiring-first pantry prioritization (Audit Section 5).
 *
 * Uses the real seed ingredient catalog: the matching is conservative
 * whole-word coverage, so these tests pin the exact ids the catalog resolves.
 */
import {
  pantryCoversIngredient,
  pantryWordSet,
  prioritizePantryForCooking,
} from '@/features/meals/cook-pantry-priority';
import { seedCatalog } from '@/features/meals/mock/seed-data';
import type { PantryItem } from '@/features/pantry/pantry-model';

// Local noon, not a UTC instant: expiry math reasons in local calendar days.
const now = new Date(2026, 8, 10, 12, 0, 0);

const item = (overrides: Partial<PantryItem> = {}): PantryItem => ({
  id: 'p1',
  name: 'Milk',
  quantity: '1 gallon',
  location: 'REFRIGERATOR',
  expirationDate: '2026-09-15',
  category: 'Dairy',
  status: 'ACTIVE',
  dateAdded: '2026-09-08',
  dateUsed: null,
  createdAt: '2026-09-08T00:00:00Z',
  updatedAt: '2026-09-08T00:00:00Z',
  ...overrides,
});

describe('expiring-first ordering', () => {
  const items = [
    item({ id: 'eggs', name: 'Large eggs', expirationDate: '2026-09-20' }), // 10d
    item({ id: 'spinach', name: 'Fresh Spinach', expirationDate: '2026-09-11' }), // 1d
    item({ id: 'milk', name: '2% milk', expirationDate: '2026-09-15' }), // 5d
  ];

  it('orders ingredient ids soonest-to-expire first', () => {
    const result = prioritizePantryForCooking(items, seedCatalog, now);
    expect(result.ingredientIds).toEqual(['spinach_fresh', 'milk', 'eggs']);
  });

  it('carries the per-row detail in the same order', () => {
    const result = prioritizePantryForCooking(items, seedCatalog, now);
    expect(result.detail.map((d) => d.daysUntilExpiry)).toEqual([1, 5, 10]);
    expect(result.detail[0]?.pantryItem.id).toBe('spinach');
  });
});

describe('conservative name matching', () => {
  it('matches "2% milk" to Milk, not Coconut Milk', () => {
    const result = prioritizePantryForCooking([item({ name: '2% milk' })], seedCatalog, now);
    expect(result.ingredientIds).toEqual(['milk']);
  });

  it('prefers the longest display name ("Chicken Breast" over "Chicken")', () => {
    const result = prioritizePantryForCooking([item({ name: 'chicken breast' })], seedCatalog, now);
    expect(result.ingredientIds).toEqual(['chicken_breast']);
  });

  it('does not match "chicken" to Chicken Thighs (thighs is not in the name)', () => {
    const result = prioritizePantryForCooking([item({ name: 'chicken' })], seedCatalog, now);
    expect(result.ingredientIds).toEqual(['chicken']);
  });

  it('lists unmatchable items as unresolved, never sending them', () => {
    const result = prioritizePantryForCooking(
      [item({ id: 'soda', name: 'Dragonfruit soda' }), item({ id: 'milk', name: 'milk' })],
      seedCatalog,
      now,
    );
    expect(result.ingredientIds).toEqual(['milk']);
    expect(result.unresolved.map((i) => i.id)).toEqual(['soda']);
  });

  it('ignores used and expired rows — only active items cook', () => {
    const result = prioritizePantryForCooking(
      [
        item({ id: 'used', name: 'milk', status: 'USED' }),
        item({ id: 'expired', name: 'eggs', status: 'EXPIRED' }),
        item({ id: 'active', name: 'milk', status: 'ACTIVE' }),
      ],
      seedCatalog,
      now,
    );
    expect(result.ingredientIds).toEqual(['milk']);
    expect(result.detail).toHaveLength(1);
  });

  it('dedupes duplicate pantry rows to one ingredient id', () => {
    const result = prioritizePantryForCooking(
      [item({ id: 'a', name: 'milk' }), item({ id: 'b', name: 'whole milk' })],
      seedCatalog,
      now,
    );
    expect(result.ingredientIds).toEqual(['milk']);
  });
});

describe('pantry word coverage for have/need badges', () => {
  const words = pantryWordSet(
    prioritizePantryForCooking(
      [item({ name: 'chicken breast' }), item({ name: 'olive oil' })],
      seedCatalog,
      now,
    ).detail,
  );

  it('covers lines whose every word is in the pantry', () => {
    expect(pantryCoversIngredient('Chicken Breast', words)).toBe(true);
    expect(pantryCoversIngredient('olive oil', words)).toBe(true);
  });

  it('does not cover lines with words the pantry lacks', () => {
    expect(pantryCoversIngredient('Chicken Thighs', words)).toBe(false);
    expect(pantryCoversIngredient('Butter', words)).toBe(false);
  });
});
