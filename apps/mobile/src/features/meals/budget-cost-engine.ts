/**
 * Budget cost engine (product rule: the 7-day plan must fit the Q14 range).
 *
 * Given candidate recipes with per-serving costs, builds the cheapest
 * breakfast/lunch/dinner-only 7-day plan for the full household — children
 * count as full servings — and checks the total against the selected budget
 * range.
 *
 * When even the cheapest plan overshoots the range, the engine still returns
 * that closest plan, but marks it infeasible with an honest note and surfaces
 * cheaper options plus nearby food resources instead of pretending it fits.
 */
import {
  budgetRangeBounds,
  type BudgetRangeBounds,
  type BudgetRangeKey,
} from '@/features/meals/meal-plan-model';

export type BudgetMealType = 'breakfast' | 'lunch' | 'dinner';

export interface BudgetRecipe {
  recipeId: string;
  title: string;
  mealType: BudgetMealType;
  /** Estimated cost per serving, USD. */
  costPerServingUsd: number;
}

export interface NearbyFoodResource {
  id: string;
  name: string;
  tag: string;
  distance?: string;
}

export interface BudgetPlanInput {
  recipes: BudgetRecipe[];
  /** Total servings per meal — children already counted as full servings. */
  householdSize: number;
  /** Breakfast/lunch/dinner the plan must cover. Snacks are never planned. */
  mealTypes: BudgetMealType[];
  days?: number;
  budgetRange: BudgetRangeKey;
  /** Shown only when the range is infeasible. */
  nearbyResources?: NearbyFoodResource[];
}

export interface BudgetAssignment {
  day: number;
  mealType: BudgetMealType;
  recipeId: string;
  title: string;
  /** costPerServing × householdSize, rounded to cents. */
  costUsd: number;
}

export interface BudgetPlanResult {
  feasible: boolean;
  assignments: BudgetAssignment[];
  totalCostUsd: number;
  range: BudgetRangeBounds;
  /** Honest explanation when the cheapest plan still misses the range. */
  note: string | null;
  /** Cheapest recipes per meal type — the "eat cheaper" lever. */
  cheapestOptions: BudgetRecipe[];
  /** Nearby food resources, surfaced only when infeasible. */
  resources: NearbyFoodResource[];
}

const round2 = (value: number): number => Math.round(value * 100) / 100;

/**
 * Builds the cheapest possible plan: for every day × meal type, the cheapest
 * candidate of that type. Deterministic — same inputs, same plan.
 */
export function planWithinBudget(input: BudgetPlanInput): BudgetPlanResult {
  const days = input.days ?? 7;
  const householdSize = Math.max(1, Math.floor(input.householdSize));
  const range = budgetRangeBounds(input.budgetRange);

  const cheapestByType = new Map<BudgetMealType, BudgetRecipe>();
  for (const mealType of input.mealTypes) {
    const candidates = input.recipes
      .filter((recipe) => recipe.mealType === mealType)
      .sort((a, b) => a.costPerServingUsd - b.costPerServingUsd);
    if (candidates[0]) cheapestByType.set(mealType, candidates[0]);
  }

  const assignments: BudgetAssignment[] = [];
  for (let day = 1; day <= days; day += 1) {
    for (const mealType of input.mealTypes) {
      const recipe = cheapestByType.get(mealType);
      if (!recipe) continue;
      assignments.push({
        day,
        mealType,
        recipeId: recipe.recipeId,
        title: recipe.title,
        costUsd: round2(recipe.costPerServingUsd * householdSize),
      });
    }
  }

  const totalCostUsd = round2(assignments.reduce((sum, item) => sum + item.costUsd, 0));
  const maxCents = range.maxCents ?? Number.POSITIVE_INFINITY;
  const minCents = range.minCents ?? 0;
  const feasible =
    assignments.length > 0 && totalCostUsd * 100 >= minCents && totalCostUsd * 100 <= maxCents;

  const cheapestOptions = [...cheapestByType.values()];
  const resources = feasible ? [] : (input.nearbyResources ?? []);

  let note: string | null = null;
  if (!feasible) {
    if (assignments.length === 0) {
      note =
        'We couldn\u2019t build a plan from these recipes — add breakfast, lunch or dinner options and try again.';
    } else {
      const overBy = round2(totalCostUsd - maxCents / 100);
      note =
        `Even the cheapest combination we can build costs about $${totalCostUsd.toFixed(2)} ` +
        `for the week — $${overBy.toFixed(2)} over your budget. This is the closest plan; ` +
        `swapping in cheaper recipes, cooking bigger batches, or using pantry staples can bring it down.`;
    }
  }

  return { feasible, assignments, totalCostUsd, range, note, cheapestOptions, resources };
}
