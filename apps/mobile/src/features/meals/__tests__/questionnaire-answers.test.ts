/**
 * The Swift questionnaire's answer mapping to the real `PlanRequest`.
 *
 * Pins the locked product rules (no snack slot, kids as full servings,
 * allergies always hard) and every label-to-enum translation, so a copy
 * change in the Swift option lists breaks loudly here instead of silently
 * sending the wrong request.
 */
import { DEFAULT_ANSWERS, toggleChip, toPlanRequest } from '@/features/meals/questionnaire-answers';

const answers = () => ({ ...DEFAULT_ANSWERS });

describe('toggleChip', () => {
  it('toggles a plain option on and off', () => {
    expect(toggleChip([], 'Mexican')).toEqual(['Mexican']);
    expect(toggleChip(['Mexican'], 'Mexican')).toEqual([]);
  });

  it('makes an exclusive option replace the whole selection', () => {
    expect(toggleChip(['Vegetarian', 'Vegan'], 'None', 'None')).toEqual(['None']);
  });

  it('clears an exclusive option when tapped again', () => {
    expect(toggleChip(['None'], 'None', 'None')).toEqual([]);
  });

  it('clears exclusives when a plain option is picked', () => {
    expect(toggleChip(['None'], 'Vegetarian', 'None')).toEqual(['Vegetarian']);
  });

  it('supports several exclusive options', () => {
    const exclusives = ['None of These', 'Prefer Not to Say'];
    expect(toggleChip(['High Blood Pressure'], 'None of These', exclusives)).toEqual(['None of These']);
    expect(toggleChip(['None of These'], 'Prefer Not to Say', exclusives)).toEqual(['Prefer Not to Say']);
    expect(toggleChip(['None of These'], 'High Blood Pressure', exclusives)).toEqual(['High Blood Pressure']);
  });
});

describe('toPlanRequest — household', () => {
  it('maps the Swift defaults: 2 people, no children', () => {
    const request = toPlanRequest(answers(), []);
    expect(request.household).toEqual({ size: 2, adults: 2, children: 0, sizeIsPlus: false });
  });

  it('splits adults and children, counting kids as full servings', () => {
    const request = toPlanRequest({ ...answers(), householdSize: 4, childrenCount: 1 }, []);
    expect(request.household).toEqual({ size: 4, adults: 3, children: 1, sizeIsPlus: false });
  });

  it('marks the 10+ stepper top as sizeIsPlus', () => {
    const request = toPlanRequest({ ...answers(), householdSize: 10 }, []);
    expect(request.household.sizeIsPlus).toBe(true);
    expect(request.household.size).toBe(10);
  });

  it('clamps children to the household size', () => {
    const request = toPlanRequest({ ...answers(), householdSize: 2, childrenCount: 5 }, []);
    expect(request.household.children).toBe(2);
    expect(request.household.adults).toBe(1);
  });
});

describe('toPlanRequest — meals', () => {
  it('plans the selected meal types over the dinners-per-week days', () => {
    const request = toPlanRequest(
      { ...answers(), dinnersPerWeek: 5, mealTypes: ['Breakfast', 'Dinner'] },
      [],
    );
    expect(request.days).toBe(5);
    expect(request.meals).toEqual({ breakfast: 5, lunch: 0, dinner: 5, snack: 0 });
  });

  it('never plans a snack slot', () => {
    const request = toPlanRequest(
      { ...answers(), mealTypes: ['Breakfast', 'Lunch', 'Dinner'] },
      [],
    );
    expect(request.meals.snack).toBe(0);
  });

  it('falls back to all three meal types when the selection is emptied', () => {
    const request = toPlanRequest({ ...answers(), dinnersPerWeek: 3, mealTypes: [] }, []);
    expect(request.meals).toEqual({ breakfast: 3, lunch: 3, dinner: 3, snack: 0 });
  });
});

describe('toPlanRequest — budget', () => {
  it('maps a range to its top bound', () => {
    const request = toPlanRequest({ ...answers(), budget: 'Under $75' }, []);
    expect(request.budget.amount).toBe(75);
    expect(request.budget.enabled).toBe(true);
    expect(request.budget.currency).toBe('USD');
  });

  it('treats "$250+" as no cap — the range has no top bound', () => {
    const request = toPlanRequest({ ...answers(), budget: '$250+' }, []);
    expect(request.budget.amount).toBe(0);
    expect(request.budget.enabled).toBe(false);
  });

  it('leaves the budget off for "No Preference" and blank answers', () => {
    expect(toPlanRequest({ ...answers(), budget: 'No Preference' }, []).budget.enabled).toBe(false);
    expect(toPlanRequest(answers(), []).budget.enabled).toBe(false);
  });
});

