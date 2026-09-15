/**
 * Grocery checklist logic — Swift `PlanGroceryListView` rebuild.
 *
 * Pure helpers shared by the grocery choice screen ("Your grocery list") and
 * the shopping checklist ("Shop on My Own"):
 *  - list consolidation ("Everything for the week, combined — no duplicates.")
 *  - estimated totals and the remaining-to-buy math
 *  - check-off counting ("N of M items checked off")
 *  - the clearly-labeled last-resort price fallback
 *
 * Pricing rule: the backend is the real price source. Every item the backend
 * priced carries a finite `estimatedPrice`, and that is the number shown —
 * always labeled "Estimated", because prices and availability can change. The
 * Swift `KrogerPricing` category table is kept ONLY as a fallback for items
 * with no server price, and the fallback is labeled as such in the UI.
 */
import type { Aisle } from '@/features/meals/meal-enums';
import type { GroceryItem, GrocerySection } from '@/features/meals/meal-plan-model';

/** Where a displayed price came from — never present a fallback as a live price. */
export type PriceSource = 'server' | 'fallback-estimate';

export interface PricedAmount {
  amount: number;
  source: PriceSource;
}

/** A grocery section with duplicates merged, ready to render. */
export interface ChecklistSection {
  aisleLabel: string;
  aisle: Aisle | null;
  items: GroceryItem[];
}

// ---------------------------------------------------------------------------
// Consolidation ("no duplicates")
// ---------------------------------------------------------------------------

/**
 * Merges rows that share an `ingredientId` into one line: quantities and
 * prices sum, `usedBy` unions, and a pantry flag on any row covers them all.
 * The backend already consolidates, so this is the client-side guarantee the
 * Swift screen promises ("Everything for the week, combined — no duplicates.").
 */
export function dedupeGroceryItems(items: GroceryItem[]): GroceryItem[] {
  const merged = new Map<string, GroceryItem>();
  for (const item of items) {
    const existing = merged.get(item.ingredientId);
    if (!existing) {
      merged.set(item.ingredientId, item);
      continue;
    }
    const packages =
      existing.packages !== null || item.packages !== null
        ? (existing.packages ?? 0) + (item.packages ?? 0)
        : null;
    merged.set(item.ingredientId, {
      ...existing,
      neededQty: existing.neededQty + item.neededQty,
      estimatedPrice: existing.estimatedPrice + item.estimatedPrice,
      packages,
      usedBy: [...new Set([...existing.usedBy, ...item.usedBy])],
      inPantry: existing.inPantry || item.inPantry,
    });
  }
  return [...merged.values()];
}

/**
 * Sections with duplicate rows merged, preserving the backend's section
 * order. Empty sections drop out so the UI never renders a bare heading.
 */
export function checklistSections(sections: GrocerySection[]): ChecklistSection[] {
  return sections
    .map((section) => ({
      aisleLabel: section.aisleLabel,
      aisle: section.aisle,
      items: dedupeGroceryItems(section.items),
    }))
    .filter((section) => section.items.length > 0);
}

/** All items across every section, deduplicated (for totals and counting). */
export function allChecklistItems(sections: GrocerySection[]): GroceryItem[] {
  return dedupeGroceryItems(sections.flatMap((section) => section.items));
}

// ---------------------------------------------------------------------------
// Prices
// ---------------------------------------------------------------------------

type SwiftCategory =
  | 'protein'
  | 'dairy'
  | 'produce'
  | 'grains'
  | 'frozen'
  | 'cannedGoods'
  | 'condiments'
  | 'beverages'
  | 'snacks'
  | 'other';

/** The Swift `KrogerPricing` category table — fallback only, never the plan. */
const CATEGORY_BASE_PRICE: Record<SwiftCategory, number> = {
  protein: 5.49,
  dairy: 3.29,
  produce: 2.19,
  grains: 2.79,
  frozen: 3.99,
  cannedGoods: 1.69,
  condiments: 2.49,
  beverages: 2.99,
  snacks: 3.49,
  other: 2.99,
};

function categoryFor(aisle: Aisle | null, aisleLabel: string): SwiftCategory {
  switch (aisle) {
    case 'produce':
      return 'produce';
    case 'meat_seafood':
      return 'protein';
    case 'dairy_refrigerated':
      return 'dairy';
    case 'pantry':
    case 'bakery':
      return 'grains';
    case 'canned':
      return 'cannedGoods';
    case 'frozen':
      return 'frozen';
    case 'spice':
      return 'condiments';
    case 'other':
    case null:
    case undefined:
      break;
  }
  const label = aisleLabel.toLowerCase();
  if (label.includes('beverage') || label.includes('drink')) return 'beverages';
  if (label.includes('snack')) return 'snacks';
  if (label.includes('condiment') || label.includes('sauce') || label.includes('spice'))
    return 'condiments';
  if (label.includes('meat') || label.includes('seafood') || label.includes('protein'))
    return 'protein';
  if (label.includes('dairy') || label.includes('cheese') || label.includes('milk')) return 'dairy';
  if (label.includes('produce') || label.includes('fruit') || label.includes('vegetable'))
    return 'produce';
  if (label.includes('frozen')) return 'frozen';
  if (label.includes('can')) return 'cannedGoods';
  return 'other';
}

