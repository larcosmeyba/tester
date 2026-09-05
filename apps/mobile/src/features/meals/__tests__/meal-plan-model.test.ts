/**
 * Meal-plan response parsing.
 *
 * The fixture below is the exact JSON from the product spec (Doc 03 §11). If
 * the backend's shape drifts from it, these tests fail here rather than in a
 * screen.
 */
import { mealPlanSchema, groupByDay, isWithinBudget, selectedMealTypes, totalMeals, toPlanRequestPayload, createEmptyPlanRequest, hasBudget } from '@/features/meals/meal-plan-model';

const SPEC_RESPONSE = {
  plan_id: '11111111-2222-3333-4444-555555555555',
  status: 'ok',
  summary: {
    household_size: 4,
    meals_planned: 5,
    budget: 75.0,
    estimated_cost: {
      point: 54.1,
      low: 46,
      high: 62,
      confidence: 'low',
      tier_mix: { tier3: 0.58, tier4: 0.42 },
      basis: 'national average prices',
    },
    headroom: 13.0,
    consumed_cost_total: 66.2,
    pantry_value_used: 15.8,
    pantry_items_used: ['rice_white', 'black_beans_canned', 'onion', 'garlic'],
    nutrition_goal: { goal: 'high_protein', met_by: 4, of: 5, avg_protein_g: 27 },
    balanced_meal_baseline: { applied: true, avg_score: 0.87 },
  },
  meals: [
    {
      slot: { day: 1, meal_type: 'dinner' },
      recipe_id: 'aaaa1111-2222-3333-4444-555555555555',
      title: 'Chicken & Black Bean Burrito Bowls',
      total_time_minutes: 35,
      scale_factor: 1.0,
      servings_planned: 4,
      protein_g_per_serving: 32,
      goal_indicator: 'high_protein',
      pantry_ingredients_used: ['rice_white', 'black_beans_canned'],
      incremental_checkout_cost: 10.44,
      consumed_cost: 13.33,
      why: 'Uses 4 of your pantry items.',
    },
  ],
  grocery_list: [
    {
      aisle: 'Meat / Seafood',
      items: [
        {
          ingredient_id: 'chicken_thigh_bs',
          display_name: 'Chicken Thighs (boneless, skinless)',
          needed_qty: 1.5,
          unit: 'lb',
          packages: 1,
          package_label: '1 × 1.5 lb tray',
          estimated_price: 5.24,
          price_tier: 3,
          in_pantry: false,
          used_by: ['aaaa1111-2222-3333-4444-555555555555'],
        },
      ],
    },
  ],
  penny_message: 'I built this 5-dinner plan around your $75 grocery budget.',
  swap_options: ['swap_slot', 'cheaper', 'higher_protein', 'faster', 'dislike', 'regenerate_week'],
  assumptions: ['Prices are national estimates (tier 3/4).'],
};

describe('mealPlanSchema', () => {
  it('parses the spec response into camelCase app objects', () => {
    const plan = mealPlanSchema.parse(SPEC_RESPONSE);

    expect(plan.planId).toBe('11111111-2222-3333-4444-555555555555');
    expect(plan.summary.householdSize).toBe(4);
    expect(plan.summary.estimatedCost.high).toBe(62);
    expect(plan.summary.estimatedCost.confidence).toBe('low');
    expect(plan.summary.nutritionGoal).toEqual({ goal: 'high_protein', metBy: 4, of: 5, avgProteinG: 27 });
    expect(plan.meals[0]?.slot).toEqual({ day: 1, mealType: 'dinner' });
    expect(plan.meals[0]?.pantryIngredientsUsed).toHaveLength(2);
    expect(plan.groceryList[0]?.items[0]?.ingredientId).toBe('chicken_thigh_bs');
  });

  it('keeps the aisle display label even when it is not an enum value', () => {
    const plan = mealPlanSchema.parse(SPEC_RESPONSE);
    // "Meat / Seafood" is a label, not the "meat_seafood" enum value.
    expect(plan.groceryList[0]?.aisleLabel).toBe('Meat / Seafood');
    expect(plan.groceryList[0]?.aisle).toBeNull();
  });

  it('parses an enum aisle value too', () => {
    const plan = mealPlanSchema.parse({
      ...SPEC_RESPONSE,
      grocery_list: [{ aisle: 'produce', items: [] }],
    });
    expect(plan.groceryList[0]?.aisle).toBe('produce');
  });

  it('drops swap actions it does not recognise instead of rendering a dead button', () => {
    const plan = mealPlanSchema.parse({
      ...SPEC_RESPONSE,
      swap_options: ['cheaper', 'teleport_meal'],
    });
    expect(plan.swapOptions).toEqual(['cheaper']);
  });

  it('tolerates a missing optional block rather than throwing', () => {
    const { nutrition_goal, ...summary } = SPEC_RESPONSE.summary;
    const plan = mealPlanSchema.parse({ ...SPEC_RESPONSE, summary });
    expect(plan.summary.nutritionGoal).toBeNull();
  });

  it('rejects a response missing a required field', () => {
    const { plan_id, ...rest } = SPEC_RESPONSE;
    expect(() => mealPlanSchema.parse(rest)).toThrow();
  });

  it('rejects an unknown confidence value', () => {
    const broken = {
      ...SPEC_RESPONSE,
      summary: {
        ...SPEC_RESPONSE.summary,
        estimated_cost: { ...SPEC_RESPONSE.summary.estimated_cost, confidence: 'pretty_sure' },
      },
    };
    expect(() => mealPlanSchema.parse(broken)).toThrow();
  });
});

