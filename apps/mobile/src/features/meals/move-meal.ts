/**
 * Moving a meal between slots.
 *
 * Product requirement: "Moving a meal should modify the existing meal plan. It
 * should NOT require regenerating the entire meal plan."
 *
 * These are pure functions over the plan the backend returned. They power the
 * optimistic UI update while `MealPlanService.move` is in flight; the server's
 * response is still the source of truth when it arrives. Because a move only
 * reassigns slots, the grocery basket and every cost figure stay untouched —
 * this code never recomputes a price.
 */
import { sameSlot, type MealPlan, type MealSlot, type PlannedMeal } from '@/features/meals/meal-plan-model';

export type MoveOutcome =
  | { kind: 'moved'; meals: PlannedMeal[] }
  | { kind: 'swapped'; meals: PlannedMeal[] }
  | { kind: 'noop'; meals: PlannedMeal[] }
  | { kind: 'invalid'; reason: string; meals: PlannedMeal[] };

export interface MoveOptions {
  /**
   * Slots the plan is allowed to occupy. When provided, a move to a day beyond
   * the plan's length, or to a meal category the user never asked for, is
   * rejected instead of silently creating a slot.
   */
  allowedSlots?: MealSlot[];
}

const occupies = (meals: PlannedMeal[], slot: MealSlot): PlannedMeal | undefined =>
  meals.find((meal) => sameSlot(meal.slot, slot));

const isAllowed = (slot: MealSlot, allowed?: MealSlot[]): boolean =>
  !allowed || allowed.some((candidate) => sameSlot(candidate, slot));

/**
 * Moves the meal at `from` to `to`.
 *
 * - Empty target → the meal moves.
 * - Occupied target → the two meals exchange slots, so nothing is ever lost.
 */
export function moveMeal(
  meals: PlannedMeal[],
  from: MealSlot,
  to: MealSlot,
  options: MoveOptions = {},
): MoveOutcome {
  if (sameSlot(from, to)) return { kind: 'noop', meals };

  const source = occupies(meals, from);
  if (!source) {
    return { kind: 'invalid', reason: 'There is no meal in that slot.', meals };
  }

  if (!isAllowed(to, options.allowedSlots)) {
    return { kind: 'invalid', reason: "That slot isn't part of this meal plan.", meals };
  }

  const target = occupies(meals, to);

  if (!target) {
    return {
      kind: 'moved',
      meals: meals.map((meal) => (sameSlot(meal.slot, from) ? { ...meal, slot: to } : meal)),
    };
  }

  return {
    kind: 'swapped',
    meals: meals.map((meal) => {
      if (sameSlot(meal.slot, from)) return { ...meal, slot: to };
      if (sameSlot(meal.slot, to)) return { ...meal, slot: from };
      return meal;
    }),
  };
}

/**
 * Applies a move to a whole plan. Everything except `meals` is carried through
 * unchanged — the same recipes are still being bought, so the grocery list,
 * cost range and headroom are still correct.
 */
export function moveMealInPlan(
  plan: MealPlan,
  from: MealSlot,
  to: MealSlot,
  options: MoveOptions = {},
): { plan: MealPlan; outcome: MoveOutcome } {
  const outcome = moveMeal(plan.meals, from, to, options);
  if (outcome.kind === 'invalid' || outcome.kind === 'noop') {
    return { plan, outcome };
  }
  return { plan: { ...plan, meals: outcome.meals }, outcome };
}

/**
 * Every slot the user asked to have planned: day 1..days × the meal categories
 * they selected. Used to bound moves and to render empty slots.
 */
export function planSlots(days: number, mealTypes: MealSlot['mealType'][]): MealSlot[] {
  const slots: MealSlot[] = [];
  for (let day = 1; day <= days; day += 1) {
    for (const mealType of mealTypes) {
      slots.push({ day, mealType });
    }
  }
  return slots;
}

/** The categories this plan actually contains, in canonical order. */
export function mealTypesInPlan(meals: PlannedMeal[]): MealSlot['mealType'][] {
  const order: MealSlot['mealType'][] = ['breakfast', 'lunch', 'dinner', 'snack', 'side', 'dessert'];
  const present = new Set(meals.map((meal) => meal.slot.mealType));
  return order.filter((type) => present.has(type));
}

/** The number of days the plan covers. */
export function planDayCount(meals: PlannedMeal[]): number {
  return meals.reduce((max, meal) => Math.max(max, meal.slot.day), 0);
}
