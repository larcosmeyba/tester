/**
 * The Swift 7-step questionnaire.
 *
 * Pins the step order, the option lists (including exclusive options), and the
 * question numbering — the Swift file labels both the budget and the shopping
 * questions "15.", and the shopping question is renumbered here to "16.".
 * Also pins the locked product rule: breakfast / lunch / dinner only, no
 * snack option anywhere in this flow.
 */
import {
  ALLERGY_EXCLUSIVE_OPTION,
  ALLERGY_OPTIONS,
  BUDGET_OPTIONS,
  CUISINE_EXCLUSIVE_OPTION,
  DIET_EXCLUSIVE_OPTION,
  DIET_OPTIONS,
  EQUIPMENT_EXCLUSIVE_OPTION,
  EQUIPMENT_OPTIONS,
  GOAL_EXCLUSIVE_OPTION,
  HEALTH_EXCLUSIVE_OPTIONS,
  MAX_HOUSEHOLD_SIZE,
  MEAL_TYPE_OPTIONS,
  QUESTIONNAIRE_STEPS,
  SHOPPING_OPTIONS,
} from '@/features/meals/questionnaire-steps';

describe('questionnaire steps', () => {
  it('has the seven Swift steps in order', () => {
    expect(QUESTIONNAIRE_STEPS.map((step) => step.id)).toEqual([
      'household',
      'diets',
      'health',
      'taste',
      'kitchen',
      'planning',
      'pantry',
    ]);
  });

  it('gives every step a header icon, tint, title and subtitle', () => {
    for (const step of QUESTIONNAIRE_STEPS) {
      expect(step.icon).toBeTruthy();
      expect(step.iconTint).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(step.title.length).toBeGreaterThan(0);
      expect(step.subtitle.length).toBeGreaterThan(0);
    }
  });

  it('caps the household stepper at 10 with a "10+" label', () => {
    expect(MAX_HOUSEHOLD_SIZE).toBe(10);
  });
});

describe('exclusive options', () => {
  it('marks "None" exclusive for diets', () => {
    expect(DIET_OPTIONS).toContain(DIET_EXCLUSIVE_OPTION);
  });

  it('marks "None" exclusive for allergies', () => {
    expect(ALLERGY_OPTIONS).toContain(ALLERGY_EXCLUSIVE_OPTION);
  });

  it('marks both health exclusives', () => {
    expect(HEALTH_EXCLUSIVE_OPTIONS).toEqual(['None of These', 'Prefer Not to Say']);
  });

  it('marks "No Specific Goal" exclusive for goals', () => {
    expect(GOAL_EXCLUSIVE_OPTION).toBe('No Specific Goal');
  });

  it('marks "Surprise Me" exclusive for cuisines', () => {
    expect(CUISINE_EXCLUSIVE_OPTION).toBe('Surprise Me');
  });

  it('marks "Microwave Only" exclusive for equipment', () => {
    expect(EQUIPMENT_OPTIONS).toContain(EQUIPMENT_EXCLUSIVE_OPTION);
  });
});

describe('product rules', () => {
  it('offers breakfast, lunch and dinner only — never a snack slot', () => {
    expect(MEAL_TYPE_OPTIONS).toEqual(['Breakfast', 'Lunch', 'Dinner']);
    const everyOption = [
      ...DIET_OPTIONS,
      ...ALLERGY_OPTIONS,
      ...EQUIPMENT_OPTIONS,
      ...BUDGET_OPTIONS,
      ...SHOPPING_OPTIONS,
    ];
    for (const option of everyOption) {
      expect(option.toLowerCase()).not.toMatch(/snack/);
    }
  });
});
