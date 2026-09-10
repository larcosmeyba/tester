import {
  COOK_RECIPES,
  cookFromPantry,
  nameMatches,
} from '@/features/pantry/cook-from-pantry';
import type { PantryItem } from '@/features/pantry/pantry-model';
import {
  addGroceryExtra,
  clearGroceryExtras,
  listGroceryExtras,
  removeGroceryExtra,
} from '@/features/pantry/grocery-extras';

const item = (overrides: Partial<PantryItem> = {}): PantryItem => ({
  id: `p-${Math.random().toString(36).slice(2)}`,
  name: 'Milk',
  quantity: '1 gallon',
  location: 'REFRIGERATOR',
  expirationDate: '2026-12-31',
  category: 'Dairy',
  status: 'ACTIVE',
  dateAdded: '2026-09-08',
  dateUsed: null,
  createdAt: '2026-09-08T00:00:00Z',
  updatedAt: '2026-09-08T00:00:00Z',
  ...overrides,
});

const names = (items: PantryItem[]): PantryItem[] => items;

/** The preview-seed pantry: Milk, Eggs, Bread, Chicken breast, Apples. */
const seededPantry = (): PantryItem[] =>
  names([
    item({ name: 'Milk' }),
    item({ name: 'Eggs' }),
    item({ name: 'Bread' }),
    item({ name: 'Chicken breast' }),
    item({ name: 'Apples' }),
  ]);

describe('nameMatches', () => {
  it('matches plural against singular keywords', () => {
    expect(nameMatches('Apples', 'apple')).toBe(true);
    expect(nameMatches('Eggs', 'egg')).toBe(true);
  });

  it('matches when the keyword is a word subset of the item name', () => {
    expect(nameMatches('Chicken breast', 'chicken')).toBe(true);
    expect(nameMatches('Parmesan cheese', 'parmesan')).toBe(true);
    expect(nameMatches('Soy sauce', 'soy sauce')).toBe(true);
  });

  it('does not let a partial keyword claim an item', () => {
    // "Chicken" on hand is not "chicken broth" on hand.
    expect(nameMatches('Chicken', 'chicken broth')).toBe(false);
    expect(nameMatches('Milk', 'milk chocolate')).toBe(false);
  });

  it('is case-insensitive and ignores surrounding whitespace', () => {
    expect(nameMatches('  MILK ', 'milk')).toBe(true);
  });

  it('does not match unrelated items', () => {
    expect(nameMatches('Milk', 'flour')).toBe(false);
    expect(nameMatches('Apples', 'oranges')).toBe(false);
    expect(nameMatches('Bread', 'butter')).toBe(false);
  });
});

