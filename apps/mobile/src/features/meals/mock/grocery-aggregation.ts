/**
 * DEVELOPMENT ONLY — a port of the spec's consolidation engine (Doc 03 §7–§10),
 * used by the mock backend so the app can be built and tested end to end.
 *
 * In production this arithmetic happens on the server. It lives in the mock
 * layer precisely so nobody mistakes it for the client doing pricing.
 */
import { AISLE_ORDER, aisleLabel, type Aisle } from '@/features/meals/meal-enums';
import type { CostRange, GroceryItem, GroceryList } from '@/features/meals/meal-plan-model';
import { purchasableLines, type Recipe } from '@/features/meals/recipe-model';
import { resolvePrice, seedCatalog } from '@/features/meals/mock/seed-data';

const round2 = (value: number): number => Math.round(value * 100) / 100;

/**
 * A cost range from a point estimate (Doc 03 §10). Wider bands at lower
 * confidence — the app never shows a single number as if it were exact.
 */
export function costRangeFrom(point: number, confidence: CostRange['confidence']): CostRange {
  const spread = { high: [0.96, 1.06], medium: [0.92, 1.12], low: [0.85, 1.15] } as const;
  const [lowFactor, highFactor] = spread[confidence];
  return {
    point: round2(point),
    low: Math.round(point * lowFactor),
    high: Math.round(point * highFactor),
    confidence,
    tierMix: null,
    basis: 'national average prices',
  };
}

export interface Basket {
  items: GroceryItem[];
  checkoutCost: CostRange;
  unpricedIngredientIds: string[];
}

/**
 * Aggregates ingredient need across recipes, subtracts the pantry, rounds up to
 * whole store packages (two recipes needing 8 oz of salsa each buy ONE 16 oz
 * jar), and prices the result.
 */
export function buildBasket(
  recipes: Recipe[],
  pantry: ReadonlySet<string>,
  scaleFactors: Map<string, number> = new Map(),
): Basket {
  // 1. Aggregate need per canonical ingredient, in its price reference unit.
  const need = new Map<string, number>();
  const usedBy = new Map<string, string[]>();

  for (const recipe of recipes) {
    const factor = scaleFactors.get(recipe.recipeId) ?? 1;
    for (const line of purchasableLines(recipe)) {
      const { ingredientId, quantity } = line;
      // A line the source never quantified cannot be bought — the spec forbids
      // inventing the number, so it is skipped, not guessed.
      if (!ingredientId || quantity === null) continue;
      need.set(ingredientId, (need.get(ingredientId) ?? 0) + quantity * factor);
      const users = usedBy.get(ingredientId) ?? [];
      if (!users.includes(recipe.recipeId)) users.push(recipe.recipeId);
      usedBy.set(ingredientId, users);
    }
  }

  // 2. Pantry subtraction, package rounding, pricing.
  const items: GroceryItem[] = [];
  const unpricedIngredientIds: string[] = [];
  const tierDollars = new Map<number, number>();
  let checkoutTotal = 0;

  for (const [ingredientId, quantity] of need) {
    const ingredient = seedCatalog.get(ingredientId);
    if (!ingredient) continue;

    const owned = seedCatalog.inPantry(ingredientId, pantry);
    const price = resolvePrice(ingredientId);

    let packages: number | null = null;
    let packageLabel: string | null = null;
    let lineCost = 0;

    if (!owned) {
      if (price) {
        if (price.divisible) {
          // Loose goods: buy what's needed, rounded up to a quarter unit.
          const buyQty = Math.ceil(quantity / 0.25) * 0.25;
          lineCost = buyQty * price.unitPrice;
        } else {
          const count = Math.max(1, Math.ceil(quantity / price.packageSize));
          packages = count;
          lineCost = count * price.packagePrice;
          const size = Number.isInteger(price.packageSize)
            ? String(price.packageSize)
            : price.packageSize.toFixed(2);
          packageLabel = `${count} × ${size} ${ingredient.priceReferenceUnit}`;
        }
        checkoutTotal += lineCost;
        tierDollars.set(price.tier, (tierDollars.get(price.tier) ?? 0) + lineCost);
      } else {
        unpricedIngredientIds.push(ingredientId);
      }
    }

    items.push({
      ingredientId,
      displayName: ingredient.displayName,
      neededQty: round2(quantity),
      unit: ingredient.priceReferenceUnit,
      packages,
      packageLabel,
      estimatedPrice: round2(lineCost),
      priceTier: price?.tier ?? null,
      inPantry: owned,
      usedBy: usedBy.get(ingredientId) ?? [],
    });
  }

  // 3. Confidence from the tier mix (Doc 03 §10).
  let confidence: CostRange['confidence'] = 'low';
  if (checkoutTotal > 0) {
    const t1 = (tierDollars.get(1) ?? 0) / checkoutTotal;
    const t2 = (tierDollars.get(2) ?? 0) / checkoutTotal;
    if (t1 >= 0.8) confidence = 'high';
    else if (t1 + t2 >= 0.7) confidence = 'medium';
  }

  return {
    items: items.sort((a, b) => b.estimatedPrice - a.estimatedPrice),
    checkoutCost: costRangeFrom(checkoutTotal, confidence),
    unpricedIngredientIds,
  };
}

/** Groups a basket into store sections in the spec's aisle order (Doc 03 §9). */
export function groupByAisle(items: GroceryItem[]): GroceryList {
  const grouped = new Map<Aisle, GroceryItem[]>();
  for (const item of items) {
    const aisle = seedCatalog.get(item.ingredientId)?.aisle ?? 'other';
    const bucket = grouped.get(aisle) ?? [];
    bucket.push(item);
    grouped.set(aisle, bucket);
  }

  return AISLE_ORDER.flatMap((aisle) => {
    const sectionItems = grouped.get(aisle);
    if (!sectionItems || sectionItems.length === 0) return [];
    return [{ aisle, aisleLabel: aisleLabel(aisle), items: sectionItems }];
  });
}

/**
 * Household scaling (Doc 03 §2). A recipe that serves 4 is left alone for a
 * household of 4 and doubled for 8. Non-scalable recipes are never scaled.
 */
export function scaleFactorsFor(recipes: Recipe[], householdSize: number): Map<string, number> {
  const factors = new Map<string, number>();
  for (const recipe of recipes) {
    if (!recipe.scalable || !recipe.servings || recipe.servings <= 0) {
      factors.set(recipe.recipeId, 1);
      continue;
    }
    // Quarter-step scaling keeps quantities shoppable.
    const raw = householdSize / recipe.servings;
    factors.set(recipe.recipeId, Math.max(0.5, Math.round(raw * 4) / 4));
  }
  return factors;
}
