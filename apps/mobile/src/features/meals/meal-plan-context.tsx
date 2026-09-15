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
import { clearSlotOverlays } from '@/features/meals/meal-slot-state';
import { readPlanWeekStart, savePlanWeekStart } from '@/features/meals/week-reset';
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
  /**
   * Calendar date that plan day 1 falls on, so the week strip and the plan's
   * day indices line up. Set when a plan is generated or loaded.
   */
  planStartDate: Date;
  isGenerating: boolean;
  /** True while the current plan is being fetched (initial load included). */
  isLoadingPlan: boolean;
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
  /**
   * Reuses the current plan for a fresh week (Audit Section 6 reset prompt):
   * the same meals anchored to today, with checkoffs/removals cleared.
   */
  startNewWeekWithSamePlan: () => void;
  clearError: () => void;
};

const MealPlanContext = createContext<MealPlanContextValue | null>(null);

function startOfToday(): Date {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

export function MealPlanProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<PlanRequest>(createEmptyPlanRequest);
  const [plan, setPlan] = useState<MealPlan | null>(null);
  const [planStartDate, setPlanStartDate] = useState<Date>(() => startOfToday());
  const [isGenerating, setIsGenerating] = useState(false);
  // Starts true: the plan screen mounts and loads immediately, and the screen
  // must show a spinner — not the "no plan" CTA — until that first load lands.
  const [isLoadingPlan, setIsLoadingPlan] = useState(true);
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
        const weekStart = startOfToday();
        setPlanStartDate(weekStart);
        // Persist the week anchor so a restart doesn't silently move the
        // week boundary the Section 6 reset prompt is based on.
        void savePlanWeekStart(generated.planId, weekStart);
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
    setIsLoadingPlan(true);
    setError(null);
    try {
      const current = await mealPlanService.getCurrent();
      setPlan(current);
      if (current) {
        // Restore the persisted week anchor when there is one; otherwise the
        // session default (today) stands.
        const savedStart = await readPlanWeekStart(current.planId);
        if (savedStart) setPlanStartDate(savedStart);
      }
    } catch (caught) {
      setError(caught);
    } finally {
      setIsLoadingPlan(false);
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

  const startNewWeekWithSamePlan = useCallback(() => {
    if (!plan) return;
    const weekStart = startOfToday();
    setPlanStartDate(weekStart);
    void savePlanWeekStart(plan.planId, weekStart);
    // Fresh week, fresh state: checkoffs, removals and the old reset
    // dismissal all belong to the week that just ended.
    void clearSlotOverlays(plan.planId);
  }, [plan]);

  const value = useMemo<MealPlanContextValue>(
    () => ({
      request,
      updateRequest,
      resetRequest,
      plan,
      planStartDate,
      isGenerating,
      isLoadingPlan,
      error,
      selectedRecipeIds,
      toggleRecipe,
      clearSelectedRecipes,
      generate,
      loadCurrent,
      moveMeal,
      swapMeal,
      startNewWeekWithSamePlan,
      clearError: () => setError(null),
    }),
    [
      request,
      updateRequest,
      resetRequest,
      plan,
      planStartDate,
      isGenerating,
      isLoadingPlan,
      error,
      selectedRecipeIds,
      toggleRecipe,
      clearSelectedRecipes,
      generate,
      loadCurrent,
      moveMeal,
      swapMeal,
      startNewWeekWithSamePlan,
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