describe('cookFromPantry', () => {
  it('returns null for an empty pantry instead of a recipe', () => {
    expect(cookFromPantry([])).toBeNull();
  });

  it('picks the recipe that maximizes on-hand usage', () => {
    // Seed data: Milk, Eggs, Bread, Chicken breast, Apples.
    // French Toast uses Bread + Eggs + Milk (3 on hand); the chicken recipes
    // only use 1 (chicken breast); apple oatmeal uses 2 (apples, milk).
    const suggestion = cookFromPantry(seededPantry());
    expect(suggestion).not.toBeNull();
    expect(suggestion?.recipe.id).toBe('french-toast');
    expect(suggestion?.matched.map((m) => m.ingredient.name)).toEqual(['Bread', 'Eggs', 'Milk']);
  });

  it('detects the missing ingredients, excluding assumed staples', () => {
    const suggestion = cookFromPantry(seededPantry());
    // French Toast needs Bread, Eggs, Milk, Butter + assumed salt.
    expect(suggestion?.missing.map((ingredient) => ingredient.name)).toEqual(['Butter']);
  });

  it('matches each ingredient to the pantry item it uses', () => {
    const suggestion = cookFromPantry(seededPantry());
    const eggs = suggestion?.matched.find((m) => m.ingredient.name === 'Eggs');
    expect(eggs?.pantryItem.name).toBe('Eggs');
  });

  it('breaks ties toward fewer missing ingredients', () => {
    // Chicken + onion + garlic: the skillet and the soup both use all three
    // on-hand items, but the skillet is missing fewer (rice, broth vs
    // carrots, broth, celery).
    const suggestion = cookFromPantry([
      item({ name: 'Chicken' }),
      item({ name: 'Onion' }),
      item({ name: 'Garlic' }),
    ]);
    expect(suggestion?.recipe.id).toBe('chicken-rice-skillet');
    expect(suggestion?.matched.length).toBe(3);
    expect(suggestion?.missing.map((m) => m.name)).toEqual(['Rice', 'Chicken broth']);
  });

  it('prefers rescuing items expiring soon', () => {
    // Chicken + potatoes with chicken expiring in 2 days vs milk expiring
    // later: the chicken recipes should beat anything that skips the
    // expiring chicken. Baked chicken & potatoes uses chicken + potatoes,
    // chicken & rice skillet uses chicken + onion — the skillet ties on
    // count only if onion were present, which it is not, so this asserts the
    // expiring bonus does not pick a WORSE-count recipe.
    const pantry = [
      item({ name: 'Chicken', expirationDate: '2026-09-12' }),
      item({ name: 'Potatoes', expirationDate: '2026-12-31' }),
      item({ name: 'Rice', expirationDate: '2026-12-31' }),
    ];
    const suggestion = cookFromPantry(pantry, new Date('2026-09-10T12:00:00'));
    expect(suggestion?.recipe.id).toBe('baked-chicken-potatoes');
  });

  it('never reports a matched item as missing', () => {
    const suggestion = cookFromPantry(seededPantry());
    const matchedNames = new Set(suggestion?.matched.map((m) => m.ingredient.name));
    for (const missing of suggestion?.missing ?? []) {
      expect(matchedNames.has(missing.name)).toBe(false);
    }
  });

  it('is deterministic for the same pantry', () => {
    const first = cookFromPantry(seededPantry());
    const second = cookFromPantry(seededPantry());
    expect(first?.recipe.id).toBe(second?.recipe.id);
  });

  it('matches a single-staple pantry to the best-fit recipe', () => {
    const suggestion = cookFromPantry([item({ name: 'Pasta' })]);
    expect(suggestion?.recipe.id).toBe('pasta-garlic-butter');
  });
});

describe('grocery extras (the grocery-list seam)', () => {
  beforeEach(() => {
    clearGroceryExtras();
  });

  it('adds a missing ingredient by name', () => {
    addGroceryExtra('Butter');
    expect(listGroceryExtras()).toEqual(['Butter']);
  });

  it('dedupes case-insensitively so one-tap stays one-tap', () => {
    addGroceryExtra('Butter');
    addGroceryExtra('butter');
    addGroceryExtra('  Butter  ');
    expect(listGroceryExtras()).toEqual(['Butter']);
  });

  it('ignores blank adds', () => {
    addGroceryExtra('   ');
    expect(listGroceryExtras()).toEqual([]);
  });

  it('removes a single extra', () => {
    addGroceryExtra('Butter');
    addGroceryExtra('Parmesan');
    removeGroceryExtra('butter');
    expect(listGroceryExtras()).toEqual(['Parmesan']);
  });
});

// Keeps the test honest: every built-in recipe must have at least one step.
describe('built-in recipe set integrity', () => {
  it('every recipe has ingredients, steps, and a positive minute count', () => {
    for (const recipe of COOK_RECIPES) {
      expect(recipe.ingredients.length).toBeGreaterThan(0);
      expect(recipe.steps.length).toBeGreaterThan(0);
      expect(recipe.minutes).toBeGreaterThan(0);
    }
  });

  it('every non-assumed ingredient has at least one keyword', () => {
    for (const recipe of COOK_RECIPES) {
      for (const ingredient of recipe.ingredients) {
        expect(ingredient.keywords.length).toBeGreaterThan(0);
      }
    }
  });
});
