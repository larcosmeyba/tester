/**
 * Expiring-first pantry prioritization for Cook What I Have (Audit Section 5).
 *
 * Pure logic, no UI: active pantry items are resolved to canonical ingredient
 * ids, then ordered by days-until-expiry ascending so the things that need
 * using first drive the generation request.
 *
 * The pantry query does not select a canonical ingredientId (backend gap —
 * Slice 4 left the same TODO), so names are matched against the ingredient
 * catalog here. Matching is deliberately conservative: every word of the
 * catalog display name must appear as a whole word in the pantry item name
 * ("2% milk" matches "Milk"; "chicken" does NOT match "Chicken Thigh"). The
 * backend's own inPantry parent-matching applies the same direction of
 * leniency when it scores the plan.
 */

import { daysUntilExpiry, itemsMatching, type PantryItem } from '@/features/pantry/pantry-model';
import type { IngredientCatalog } from '@/features/meals/ingredient-model';

export type PrioritizedPantryItem = {
  /** Canonical ingredient id for the generate request. */
  ingredientId: string;
  /** Display name from the catalog. */
  displayName: string;
  /** The pantry row it came from. */
  pantryItem: PantryItem;
  /** Negative once lapsed. Drives the ordering. */
  daysUntilExpiry: number;
};

export type PrioritizedPantry = {
  /** Ingredient ids, expiring-first. This order is what the request sends. */
  ingredientIds: string[];
  /** Row-level detail in the same order, for the "You already have…" UI. */
  detail: PrioritizedPantryItem[];
  /** Active items no catalog entry matched — shown, never sent. */
  unresolved: PantryItem[];
};

/** Lowercase words, parenthetical qualifiers ("(bag)") and punctuation stripped, light plural stemming. */
function wordsOf(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 0)
    .map((word) =>
      word.length > 3 && word.endsWith('s') && !word.endsWith('ss') ? word.slice(0, -1) : word,
    );
}

/**
 * The catalog entry whose every display-name word appears in the pantry
 * name. Longest display name wins ties ("olive oil" beats "oil").
 */
function resolveIngredientId(name: string, catalog: IngredientCatalog): { ingredientId: string; displayName: string } | null {
  const pantryWords = new Set(wordsOf(name));
  if (pantryWords.size === 0) return null;
  let best: { ingredientId: string; displayName: string } | null = null;
  for (const ingredient of catalog.all) {
    const catalogWords = wordsOf(ingredient.displayName);
    if (catalogWords.length === 0) continue;
    const covered = catalogWords.every((word) => pantryWords.has(word));
    if (!covered) continue;
    if (!best || ingredient.displayName.length > best.displayName.length) {
      best = { ingredientId: ingredient.ingredientId, displayName: ingredient.displayName };
    }
  }
  return best;
}

/**
 * The word set behind a prioritization — for have/need badges on recipe
 * lines. A line is "have" when its canonical id was prioritized, or when
 * every word of its name is covered by pantry words.
 */
export function pantryWordSet(detail: PrioritizedPantryItem[]): Set<string> {
  const words = new Set<string>();
  for (const item of detail) {
    for (const word of wordsOf(item.pantryItem.name)) words.add(word);
    for (const word of wordsOf(item.displayName)) words.add(word);
  }
  return words;
}

export function pantryCoversIngredient(name: string, pantryWords: Set<string>): boolean {
  const lineWords = wordsOf(name);
  return lineWords.length > 0 && lineWords.every((word) => pantryWords.has(word));
}

export function prioritizePantryForCooking(
  items: PantryItem[],
  catalog: IngredientCatalog,
  now: Date = new Date(),
): PrioritizedPantry {
  const detail: PrioritizedPantryItem[] = [];
  const unresolved: PantryItem[] = [];

  for (const pantryItem of itemsMatching(items, 'active')) {
    const resolved = resolveIngredientId(pantryItem.name, catalog);
    if (!resolved) {
      unresolved.push(pantryItem);
      continue;
    }
    detail.push({
      ingredientId: resolved.ingredientId,
      displayName: resolved.displayName,
      pantryItem,
      daysUntilExpiry: daysUntilExpiry(pantryItem, now),
    });
  }

  // Expiring first; already-lapsed sorts before everything; ties by name so
  // the order is stable between renders.
  detail.sort(
    (a, b) => a.daysUntilExpiry - b.daysUntilExpiry || a.displayName.localeCompare(b.displayName),
  );

  // One id per pantry row would double-count duplicates; the request wants a
  // set of what the household has, ordered by urgency.
  const seen = new Set<string>();
  const ingredientIds = detail
    .map((item) => item.ingredientId)
    .filter((id) => (seen.has(id) ? false : (seen.add(id), true)));

  return { ingredientIds, detail, unresolved };
}
