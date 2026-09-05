/**
 * Meal-plan state.
 *
 * Holds the questionnaire answers while the user works through the wizard, the
 * plan the backend returned, and the recipes selected by hand. One provider so
 * the questionnaire, the plan screen and the grocery list all read the same
 * plan — the brief is explicit that all three recipe sources share one set of
 * models.
 */
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

import { mealPlanService } from '@/features/meals/meal-plan-service';
import { moveMealInPlan } from '@/features/meals/move-meal';
import {
  createEmptyPlanRequest,
  type MealPlan,
  type MealSlot,
  type PlanRequest,
  type SwapAction,
} from '@/features/meals/meal-plan-model';

type MealPlanContextValue = {
  /** The questionnaire answers, built up across the wizard's sections. */
  request: PlanRequest;
  updateRequest: (patch: Partial<PlanRequest>) => void;
  resetRequest: () => void;

  plan: MealPlan | null;
  isGenerating: boolean;
  error: unknown;

  /** Recipes chosen by hand in Choose My Recipes. */
  selectedRecipeIds: string[];
  toggleRecipe: (recipeId: string) => void;
  clearSelectedRecipes: () => void;

  generate: (userId: string, signal?: AbortSignal) => Promise<MealPlan>;
  loadCurrent: () => Promise<void>;
  /** Moves a meal between slots without regenerating the week. */
  moveMeal: (from: MealSlot, to: MealSlot) => Promise<void>;
  swapMeal: (slot: MealSlot, action: SwapAction) => Promise<void>;
  clearError: () => void;
};

const MealPlanContext = createContext<MealPlanContextValue | null>(null);

export function MealPlanProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<PlanRequest>(createEmptyPlanRequest);
  const [plan, setPlan] = useState<MealPlan | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [selectedRecipeIds, setSelectedRecipeIds] = useState<string[]>([]);

  const updateRequest = useCallback((patch: Partial<PlanRequest>) => {
    setRequest((current) => ({ ...current, ...patch }));
  }, []);

  const resetRequest = useCallback(() => setRequest(createEmptyPlanRequest()), []);

  const toggleRecipe = useCallback((recipeId: string) => {
    setSelectedRecipeIds((current) =>
      current.includes(recipeId) ? current.filter((id) => id !== recipeId) : [...current, recipeId]
    );
  }, []);

  const clearSelectedRecipes = useCallback(() => setSelectedRecipeIds([]), []);

  const generate = useCallback(
    async (userId: string, signal?: AbortSignal) => {
      setIsGenerating(true);
      setError(null);
      try {
        const generated = await mealPlanService.generate(request, { userId, signal });
        setPlan(generated);
        return generated;
      } catch (caught) {
        setError(caught);
        throw caught;
      } finally {
        setIsGenerating(false);
      }
    },
    [request]
  );

  const loadCurrent = useCallback(async () => {
    setError(null);
    try {
      setPlan(await mealPlanService.getCurrent());
    } catch (caught) {
      setError(caught);
    }
  }, []);

  const moveMeal = useCallback(
    async (from: MealSlot, to: MealSlot) => {
      if (!plan) return;

      // Move locally first so the card lands under the finger immediately, then
      // confirm with the server. The basket and every cost figure are untouched
      // either way — a move is not a regeneration.
      const { plan: optimistic, outcome } = moveMealInPlan(plan, from, to);
      if (outcome.kind === 'invalid') {
        setError(new Error(outcome.reason));
        return;
      }
      if (outcome.kind === 'noop') return;

      const previous = plan;
      setPlan(optimistic);
      try {
        setPlan(await mealPlanService.move(plan.planId, from, to));
      } catch (caught) {
        setPlan(previous);
        setError(caught);
      }
    },
    [plan]
  );

  const swapMeal = useCallback(
    async (slot: MealSlot, action: SwapAction) => {
      if (!plan) return;
      setError(null);
      try {
        setPlan(await mealPlanService.swap(plan.planId, slot, action));
      } catch (caught) {
        setError(caught);
      }
    },
    [plan]
  );

  const value = useMemo<MealPlanContextValue>(
    () => ({
      request,
      updateRequest,
      resetRequest,
      plan,
      isGenerating,
      error,
      selectedRecipeIds,
      toggleRecipe,
      clearSelectedRecipes,
      generate,
      loadCurrent,
      moveMeal,
      swapMeal,
      clearError: () => setError(null),
    }),
    [
      request,
      updateRequest,
      resetRequest,
      plan,
      isGenerating,
      error,
      selectedRecipeIds,
      toggleRecipe,
      clearSelectedRecipes,
      generate,
      loadCurrent,
      moveMeal,
      swapMeal,
    ]
  );

  return <MealPlanContext.Provider value={value}>{children}</MealPlanContext.Provider>;
}

export function useMealPlan() {
  const value = useContext(MealPlanContext);
  if (!value) {
    throw new Error('useMealPlan must be used inside a MealPlanProvider');
  }
  return value;
}