describe('toPlanRequest — diets and allergies', () => {
  it('maps known diets to required diet enums', () => {
    const request = toPlanRequest({ ...answers(), diets: ['Vegetarian', 'Vegan'] }, []);
    expect(request.dietaryRequirements).toEqual([
      { diet: 'vegetarian', strength: 'required' },
      { diet: 'vegan', strength: 'required' },
    ]);
    expect(request.dietaryOtherText).toBeNull();
  });

  it('drops the "None" exclusive and keeps nothing', () => {
    const request = toPlanRequest({ ...answers(), diets: ['None'] }, []);
    expect(request.dietaryRequirements).toEqual([]);
    expect(request.dietaryOtherText).toBeNull();
  });

  it('sends diets without a backend enum as other text', () => {
    const request = toPlanRequest(
      { ...answers(), diets: ['Halal', 'Keto / Low-Carb', 'Other'], dietOtherText: 'Paleo' },
      [],
    );
    expect(request.dietaryRequirements).toEqual([]);
    expect(request.dietaryOtherText).toBe('Halal; Keto / Low-Carb; Paleo');
  });

  it('maps allergies to required allergen enums — always hard restrictions', () => {
    const request = toPlanRequest({ ...answers(), allergies: ['Peanuts', 'Dairy / Lactose'] }, []);
    expect(request.allergies).toEqual([
      { allergen: 'peanut', strength: 'required' },
      { allergen: 'milk', strength: 'required' },
    ]);
  });

  it('sends "Other" allergy text as allergy ingredients', () => {
    const request = toPlanRequest(
      { ...answers(), allergies: ['Other'], allergyOtherText: 'Avocado' },
      [],
    );
    expect(request.allergies).toEqual([]);
    expect(request.allergyIngredients).toEqual(['Avocado']);
  });
});

describe('toPlanRequest — preferences, time and equipment', () => {
  it('passes cuisines through as free strings, dropping "Surprise Me"', () => {
    const request = toPlanRequest({ ...answers(), cuisines: ['Mexican', 'Surprise Me'] }, []);
    expect(request.likes.cuisines).toEqual(['Mexican']);
  });

  it('sends dislikes as free text', () => {
    const request = toPlanRequest({ ...answers(), dislikes: 'Mushrooms, cilantro' }, []);
    expect(request.dislikes.freeText).toBe('Mushrooms, cilantro');
  });

  it('maps goals with a real backend equivalent as preferred hints', () => {
    const request = toPlanRequest(
      { ...answers(), goals: ['Build Muscle', 'Manage Weight', 'No Specific Goal'] },
      [],
    );
    expect(request.nutritionPreferences).toEqual([
      { goal: 'high_protein', strength: 'preferred' },
      { goal: 'lower_calorie', strength: 'preferred' },
    ]);
  });

  it('maps high blood pressure to a lower-sodium hint', () => {
    const request = toPlanRequest({ ...answers(), health: ['High Blood Pressure'] }, []);
    expect(request.nutritionPreferences).toEqual([{ goal: 'lower_sodium', strength: 'preferred' }]);
  });

  it('maps cook-time bands to minute caps, unbounded when there is no cap', () => {
    expect(toPlanRequest({ ...answers(), cookTime: 'Under 20 Minutes' }, []).cookingTime.maxMinutes).toBe(20);
    expect(toPlanRequest({ ...answers(), cookTime: '40+ Minutes' }, []).cookingTime.maxMinutes).toBeNull();
    expect(toPlanRequest({ ...answers(), cookTime: 'Depends on the Day' }, []).cookingTime.maxMinutes).toBeNull();
  });

  it('maps equipment labels to backend enums, "Microwave Only" to microwave', () => {
    const request = toPlanRequest(
      { ...answers(), equipment: ['Stove / Cooktop', 'Air Fryer'] },
      [],
    );
    expect(request.equipment).toEqual(['stovetop', 'air_fryer']);
    const microwaveOnly = toPlanRequest({ ...answers(), equipment: ['Microwave Only'] }, []);
    expect(microwaveOnly.equipment).toEqual(['microwave']);
  });

  it('dedupes and trims pantry names', () => {
    const request = toPlanRequest(answers(), [' rice ', 'eggs', 'rice', '']);
    expect(request.pantryItems).toEqual(['rice', 'eggs']);
  });
});
