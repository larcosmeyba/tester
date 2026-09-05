/**
 * Questionnaire flow.
 *
 * The two required sections gate progress; everything else is skippable. These
 * tests also pin the "you don't have to plan every meal" rule, which is easy to
 * break by assuming a full week of three meals a day.
 */
import {
  QUESTIONNAIRE_STEPS,
  canAdvance,
  householdSplitError,
  MAX_COOKING_STYLES,
  PANTRY_STAPLES,
} from '@/features/meals/questionnaire-steps';
import { createEmptyPlanRequest, selectedMealTypes, type PlanRequest } from '@/features/meals/meal-plan-model';

const withMeals = (meals: Partial<PlanRequest['meals']>): PlanRequest => ({
  ...createEmptyPlanRequest(),
  meals: { ...createEmptyPlanRequest().meals, ...meals },
});

describe('questionnaire steps', () => {
  it('covers the thirteen sections the spec defines, ending on review', () => {
    expect(QUESTIONNAIRE_STEPS).toHaveLength(13);
    expect(QUESTIONNAIRE_STEPS.at(-1)?.id).toBe('review');
  });

  it('marks only household and meals as required', () => {
    const required = QUESTIONNAIRE_STEPS.filter((step) => step.required).map((step) => step.id);
    expect(required).toEqual(['household', 'meals']);
  });
});

describe('canAdvance', () => {
  it('blocks the meals step until at least one category is chosen', () => {
    expect(canAdvance('meals', createEmptyPlanRequest())).toBe(false);
  });

  it('allows breakfast and dinner only', () => {
    const request = withMeals({ breakfast: 5, dinner: 5 });
    expect(canAdvance('meals', request)).toBe(true);
    expect(selectedMealTypes(request.meals)).toEqual(['breakfast', 'dinner']);
  });

  it('allows lunch, dinner and snacks without breakfast', () => {
    const request = withMeals({ lunch: 3, dinner: 5, snack: 2 });
    expect(canAdvance('meals', request)).toBe(true);
    expect(selectedMealTypes(request.meals)).toEqual(['lunch', 'dinner', 'snack']);
  });

  it('allows a single category', () => {
    expect(canAdvance('meals', withMeals({ dinner: 5 }))).toBe(true);
  });

  it('requires a household of at least one', () => {
    const request = createEmptyPlanRequest();
    expect(canAdvance('household', request)).toBe(true);
    expect(canAdvance('household', { ...request, household: { ...request.household, size: 0 } })).toBe(false);
  });

  it('never blocks an optional step', () => {
    const empty = createEmptyPlanRequest();
    for (const step of QUESTIONNAIRE_STEPS.filter((candidate) => !candidate.required)) {
      expect(canAdvance(step.id, empty)).toBe(true);
    }
  });
});

describe('householdSplitError', () => {
  it('passes when neither adults nor children were given', () => {
    expect(householdSplitError(createEmptyPlanRequest())).toBeNull();
  });

  it('passes when the split adds up', () => {
    const request = createEmptyPlanRequest();
    request.household = { size: 4, adults: 2, children: 2, sizeIsPlus: false };
    expect(householdSplitError(request)).toBeNull();
  });

  it('explains when the split does not add up', () => {
    const request = createEmptyPlanRequest();
    request.household = { size: 4, adults: 3, children: 3, sizeIsPlus: false };
    expect(householdSplitError(request)).toMatch(/add up to 4/);
  });
});

describe('questionnaire defaults', () => {
  it('starts with stovetop, oven and microwave checked, per the spec', () => {
    expect(createEmptyPlanRequest().equipment).toEqual(['stovetop', 'oven', 'microwave']);
  });

  it('pre-checks no pantry staples — we never assume a household owns anything', () => {
    expect(createEmptyPlanRequest().pantryItems).toEqual([]);
    expect(PANTRY_STAPLES.length).toBeGreaterThan(0);
  });

  it('starts with budget planning off', () => {
    const { budget } = createEmptyPlanRequest();
    expect(budget.amount).toBe(0);
    expect(budget.enabled).toBe(false);
  });

  it('caps cooking styles at three', () => {
    expect(MAX_COOKING_STYLES).toBe(3);
  });
});
