/**
 * The meal-planning questionnaire: 5 steps, 15 questions.
 *
 * The final step gates progress on at least one meal category and a budget
 * range; everything else always has an answer (steppers and defaults). These
 * tests also pin the product rules the mapping applies: children count as full
 * servings, snacks are always zero, and the Q14 range drives the plan budget.
 */
import {
  DEFAULT_IOS_ANSWERS,
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
  it('covers the five steps', () => {
    expect(QUESTIONNAIRE_STEPS).toHaveLength(5);
    expect(QUESTIONNAIRE_STEPS.map((step) => step.id)).toEqual([
      'household',
      'diets',
      'health',
      'taste',
      'budget',
    ]);
  });

  it('asks the full 15 Figma questions in order', () => {
    const numbers = QUESTIONNAIRE_STEPS.flatMap((step) => step.questions.map((q) => q.number));
    expect(numbers).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
  });

  it('asks Q5 as a free-text question with the Figma placeholder', () => {
    const diets = QUESTIONNAIRE_STEPS.find((step) => step.id === 'diets')!;
    const q5 = diets.questions.find((question) => question.number === 5)!;
    expect(q5.kind).toBe('text');
    expect(q5.text).toBe('Any foods you never want in your meal plan?');
    expect(q5.placeholder).toBe('e.g. Mushrooms, cilantro, olives');
  });

  it('offers Hot as the third Q9 spice option', () => {
    const taste = QUESTIONNAIRE_STEPS.find((step) => step.id === 'taste')!;
    const spice = taste.questions.find((question) => question.number === 9)!;
    expect(spice.options?.map((option) => option.label)).toEqual(['Mild', 'Medium', 'Hot']);
  });

  it('asks the Q10 cook-time and Q11 confidence questions from the Figma', () => {
    const taste = QUESTIONNAIRE_STEPS.find((step) => step.id === 'taste')!;
    const q10 = taste.questions.find((question) => question.number === 10)!;
    const q11 = taste.questions.find((question) => question.number === 11)!;
    expect(q10.text).toBe('How much time do you usually have to cook?');
    expect(q10.options?.map((option) => option.label)).toEqual([
      'Under 20 Minutes',
      '20-40 Minutes',
      '40+ Minutes',
      'Depends on the Day',
    ]);
    expect(q11.text).toBe('How comfortable are you in the kitchen?');
    expect(q11.options?.map((option) => option.label)).toEqual([
      'Beginner',
      'Comfortable',
      'Confident Cook',
    ]);
  });

  it('covers the full Q4 allergy list including Soy, Sesame, and Other', () => {
    const diets = QUESTIONNAIRE_STEPS.find((step) => step.id === 'diets')!;
    const q4 = diets.questions.find((question) => question.number === 4)!;
    expect(q4.options?.map((option) => option.label)).toEqual([
      'None',
      'Peanuts',
      'Tree Nuts',
      'Dairy / Lactose',
      'Eggs',
      'Gluten / Wheat',
      'Shellfish',
      'Fish',
      'Soy',
      'Sesame',
      'Other',
    ]);
  });

  it('uses the exact Figma budget range copy on Q14', () => {
    const budget = QUESTIONNAIRE_STEPS.find((step) => step.id === 'budget')!;
    const ranges = budget.questions.find((question) => question.number === 14)!;
    expect(ranges.options?.map((option) => option.label)).toEqual([
      'Under $75',
      '$75-$150',
      '$150-$250',
      '$250+',
      'No Preference',
    ]);
  });

  it('asks the Q15 shopping preference question from the Figma', () => {
    const budget = QUESTIONNAIRE_STEPS.find((step) => step.id === 'budget')!;
    const q15 = budget.questions.find((question) => question.number === 15)!;
    expect(q15.text).toBe('How would you like to shop for your groceries?');
    expect(q15.options?.map((option) => option.label)).toEqual([
      'Give Me a Grocery List',
      'Shop with Instacart',
      "I'm Not Sure Yet",
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

  it('accepts No Preference as a real budget answer', () => {
    expect(canAdvance('budget', answers({ budgetRange: 'no_preference' }))).toBe(true);
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

  it('disables the budget for the open-ended Q14 ranges', () => {
    for (const budgetRange of ['250_plus', 'no_preference'] as const) {
      const request = applyIosAnswers(createEmptyPlanRequest(), answers({ budgetRange }));
      expect(request.budget.amount).toBe(0);
      expect(request.budget.enabled).toBe(false);
    }
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

  it('maps Soy and Sesame allergies to their allergens', () => {
    const request = applyIosAnswers(
      createEmptyPlanRequest(),
      answers({ allergies: ['soy', 'sesame'] }),
    );
    expect(request.allergies.map((a) => a.allergen).sort()).toEqual(['sesame', 'soy']);
  });

  it('preserves unmapped diets as free text for the backend', () => {
    const request = applyIosAnswers(
      createEmptyPlanRequest(),
      answers({ diets: ['halal', 'vegetarian'] }),
    );
    expect(request.dietaryRequirements).toEqual([{ diet: 'vegetarian', strength: 'required' }]);
    expect(request.dietaryOtherText).toBe('halal');
  });

  it('carries spice level, cook time, confidence, dislikes, and shopping preference through', () => {
    const request = applyIosAnswers(
      createEmptyPlanRequest(),
      answers({
        spiceLevel: 'hot',
        cookTime: '20_40',
        cookingConfidence: 'comfortable',
        dislikedFoods: 'Mushrooms, cilantro',
        dinnersPerWeek: 6,
        budgetRange: 'under_75',
        shoppingPreference: 'instacart',
      }),
    );
    expect(request.spiceLevel).toBe('hot');
    expect(request.cookTime).toBe('20_40');
    expect(request.cookingTime.maxMinutes).toBe(40);
    expect(request.cookingConfidence).toBe('comfortable');
    expect(request.dislikedFoods).toBe('Mushrooms, cilantro');
    expect(request.dislikes.freeText).toBe('Mushrooms, cilantro');
    expect(request.dinnersPerWeek).toBe(6);
    expect(request.budgetRange).toBe('under_75');
    expect(request.shoppingPreference).toBe('instacart');
  });
});

describe('questionnaire defaults', () => {
  it('matches the Figma defaults: 2 people, 0 children, 5 dinners, Dinner, $75-$150', () => {
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
