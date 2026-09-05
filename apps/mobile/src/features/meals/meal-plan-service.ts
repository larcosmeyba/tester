/**
 * MealPlanService — the seam between the meal-plan UI and the backend.
 *
 * BACKEND INTEGRATION REQUIRED. The GraphQL server has no meal schema today
 * (`schema.graphql` covers viewer, profile, preferences, onboarding, pantry and
 * push tokens only). The contract below is the one the product spec defines
 * (Doc 03 §14) and is what the backend needs to implement:
 *
 *   POST /plans                      questionnaire JSON (Doc 04) → plan JSON (Doc 03 §11)
 *   GET  /plans/{plan_id}                                        → plan JSON
 *   POST /plans/{plan_id}/swap       {slot, action, keep_basket} → plan JSON
 *   POST /plans/{plan_id}/accept                                 → grocery list
 *
 * Until then `useMockServices` routes these calls to a local development mock
 * that implements the same interface, so every screen is built against the real
 * shape rather than against ad-hoc placeholder data.
 *
 * The engine belongs on the server: filtering for allergies and diets, household
 * scaling, pantry matching, pricing, scoring, week optimisation and grocery
 * consolidation. This app collects answers, sends them, and renders the result.
 */
import type {
  GroceryList,
  MealPlan,
  MealSlot,
  PlanRequest,
  SwapAction,
} from '@/features/meals/meal-plan-model';
import { useMockServices } from '@/constants/env';
import { BackendIntegrationRequiredError } from '@/services/api-error';
import { mockMealPlanService } from '@/features/meals/mock/mock-meal-plan-service';

export type GenerateOptions = {
  userId: string;
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

/**
 * The real implementation. Every method throws until the endpoints above exist,
 * rather than silently returning empty data that would look like a working plan.
 */
const pendingMealPlanService: MealPlanService = {
  generate: () => Promise.reject(new BackendIntegrationRequiredError('POST /plans')),
  get: () => Promise.reject(new BackendIntegrationRequiredError('GET /plans/{plan_id}')),
  getCurrent: () => Promise.reject(new BackendIntegrationRequiredError('GET /plans/current')),
  swap: () => Promise.reject(new BackendIntegrationRequiredError('POST /plans/{plan_id}/swap')),
  move: () => Promise.reject(new BackendIntegrationRequiredError('POST /plans/{plan_id}/swap')),
  accept: () => Promise.reject(new BackendIntegrationRequiredError('POST /plans/{plan_id}/accept')),
};

export const mealPlanService: MealPlanService = useMockServices
  ? mockMealPlanService
  : pendingMealPlanService;

export { pendingMealPlanService };