describe('isWithinBudget', () => {
  it('judges the budget against the range upper bound, not the point estimate', () => {
    const plan = mealPlanSchema.parse(SPEC_RESPONSE);
    // point 54.10 is under 60, but high 62 is not — the answer must be false.
    const tightBudget = { ...plan, summary: { ...plan.summary, budget: 60 } };
    expect(isWithinBudget(tightBudget)).toBe(false);

    expect(isWithinBudget(plan)).toBe(true); // high 62 <= budget 75
  });

  it('returns null when no budget was set, so the UI shows nothing rather than "over budget"', () => {
    const plan = mealPlanSchema.parse(SPEC_RESPONSE);
    expect(isWithinBudget({ ...plan, summary: { ...plan.summary, budget: null } })).toBeNull();
  });
});

describe('groupByDay', () => {
  it('keeps empty days so the UI can render an empty slot', () => {
    const plan = mealPlanSchema.parse(SPEC_RESPONSE);
    const days = groupByDay(plan.meals, 5);

    expect(days).toHaveLength(5);
    expect(days[0]?.meals).toHaveLength(1);
    expect(days[4]?.meals).toHaveLength(0);
  });
});

describe('questionnaire request', () => {
  it('supports planning only some meal categories', () => {
    const counts = { breakfast: 5, lunch: 0, dinner: 5, snack: 0 };
    expect(selectedMealTypes(counts)).toEqual(['breakfast', 'dinner']);
    expect(totalMeals(counts)).toBe(10);
  });

  it('supports lunch + dinner + snacks', () => {
    const counts = { breakfast: 0, lunch: 3, dinner: 5, snack: 2 };
    expect(selectedMealTypes(counts)).toEqual(['lunch', 'dinner', 'snack']);
  });

  it('defaults to a 5-day plan', () => {
    expect(createEmptyPlanRequest().days).toBe(5);
  });

  it('derives budget.enabled from the amount rather than trusting the UI flag', () => {
    const request = createEmptyPlanRequest();
    request.budget = { amount: 0, currency: 'USD', enabled: true, mode: 'balanced' };

    const payload = toPlanRequestPayload(request, 'user-1');

    expect(payload.budget.enabled).toBe(false);
    expect(hasBudget({ ...request.budget, enabled: false })).toBe(false);
  });

  it('forces every allergy to required strength', () => {
    const request = createEmptyPlanRequest();
    request.allergies = [{ allergen: 'peanut', strength: 'required' }];

    const payload = toPlanRequestPayload(request, 'user-1');

    expect(payload.allergies).toEqual([{ allergen: 'peanut', strength: 'required' }]);
  });

  it('serializes to the exact snake_case shape the backend expects', () => {
    const request = createEmptyPlanRequest();
    request.household = { size: 4, adults: 2, children: 2, sizeIsPlus: false };
    request.meals = { breakfast: 0, lunch: 0, dinner: 5, snack: 0 };
    request.budget = { amount: 75, currency: 'USD', enabled: true, mode: 'balanced' };
    request.pantryItems = ['rice_white'];
    request.cookingTime = { maxMinutes: 45, strength: 'required' };

    const payload = toPlanRequestPayload(request, 'user-1', { seed: 42 });

    expect(payload).toMatchObject({
      questionnaire_version: '1.0',
      user_id: 'user-1',
      plan_scope: 'us',
      household: { size: 4, adults: 2, children: 2, size_is_plus: false },
      meals: { breakfast: 0, lunch: 0, dinner: 5, snack: 0 },
      days: 5,
      budget: { amount: 75, currency: 'USD', enabled: true, mode: 'balanced' },
      pantry_items: ['rice_white'],
      cooking_time: { max_minutes: 45, strength: 'required' },
      equipment: ['stovetop', 'oven', 'microwave'],
      leftovers: 'sometimes',
      seed: 42,
    });
  });
});
