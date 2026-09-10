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

  plan: MealPlan | null;  /**
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
  clearError: () => void;
};

/**
 * A video link imported from social media, awaiting backend transcription.
 * `provenance` records how the link entered the app: typed/pasted by hand vs
 * read from the clipboard.
 */
export interface ImportedVideoLink {
  url: string;
  platform: 'tiktok' | 'instagram' | 'youtube' | 'other';
  provenance: 'pasted' | 'clipboard';
}

type ExtendedMealPlanContextValue = MealPlanContextValue & {
  /** Video links awaiting transcription into recipes. */
  importedLinks: ImportedVideoLink[];
  addImportedLinks: (links: ImportedVideoLink[]) => void;
  removeImportedLink: (url: string) => void;
  clearImportedLinks: () => void;
  /**
   * Publishes hand assignments (picked or imported recipes) as the shared
   * plan, so the week calendar and grocery list treat them like an AI plan.
   */
  publishAssignments: (meals: PublishedMeal[]) => void;
};

/** One assigned recipe, ready to become a planned meal. */
export interface PublishedMeal {
  recipeId: string;
  title: string;
  day: number;
  mealType: 'breakfast' | 'lunch' | 'dinner';
  totalTimeMinutes: number | null;
  servings: number;
}

const MealPlanContext = createContext<ExtendedMealPlanContextValue | null>(null);

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
  const [importedLinks, setImportedLinks] = useState<ImportedVideoLink[]>([]);

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

  const addImportedLinks = useCallback((links: ImportedVideoLink[]) => {
    setImportedLinks((current) => {
      const known = new Set(current.map((link) => link.url));
      const fresh = links.filter((link) => !known.has(link.url));
      return fresh.length > 0 ? [...current, ...fresh] : current;
    });
  }, []);

  const removeImportedLink = useCallback((url: string) => {
    setImportedLinks((current) => current.filter((link) => link.url !== url));
  }, []);

  const clearImportedLinks = useCallback(() => setImportedLinks([]), []);

  /**
   * Turns hand assignments into the shared `MealPlan` shape. Days with no
   * assignment stay empty — the week calendar renders them as open slots.
   */
  const publishAssignments = useCallback(
    (meals: PublishedMeal[]) => {
      const plannedMeals = meals.map((meal) => ({
        slot: { day: meal.day, mealType: meal.mealType },
        recipeId: meal.recipeId,
        title: meal.title,
        totalTimeMinutes: meal.totalTimeMinutes,
        scaleFactor: 1,
        servingsPlanned: meal.servings,
        proteinGPerServing: null,
        goalIndicator: null,
        pantryIngredientsUsed: [],
        incrementalCheckoutCost: null,
        consumedCost: null,
        why: null,
      }));
      setPlan({
        planId: `hand-${Date.now()}`,
        status: 'ok',
        summary: {
          householdSize: request.household.size,
          mealsPlanned: plannedMeals.length,
          budget: request.budget.enabled ? request.budget.amount : null,
          // Hand-built plans have no server cost model yet; the grocery list
          // computes real numbers from the basket. Never show this as exact.
          estimatedCost: { point: 0, low: 0, high: 0, confidence: 'low', tierMix: null, basis: null },
          headroom: null,
          consumedCostTotal: null,
          pantryValueUsed: null,
          pantryItemsUsed: [],
          nutritionGoal: null,
          balancedMealBaseline: null,
        },
        meals: plannedMeals,
        groceryList: [],
        pennyMessage: '',
        swapOptions: [],
        assumptions: ['Built by hand from picked recipes. Cost estimate updates in the grocery list.'],
      });
      setPlanStartDate(startOfToday());
    },
    [request]
  );

  const generate = useCallback(
    async (userId: string, signal?: AbortSignal) => {
      setIsGenerating(true);
      setError(null);
      try {
        const generated = await mealPlanService.generate(request, { userId, signal });
        setPlan(generated);
        setPlanStartDate(startOfToday());
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
      setPlan(await mealPlanService.getCurrent());
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

  const value = useMemo<ExtendedMealPlanContextValue>(
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
      importedLinks,
      addImportedLinks,
      removeImportedLink,
      clearImportedLinks,
      publishAssignments,
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
      planStartDate,
      isGenerating,
      isLoadingPlan,
      error,
      selectedRecipeIds,
      toggleRecipe,
      clearSelectedRecipes,
      importedLinks,
      addImportedLinks,
      removeImportedLink,
      clearImportedLinks,
      publishAssignments,
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
