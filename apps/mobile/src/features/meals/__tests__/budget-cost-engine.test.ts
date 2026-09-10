/**
 * Budget cost engine.
 *
 * Pins the product rules: the 7-day total must land inside the Q14 range,
 * children count as full servings, only breakfast/lunch/dinner are planned,
 * and an infeasible range returns the closest plan with an honest note —
 * never a plan that pretends to fit.
 */
import { planWithinBudget, type BudgetPlanInput, type BudgetRecipe } from '@/features/meals/budget-cost-engine';

const RECIPES: BudgetRecipe[] = [
  { recipeId: 'oats', title: 'Oatmeal', mealType: 'breakfast', costPerServingUsd: 1.9 },
  { recipeId: 'eggs', title: 'Egg Breakfast', mealType: 'breakfast', costPerServingUsd: 3.85 },
  { recipeId: 'rice', title: 'Veggie Rice Bowl', mealType: 'lunch', costPerServingUsd: 3.75 },
  { recipeId: 'chili', title: 'Black Bean Chili', mealType: 'dinner', costPerServingUsd: 2.95 },
];

const baseInput = (patch: Partial<BudgetPlanInput> = {}): BudgetPlanInput => ({
  recipes: RECIPES,
  householdSize: 2,
  mealTypes: ['breakfast', 'lunch', 'dinner'],
  budgetRange: '75_150',
  ...patch,
});

describe('planWithinBudget', () => {
  it('builds a 7-day breakfast/lunch/dinner plan inside the range', () => {
    const result = planWithinBudget(baseInput());
    expect(result.feasible).toBe(true);
    expect(result.assignments).toHaveLength(21);
    // Cheapest per type: 1.90 + 3.75 + 2.95 = 8.60/serving × 2 people × 7 days.
    expect(result.totalCostUsd).toBeCloseTo(120.4, 2);
    expect(result.note).toBeNull();
    expect(result.resources).toEqual([]);
  });

  it('counts children as full servings', () => {
    const twoAdults = planWithinBudget(baseInput({ householdSize: 2 }));
    const withKids = planWithinBudget(baseInput({ householdSize: 4 }));
    expect(withKids.totalCostUsd).toBeCloseTo(twoAdults.totalCostUsd * 2, 2);
  });

  it('never plans snacks', () => {
    const result = planWithinBudget(baseInput());
    const mealTypes = result.assignments.map((item) => item.mealType);
    expect(mealTypes).not.toContain('snack');
    expect(new Set(mealTypes)).toEqual(new Set(['breakfast', 'lunch', 'dinner']));
  });

  it('returns the closest plan with an honest note when the range is infeasible', () => {
    const result = planWithinBudget(
      baseInput({
        budgetRange: 'under_75',
        nearbyResources: [{ id: 'pantry-1', name: 'Community Pantry', tag: 'Food Pantry' }],
      }),
    );
    expect(result.feasible).toBe(false);
    // The cheapest plan is still returned — 21 assignments, not an empty plan.
    expect(result.assignments).toHaveLength(21);
    expect(result.note).toContain('cheapest combination');
    expect(result.note).toContain('over your budget');
    // Cheaper options and nearby resources are surfaced for the user.
    expect(result.cheapestOptions.map((recipe) => recipe.recipeId)).toEqual([
      'oats',
      'rice',
      'chili',
    ]);
    expect(result.resources).toHaveLength(1);
  });

  it('explains honestly when no plan can be built at all', () => {
    const result = planWithinBudget(baseInput({ recipes: [] }));
    expect(result.feasible).toBe(false);
    expect(result.assignments).toEqual([]);
    expect(result.note).toContain('couldn\u2019t build a plan');
  });

  it('plans only the requested meal types', () => {
    const result = planWithinBudget(baseInput({ mealTypes: ['dinner'] }));
    expect(result.assignments).toHaveLength(7);
    expect(result.assignments.every((item) => item.mealType === 'dinner')).toBe(true);
  });
});