/** Stable per-name hash so fallback prices look real but stay stable. */
function nameHash(name: string): number {
  let hash = 5381;
  for (let i = 0; i < name.length; i += 1) {
    hash = (hash * 33) ^ name.charCodeAt(i);
  }
  return Math.abs(hash);
}

/**
 * Last-resort estimate from the Swift category table, with deterministic
 * per-item jitter — only for items the backend left unpriced.
 */
export function fallbackEstimate(
  aisle: Aisle | null,
  aisleLabel: string,
  displayName: string,
): number {
  const base = CATEGORY_BASE_PRICE[categoryFor(aisle, aisleLabel)];
  const jitter = (nameHash(displayName) % 100) / 100;
  return Math.round((base + jitter) * 100) / 100;
}

function sectionLookup(
  sections: GrocerySection[],
): Map<string, { aisle: Aisle | null; aisleLabel: string }> {
  const lookup = new Map<string, { aisle: Aisle | null; aisleLabel: string }>();
  for (const section of sections) {
    for (const item of section.items) {
      if (!lookup.has(item.ingredientId)) {
        lookup.set(item.ingredientId, { aisle: section.aisle, aisleLabel: section.aisleLabel });
      }
    }
  }
  return lookup;
}

/**
 * The price to show for one item: the backend's number when it exists, the
 * labeled fallback otherwise. Every amount is displayed as an estimate.
 */
export function priceForItem(
  item: GroceryItem,
  aisle: Aisle | null,
  aisleLabel: string,
): PricedAmount {
  if (Number.isFinite(item.estimatedPrice)) {
    return { amount: item.estimatedPrice, source: 'server' };
  }
  return { amount: fallbackEstimate(aisle, aisleLabel, item.displayName), source: 'fallback-estimate' };
}

export interface PricedTotal {
  amount: number;
  /** True when any line fell back to the category estimate. */
  usedFallback: boolean;
}

/**
 * "Estimated total" across every buyable item (pantry items cost $0 — they
 * are already in the kitchen). Duplicates merge first so nothing is
 * double-counted.
 */
export function estimatedTotal(sections: GrocerySection[]): PricedTotal {
  return sumPriced(sections, (item) => !item.inPantry);
}

/**
 * "Left to buy" — the Swift checklist math: buyable items that are not
 * checked off yet.
 */
export function remainingTotal(
  sections: GrocerySection[],
  checkedIds: ReadonlySet<string>,
): PricedTotal {
  return sumPriced(
    sections,
    (item) => !item.inPantry && !checkedIds.has(item.ingredientId),
  );
}

function sumPriced(
  sections: GrocerySection[],
  keep: (item: GroceryItem) => boolean,
): PricedTotal {
  const lookup = sectionLookup(sections);
  let amount = 0;
  let usedFallback = false;
  for (const item of allChecklistItems(sections)) {
    if (!keep(item)) continue;
    const section = lookup.get(item.ingredientId);
    const priced = priceForItem(item, section?.aisle ?? null, section?.aisleLabel ?? '');
    amount += priced.amount;
    if (priced.source === 'fallback-estimate') usedFallback = true;
  }
  return { amount: Math.round(amount * 100) / 100, usedFallback };
}

// ---------------------------------------------------------------------------
// Check-off counting
// ---------------------------------------------------------------------------

export interface CheckoffProgress {
  /** Buyable items checked off. */
  checked: number;
  /** Buyable items — pantry items are owned, not shopped for. */
  total: number;
}

/** "N of M items checked off" from the Swift checklist header. */
export function checkoffProgress(
  sections: GrocerySection[],
  checkedIds: ReadonlySet<string>,
): CheckoffProgress {
  const items = allChecklistItems(sections).filter((item) => !item.inPantry);
  return {
    checked: items.filter((item) => checkedIds.has(item.ingredientId)).length,
    total: items.length,
  };
}

/**
 * The quantity line under an item name. Prefers the package label ("2 × 15 oz
 * can"); falls back to "qty unit" only when both are known, like the Swift
 * screen (quantity > 0 and a non-empty unit).
 */
export function displayQuantity(item: GroceryItem): string | null {
  if (item.packageLabel) return item.packageLabel;
  if (item.neededQty > 0 && item.unit.trim() !== '') {
    const whole = Number.isInteger(item.neededQty) ? String(item.neededQty) : String(item.neededQty);
    return `${whole} ${item.unit}`;
  }
  return null;
}
