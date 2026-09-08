import { toWireShape } from '@/features/meals/graphql-wire';
import { mealPlanSchema } from '@/features/meals/meal-plan-model';

describe('toWireShape', () => {
  it('converts nested keys to the snake_case the schemas parse', () => {
    const converted = toWireShape<Record<string, unknown>>({
      planId: 'plan-1',
      summary: { householdSize: 4, pantryItemsUsed: ['rice'] },
      meals: [{ slot: { day: 1, mealType: 'dinner' }, proteinGPerServing: 32 }],
    });

    expect(converted).toEqual({
      plan_id: 'plan-1',
      summary: { household_size: 4, pantry_items_used: ['rice'] },
      meals: [{ slot: { day: 1, meal_type: 'dinner' }, protein_g_per_serving: 32 }],
    });
  });

  it("drops GraphQL's own bookkeeping keys", () => {
    expect(toWireShape({ __typename: 'MealPlan', planId: 'plan-1' })).toEqual({ plan_id: 'plan-1' });
  });

  it('leaves the numeric keys of a tier mix alone', () => {
    expect(toWireShape({ tierMix: { '1': 0.4, '3': 0.6 } })).toEqual({
      tier_mix: { '1': 0.4, '3': 0.6 },
    });
  });

  it('produces a plan the meal plan schema accepts', () => {
    const response = {
      __typename: 'MealPlan',
      planId: 'plan-1',
      status: 'ok',
      pennyMessage: 'Here are 2 meals for the week.',
      swapOptions: ['cheaper'],
      assumptions: ['Prices are estimates and vary by store.'],
      summary: {
        householdSize: 4,
        mealsPlanned: 2,
        budget: 100,
        headroom: 42.5,
        consumedCostTotal: null,
        pantryValueUsed: null,
        pantryItemsUsed: [],
        estimatedCost: {
          point: 50,
          low: 45,
          high: 57.5,
          confidence: 'medium',
          tierMix: { '1': 1 },
          basis: 'Estimated from Help The Hive ingredient price data.',
        },
        nutritionGoal: null,
        balancedMealBaseline: { applied: true, avgScore: null },
      },
      meals: [
        {
          slot: { day: 1, mealType: 'dinner' },
          recipeId: 'recipe-1',
          title: 'Burrito Bowls',
          totalTimeMinutes: 35,
          scaleFactor: 1,
          servingsPlanned: 4,
          proteinGPerServing: 32,
          goalIndicator: null,
          pantryIngredientsUsed: [],
          incrementalCheckoutCost: null,
          consumedCost: 12.5,
          why: null,
        },
      ],
      groceryList: [
        {
          aisle: 'produce',
          items: [
            {
              ingredientId: 'lime',
              displayName: 'Lime',
              neededQty: 2,
              unit: 'each',
              packages: 2,
              packageLabel: '1 each',
              estimatedPrice: 0.7,
              priceTier: 3,
              inPantry: false,
              isChecked: false,
              usedBy: ['Burrito Bowls'],
            },
          ],
        },
      ],
    };

    const plan = mealPlanSchema.parse(toWireShape(response));

    expect(plan.planId).toBe('plan-1');
    expect(plan.summary.householdSize).toBe(4);
    expect(plan.summary.estimatedCost.tierMix).toEqual({ '1': 1 });
    expect(plan.meals[0]?.slot.mealType).toBe('dinner');
    expect(plan.meals[0]?.proteinGPerServing).toBe(32);
    expect(plan.groceryList[0]?.items[0]?.displayName).toBe('Lime');
  });
});
