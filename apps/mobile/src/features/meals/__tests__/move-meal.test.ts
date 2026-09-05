/**
 * Meal movement.
 *
 * The product requirement is explicit: moving a meal modifies the existing
 * plan and must not regenerate it. These tests pin that behaviour — including
 * that the grocery list and cost range come through untouched.
 */
import { moveMeal, moveMealInPlan, planSlots, mealTypesInPlan, planDayCount } from '@/features/meals/move-meal';
import type { MealPlan, PlannedMeal } from '@/features/meals/meal-plan-model';

const meal = (day: number, mealType: PlannedMeal['slot']['mealType'], title: string): PlannedMeal => ({
  slot: { day, mealType },
  recipeId: `recipe-${title}`,
  title,
  totalTimeMinutes: 30,
  scaleFactor: 1,
  servingsPlanned: 4,
  proteinGPerServing: 25,
  goalIndicator: null,
  pantryIngredientsUsed: [],
  incrementalCheckoutCost: null,
  consumedCost: null,
  why: null,
});

describe('moveMeal', () => {
  it('moves a meal into an empty slot', () => {
    const meals = [meal(2, 'dinner', 'Tacos'), meal(1, 'dinner', 'Chili')];

    const result = moveMeal(meals, { day: 2, mealType: 'dinner' }, { day: 3, mealType: 'dinner' });

    expect(result.kind).toBe('moved');
    const moved = result.meals.find((m) => m.title === 'Tacos');
    expect(moved?.slot).toEqual({ day: 3, mealType: 'dinner' });
    // Nothing else shifted.
    expect(result.meals.find((m) => m.title === 'Chili')?.slot).toEqual({ day: 1, mealType: 'dinner' });
  });

  it('swaps when the target slot is already taken, so no meal is lost', () => {
    const meals = [meal(1, 'lunch', 'Soup'), meal(2, 'lunch', 'Salad')];

    const result = moveMeal(meals, { day: 1, mealType: 'lunch' }, { day: 2, mealType: 'lunch' });

    expect(result.kind).toBe('swapped');
    expect(result.meals).toHaveLength(2);
    expect(result.meals.find((m) => m.title === 'Soup')?.slot).toEqual({ day: 2, mealType: 'lunch' });
    expect(result.meals.find((m) => m.title === 'Salad')?.slot).toEqual({ day: 1, mealType: 'lunch' });
  });

  it('moves across meal categories', () => {
    const meals = [meal(1, 'lunch', 'Soup')];

    const result = moveMeal(meals, { day: 1, mealType: 'lunch' }, { day: 1, mealType: 'dinner' });

    expect(result.kind).toBe('moved');
    expect(result.meals[0]?.slot).toEqual({ day: 1, mealType: 'dinner' });
  });

  it('is a no-op when source and target are the same slot', () => {
    const meals = [meal(1, 'dinner', 'Chili')];

    const result = moveMeal(meals, { day: 1, mealType: 'dinner' }, { day: 1, mealType: 'dinner' });

    expect(result.kind).toBe('noop');
    expect(result.meals).toBe(meals);
  });

  it('rejects a move from an empty slot', () => {
    const result = moveMeal([meal(1, 'dinner', 'Chili')], { day: 5, mealType: 'dinner' }, { day: 2, mealType: 'dinner' });

    expect(result.kind).toBe('invalid');
    if (result.kind === 'invalid') expect(result.reason).toMatch(/no meal/i);
  });

  it('rejects a move outside the slots the user planned', () => {
    const meals = [meal(1, 'dinner', 'Chili')];
    const allowedSlots = planSlots(2, ['dinner']);

    const result = moveMeal(meals, { day: 1, mealType: 'dinner' }, { day: 6, mealType: 'dinner' }, { allowedSlots });

    expect(result.kind).toBe('invalid');
    if (result.kind === 'invalid') expect(result.reason).toMatch(/isn't part of this meal plan/i);
  });
});

describe('moveMealInPlan', () => {
  const plan: MealPlan = {
    planId: 'plan-1',
    status: 'ok',
    summary: {
      householdSize: 4,
      mealsPlanned: 2,
      budget: 75,
      estimatedCost: { point: 54.1, low: 46, high: 62, confidence: 'low', tierMix: null, basis: null },
      headroom: 13,
      consumedCostTotal: null,
      pantryValueUsed: null,
      pantryItemsUsed: ['rice_white'],
      nutritionGoal: null,
      balancedMealBaseline: null,
    },
    meals: [meal(2, 'dinner', 'Tacos'), meal(3, 'dinner', 'Chili')],
    groceryList: [
      { aisle: 'pantry', aisleLabel: 'Pantry', items: [] },
    ],
    pennyMessage: 'Here is your week.',
    swapOptions: ['swap_slot'],
    assumptions: ['Prices are national estimates (tier 3/4).'],
  };

  it('leaves the grocery list and cost range untouched — a move is not a regeneration', () => {
    const { plan: next, outcome } = moveMealInPlan(
      plan,
      { day: 2, mealType: 'dinner' },
      { day: 4, mealType: 'dinner' },
    );

    expect(outcome.kind).toBe('moved');
    expect(next.groceryList).toBe(plan.groceryList);
    expect(next.summary).toBe(plan.summary);
    expect(next.summary.estimatedCost.high).toBe(62);
    expect(next.summary.headroom).toBe(13);
    expect(next.planId).toBe('plan-1');
  });

  it('returns the original plan object when the move is invalid', () => {
    const { plan: next, outcome } = moveMealInPlan(
      plan,
      { day: 7, mealType: 'dinner' },
      { day: 1, mealType: 'dinner' },
    );

    expect(outcome.kind).toBe('invalid');
    expect(next).toBe(plan);
  });
});

describe('plan slot helpers', () => {
  it('builds every slot for the chosen days and categories', () => {
    expect(planSlots(2, ['breakfast', 'dinner'])).toEqual([
      { day: 1, mealType: 'breakfast' },
      { day: 1, mealType: 'dinner' },
      { day: 2, mealType: 'breakfast' },
      { day: 2, mealType: 'dinner' },
    ]);
  });

  it('reports only the categories present, in canonical order', () => {
    const meals = [meal(1, 'dinner', 'A'), meal(1, 'breakfast', 'B'), meal(2, 'dinner', 'C')];
    expect(mealTypesInPlan(meals)).toEqual(['breakfast', 'dinner']);
  });

  it('reports the plan length from the highest day used', () => {
    expect(planDayCount([meal(1, 'dinner', 'A'), meal(5, 'dinner', 'B')])).toBe(5);
    expect(planDayCount([])).toBe(0);
  });
});
