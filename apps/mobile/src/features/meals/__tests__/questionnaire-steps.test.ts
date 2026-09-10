/**
 * The iOS questionnaire: 5 steps, 14 questions.
 *
 * The final step gates progress on at least one meal category and a budget
 * range; everything else always has an answer (steppers and defaults). These
 * tests also pin the product rules the mapping applies: children count as full
 * servings, snacks are always zero, and the Q14 range drives the plan budget.
 */
import {
  DEFAULT_IOS_ANSWERS,
  PLACEHOLDER_COPY,
  PLACEHOLDER_QUESTIONS,
  QUESTIONNAIRE_STEPS,
  applyIosAnswers,
  canAdvance,
  PANTRY_STAPLES,
  type IosQuestionnaireAnswers,
} from '@/features/meals/questionnaire-steps';
import { createEmptyPlanRequest, budgetRangeBounds } from '@/features/meals/meal-plan-model';

const answers = (patch: Partial<IosQuestionnaireAnswers> = {}): IosQuestionnaireAnswers => ({
  ...DEFAULT_IOS_ANSWERS,
  ...patch,
});

describe('questionnaire steps', () => {
  it('covers the five iOS steps', () => {
    expect(QUESTIONNAIRE_STEPS).toHaveLength(5);
    expect(QUESTIONNAIRE_STEPS.map((step) => step.id)).toEqual([
      'household',
      'diets',
      'health',
      'taste',
      'budget',
    ]);
  });

  it('uses the verified question numbers 1, 2, 3, 4, 6, 7, 8, 9, 12, 13, 14', () => {
    const numbers = QUESTIONNAIRE_STEPS.flatMap((step) => step.questions.map((q) => q.number));
    expect(numbers).toEqual([1, 2, 3, 4, 6, 7, 8, 9, 12, 13, 14]);
  });

  it('never invents copy for questions without an iOS screenshot', () => {
    const missing = PLACEHOLDER_QUESTIONS.map((placeholder) => placeholder.number).sort(
      (a, b) => a - b,
    );
    expect(missing).toEqual([5, 10, 11]);
    for (const placeholder of PLACEHOLDER_QUESTIONS) {
      expect(PLACEHOLDER_COPY).toContain('AWAITING iOS SCREENSHOT');
      expect(placeholder.afterStep).toBeDefined();
    }
  });

  it('marks the cropped Q9 spice option as pending copy instead of inventing it', () => {
    const taste = QUESTIONNAIRE_STEPS.find((step) => step.id === 'taste')!;
    const spice = taste.questions.find((question) => question.number === 9)!;
    const pending = spice.options?.find((option) => option.pendingCopy);
    expect(pending?.label).toBe(PLACEHOLDER_COPY);
  });

  it('uses the exact iOS budget range copy on Q14', () => {
    const budget = QUESTIONNAIRE_STEPS.find((step) => step.id === 'budget')!;
    const ranges = budget.questions.find((question) => question.number === 14)!;
    expect(ranges.options?.map((option) => option.label)).toEqual([
      'Under $75',
      '$75–$150',
      '$150–$250',
    ]);
  });
});

describe('canAdvance', () => {
  it('requires a household of at least one, with children capped at household size', () => {
    expect(canAdvance('household', answers())).toBe(true);
    expect(canAdvance('household', answers({ householdSize: 0 }))).toBe(false);
    expect(canAdvance('household', answers({ householdSize: 2, children: 3 }))).toBe(false);
  });

  it('blocks the budget step until a meal category and budget range are set', () => {
    expect(canAdvance('budget', answers())).toBe(true);
    expect(canAdvance('budget', answers({ mealTypes: [] }))).toBe(false);
    expect(canAdvance('budget', answers({ budgetRange: null }))).toBe(false);
  });

  it('never blocks an optional middle step', () => {
    for (const id of ['diets', 'health', 'taste'] as const) {
      expect(canAdvance(id, answers({ diets: [], goals: [], cuisines: [] }))).toBe(true);
    }
  });
});

describe('applyIosAnswers', () => {
  it('counts children as full servings in the household size', () => {
    const request = applyIosAnswers(
      createEmptyPlanRequest(),
      answers({ householdSize: 4, children: 2 }),
    );
    expect(request.household.size).toBe(4);
    expect(request.household.children).toBe(2);
    expect(request.household.adults).toBe(2);
  });

  it('keeps snacks at zero — breakfast/lunch/dinner only', () => {
    const request = applyIosAnswers(
      createEmptyPlanRequest(),
      answers({ mealTypes: ['breakfast', 'lunch', 'dinner'] }),
    );
    expect(request.meals.snack).toBe(0);
    expect(request.meals.breakfast).toBe(5);
    expect(request.meals.lunch).toBe(5);
    expect(request.meals.dinner).toBe(5);
  });

  it('drives the budget from the Q14 range and always plans seven days', () => {
    const request = applyIosAnswers(
      createEmptyPlanRequest(),
      answers({ budgetRange: '150_250' }),
    );
    const bounds = budgetRangeBounds('150_250');
    expect(request.budget.amount).toBe((bounds.maxCents ?? 0) / 100);
    expect(request.budget.enabled).toBe(true);
    expect(request.days).toBe(7);
  });

  it('treats "None" as a clear for diets, allergies, and health answers', () => {
    const request = applyIosAnswers(
      createEmptyPlanRequest(),
      answers({
        diets: ['none'],
        allergies: ['none'],
        healthConsiderations: ['none_of_these'],
        goals: ['no_specific_goal'],
      }),
    );
    expect(request.dietaryRequirements).toEqual([]);
    expect(request.allergies).toEqual([]);
    expect(request.healthConsiderations).toEqual(['none_of_these']);
    expect(request.planGoals).toEqual(['no_specific_goal']);
  });

  it('preserves unmapped diets as free text for the backend', () => {
    const request = applyIosAnswers(
      createEmptyPlanRequest(),
      answers({ diets: ['halal', 'vegetarian'] }),
    );
    expect(request.dietaryRequirements).toEqual([{ diet: 'vegetarian', strength: 'required' }]);
    expect(request.dietaryOtherText).toBe('halal');
  });

  it('carries spice level, dinners per week, and budget range through', () => {
    const request = applyIosAnswers(
      createEmptyPlanRequest(),
      answers({ spiceLevel: 'medium', dinnersPerWeek: 6, budgetRange: 'under_75' }),
    );
    expect(request.spiceLevel).toBe('medium');
    expect(request.dinnersPerWeek).toBe(6);
    expect(request.budgetRange).toBe('under_75');
  });
});

describe('questionnaire defaults', () => {
  it('matches the iOS defaults: 2 people, 0 children, 5 dinners, Dinner, $75–$150', () => {
    expect(DEFAULT_IOS_ANSWERS.householdSize).toBe(2);
    expect(DEFAULT_IOS_ANSWERS.children).toBe(0);
    expect(DEFAULT_IOS_ANSWERS.dinnersPerWeek).toBe(5);
    expect(DEFAULT_IOS_ANSWERS.mealTypes).toEqual(['dinner']);
    expect(DEFAULT_IOS_ANSWERS.budgetRange).toBe('75_150');
  });

  it('pre-checks no pantry staples — we never assume a household owns anything', () => {
    expect(createEmptyPlanRequest().pantryItems).toEqual([]);
    expect(PANTRY_STAPLES.length).toBeGreaterThan(0);
  });
});
