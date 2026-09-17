/**
 * MealPlanService — the seam between the meal-plan UI and the backend.
 *
 * The engine lives on the server: filtering for allergies and diets, household
 * scaling, pantry matching, pricing, scoring, week optimisation and grocery
 * consolidation all happen there. This app collects answers, sends them, and
 * renders what comes back.
 *
 * Responses are converted from GraphQL's camelCase to the product's wire shape
 * and parsed by the schemas in `meal-plan-model.ts`, so a response that drifts
 * from the contract fails here rather than rendering as undefined further in.
 *
 * `useMockServices` still routes to the local development mock, which is how the
 * screens can be worked on without a server running. It is never on in a
 * production build.
 */
import type { PlanRequestInput } from '@helpthehive/api-contract';

import { graphqlClient } from '@/graphql/client';
import {
  AcceptMealPlanDocument,
  CurrentMealPlanDocument,
  GenerateMealPlanDocument,
  MealPlanDocument,
  MovePlannedMealDocument,
  SwapPlannedMealDocument,
} from '@/graphql/meal-operations';
import { useMockServices } from '@/constants/env';
import { toApiError } from '@/services/graphql-error';
import { toWireShape } from '@/features/meals/graphql-wire';
import {
  QUESTIONNAIRE_VERSION,
  groceryListSchema,
  mealPlanSchema,
  type GroceryList,
  type MealPlan,
  type MealSlot,
  type PlanRequest,
  type SwapAction,
} from '@/features/meals/meal-plan-model';
import { mockMealPlanService } from '@/features/meals/mock/mock-meal-plan-service';

export type GenerateOptions = {
  /**
   * Only the development mock uses this. The real service never sends a user
   * id: the server resolves the viewer from the bearer token, so a client
   * cannot ask for a plan on somebody else's behalf.
   */
  userId?: string;
  planScope?: string;
  seed?: number | null;
  signal?: AbortSignal;
};

export type MealPlanService = {
  generate(request: PlanRequest, options: GenerateOptions): Promise<MealPlan>;
  get(planId: string): Promise<MealPlan>;
  /** The plan the user is currently on, or null when they have none yet. */
  getCurrent(): Promise<MealPlan | null>;
  swap(planId: string, slot: MealSlot, action: SwapAction, keepBasket?: boolean): Promise<MealPlan>;
  /**
   * Moves a meal from one slot to another — Tuesday dinner to Wednesday dinner.
   * This modifies the existing plan; it never regenerates the week.
   */
  move(planId: string, from: MealSlot, to: MealSlot): Promise<MealPlan>;
  accept(planId: string): Promise<GroceryList>;
};

/** The questionnaire answers as the `generateMealPlan` mutation expects them. */
export function toPlanRequestInput(
  request: PlanRequest,
  options: { planScope?: string; seed?: number | null } = {},
): PlanRequestInput {
  return {
    questionnaireVersion: QUESTIONNAIRE_VERSION,
    planScope: options.planScope ?? 'us',
    household: {
      size: request.household.size,
      adults: request.household.adults,
      children: request.household.children,
      sizeIsPlus: request.household.sizeIsPlus,
    },
    meals: {
      breakfast: request.meals.breakfast,
      lunch: request.meals.lunch,
      dinner: request.meals.dinner,
      snack: request.meals.snack,
    },
    days: request.days,
    budget: {
      amount: request.budget.amount,
      currency: request.budget.currency,
      mode: request.budget.mode,
    },
    pantryItems: request.pantryItems,
    dietaryRequirements: request.dietaryRequirements.map((requirement) => ({
      diet: requirement.diet,
      strength: requirement.strength,
    })),
    dietaryOtherText: request.dietaryOtherText,
    // Allergies are always required. The server rejects anything else.
    allergies: request.allergies.map((allergy) => ({
      allergen: allergy.allergen,
      strength: 'required' as const,
    })),
    allergyIngredients: request.allergyIngredients,
    nutritionPreferences: request.nutritionPreferences.map((preference) => ({
      goal: preference.goal,
      strength: preference.strength,
    })),
    likes: {
      ingredients: request.likes.ingredients,
      cuisines: request.likes.cuisines,
      freeText: request.likes.freeText,
    },
    dislikes: {
      ingredients: request.dislikes.ingredients,
      cuisines: request.dislikes.cuisines,
      freeText: request.dislikes.freeText,
    },
    cookingTime: {
      maxMinutes: request.cookingTime.maxMinutes,
      strength: request.cookingTime.strength,
    },
    equipment: request.equipment,
    cookingStyle: request.cookingStyle,
    leftovers: request.leftovers,
    excludeRecipeIds: request.excludeRecipeIds,
    seed: options.seed ?? null,
    postalCode: request.postalCode ?? null,
  };
}

const parsePlan = (plan: unknown): MealPlan => mealPlanSchema.parse(toWireShape(plan));

const graphqlMealPlanService: MealPlanService = {
  async generate(request, options) {
    try {
      const result = await graphqlClient.request(GenerateMealPlanDocument, {
        input: toPlanRequestInput(request, options),
      });
      return parsePlan(result.generateMealPlan);
    } catch (error) {
      throw toApiError(error);
    }
  },

  async get(planId) {
    try {
      const result = await graphqlClient.request(MealPlanDocument, { planId });
      if (!result.mealPlan) {
        throw toApiError(new Error('plan not found'));
      }
      return parsePlan(result.mealPlan);
    } catch (error) {
      throw toApiError(error);
    }
  },

  async getCurrent() {
    try {
      const result = await graphqlClient.request(CurrentMealPlanDocument);
      // Having no plan yet is a normal state, not an error.
      return result.currentMealPlan ? parsePlan(result.currentMealPlan) : null;
    } catch (error) {
      throw toApiError(error);
    }
  },

  async swap(planId, slot, action, keepBasket) {
    try {
      const result = await graphqlClient.request(SwapPlannedMealDocument, {
        planId,
        input: {
          slot: { day: slot.day, mealType: slot.mealType },
          action,
          keepBasket: keepBasket ?? false,
        },
      });
      return parsePlan(result.swapPlannedMeal);
    } catch (error) {
      throw toApiError(error);
    }
  },

  async move(planId, from, to) {
    try {
      const result = await graphqlClient.request(MovePlannedMealDocument, {
        planId,
        input: {
          from: { day: from.day, mealType: from.mealType },
          to: { day: to.day, mealType: to.mealType },
        },
      });
      return parsePlan(result.movePlannedMeal);
    } catch (error) {
      throw toApiError(error);
    }
  },

  async accept(planId) {
    try {
      const result = await graphqlClient.request(AcceptMealPlanDocument, { planId });
      return groceryListSchema.parse(toWireShape(result.acceptMealPlan.sections));
    } catch (error) {
      throw toApiError(error);
    }
  },
};

export const mealPlanService: MealPlanService = useMockServices
  ? mockMealPlanService
  : graphqlMealPlanService;

export { graphqlMealPlanService };
