/**
 * DEVELOPMENT ONLY — a local stand-in for `POST /plans` and friends.
 *
 * It implements the spec's pipeline (filter → scale → pantry → price → select →
 * consolidate) against the seed database so the questionnaire, plan screen,
 * grocery list and meal-move flows can be built and tested before the backend
 * is reachable. It is NOT a second engine: when `env.useMockServices` is false
 * — which it always is in production — none of this runs.
 *
 * It still obeys the product's safety rules. Allergies and diets are filtered
 * from catalog flags, never guessed; missing quantities exclude a recipe from
 * planning; costs are ranges.
 */
import {
  groupByDay,
  type GroceryList,
  type MealPlan,
  type MealSlot,
  type PlanRequest,
  type PlannedMeal,
  type SwapAction,
} from '@/features/meals/meal-plan-model';
import { PLANNABLE_MEAL_TYPES, dietTagId } from '@/features/meals/meal-enums';
import { ingredientContainsAllergen } from '@/features/meals/ingredient-model';
import { purchasableLines, type Recipe } from '@/features/meals/recipe-model';
import type { GenerateOptions, MealPlanService } from '@/features/meals/meal-plan-service';
import { ApiError } from '@/services/api-error';
import { moveMeal } from '@/features/meals/move-meal';
import { buildBasket, groupByAisle, scaleFactorsFor } from '@/features/meals/mock/grocery-aggregation';
import { libraryRecipes, seedCatalog } from '@/features/meals/mock/seed-data';

const LATENCY_MS = 600;
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Plans this session has produced, so `get`/`swap`/`accept` have something to read. */
const store = new Map<string, { plan: MealPlan; request: PlanRequest }>();
let currentPlanId: string | null = null;

// ---------------------------------------------------------------------------
// Hard filters (Doc 03 §2). These decide safety, so they are code — not text
// matching, not inference.
// ---------------------------------------------------------------------------

function violatesAllergy(recipe: Recipe, request: PlanRequest): boolean {
  if (request.allergies.length === 0 && request.allergyIngredients.length === 0) return false;

  for (const line of recipe.ingredients) {
    if (!line.ingredientId) continue;

    // "Other" allergies are ingredient ids — an exact or parent match excludes.
    if (request.allergyIngredients.includes(line.ingredientId)) return true;
    const parent = seedCatalog.get(line.ingredientId)?.parentIngredientId;
    if (parent && request.allergyIngredients.includes(parent)) return true;

    const ingredient = seedCatalog.get(line.ingredientId);
    if (!ingredient) continue;
    for (const requirement of request.allergies) {
      if (ingredientContainsAllergen(ingredient, requirement.allergen)) return true;
    }
  }
  return false;
}

function violatesDiet(recipe: Recipe, request: PlanRequest): boolean {
  return request.dietaryRequirements
    .filter((requirement) => requirement.strength === 'required')
    .some((requirement) => !recipe.tags.includes(dietTagId(requirement.diet)));
}

function violatesDislikes(recipe: Recipe, request: PlanRequest): boolean {
  if (request.dislikes.ingredients.length === 0) return false;
  return recipe.ingredients.some((line) => {
    if (!line.ingredientId) return false;
    if (request.dislikes.ingredients.includes(line.ingredientId)) return true;
    const parent = seedCatalog.get(line.ingredientId)?.parentIngredientId;
    return Boolean(parent && request.dislikes.ingredients.includes(parent));
  });
}

function violatesEquipment(recipe: Recipe, request: PlanRequest): boolean {
  return recipe.equipmentRequired.some((item) => !request.equipment.includes(item));
}

function violatesTime(recipe: Recipe, request: PlanRequest): boolean {
  const { maxMinutes, strength } = request.cookingTime;
  if (maxMinutes === null || strength !== 'required') return false;
  return recipe.totalTimeMinutes !== null && recipe.totalTimeMinutes > maxMinutes;
}

function eligibleRecipes(request: PlanRequest): Recipe[] {
  return libraryRecipes().filter(
    (recipe) =>
      // Product rule 3/4: incomplete recipes are viewable but never auto-planned.
      recipe.baseMealPlanEligible &&
      !request.excludeRecipeIds.includes(recipe.recipeId) &&
      !violatesAllergy(recipe, request) &&
      !violatesDiet(recipe, request) &&
      !violatesDislikes(recipe, request) &&
      !violatesEquipment(recipe, request) &&
      !violatesTime(recipe, request),
  );
}

// ---------------------------------------------------------------------------
// Scoring (a simplified stand-in for Doc 03 §5–§6)
// ---------------------------------------------------------------------------

function score(recipe: Recipe, request: PlanRequest): number {
  const pantry = new Set(request.pantryItems);
  let total = 0;

  const lines = purchasableLines(recipe).filter((line) => line.ingredientId);
  if (lines.length > 0) {
    const owned = lines.filter((line) => seedCatalog.inPantry(line.ingredientId, pantry)).length;
    const pantryWeight = request.cookingStyle.includes('use_what_i_have') ? 1.5 : 1;
    total += (owned / lines.length) * 30 * pantryWeight;
  }

  for (const preference of request.nutritionPreferences) {
    if (recipe.tags.includes(`nutrition.${preference.goal}`)) total += 15;
  }

  for (const ingredientId of request.likes.ingredients) {
    if (recipe.ingredients.some((line) => line.ingredientId === ingredientId)) total += 8;
  }
  if (recipe.cuisine && request.likes.cuisines.includes(recipe.cuisine)) total += 10;

  if (request.cookingStyle.includes('quick_easy') && recipe.tags.includes('time.30_min')) total += 10;
  if (request.cookingStyle.includes('one_pot') && recipe.tags.includes('method.one_pot')) total += 10;
  if (request.household.children !== null && request.household.children > 0 &&
      recipe.tags.includes('household.family_friendly')) {
    total += 6;
  }

  return total;
}

/** The slots the questionnaire asked for: day 1..days × chosen categories. */
function requestedSlots(request: PlanRequest): MealSlot[] {
  const slots: MealSlot[] = [];
  for (const mealType of PLANNABLE_MEAL_TYPES) {
    const count = request.meals[mealType];
    for (let day = 1; day <= Math.min(count, request.days); day += 1) {
      slots.push({ day, mealType });
    }
  }
  return slots.sort((a, b) => a.day - b.day);
}

function buildPlan(request: PlanRequest, planId: string): MealPlan {
  const pool = eligibleRecipes(request);
  const slots = requestedSlots(request);
  const pantry = new Set(request.pantryItems);

  const chosen: PlannedMeal[] = [];
  const usedRecipeIds = new Set<string>();

  for (const slot of slots) {
    const candidates = pool
      .filter((recipe) => recipe.mealTypes.includes(slot.mealType))
      // `leftovers: no` means never the same recipe twice in the week.
      .filter((recipe) => request.leftovers === 'no' ? !usedRecipeIds.has(recipe.recipeId) : true)
      .sort((a, b) => {
        const repeatPenalty = (r: Recipe) => (usedRecipeIds.has(r.recipeId) ? 25 : 0);
        return score(b, request) - repeatPenalty(b) - (score(a, request) - repeatPenalty(a));
      });

    const recipe = candidates[0];
    if (!recipe) continue;
    usedRecipeIds.add(recipe.recipeId);

    const factors = scaleFactorsFor([recipe], request.household.size);
    const scaleFactor = factors.get(recipe.recipeId) ?? 1;
    const ownedHere = purchasableLines(recipe)
      .map((line) => line.ingredientId)
      .filter((id): id is string => Boolean(id) && seedCatalog.inPantry(id, pantry));

    chosen.push({
      slot,
      recipeId: recipe.recipeId,
      title: recipe.title,
      totalTimeMinutes: recipe.totalTimeMinutes,
      scaleFactor,
      servingsPlanned: (recipe.servings ?? request.household.size) * scaleFactor,
      proteinGPerServing: recipe.nutrition?.proteinG ?? null,
      goalIndicator: request.nutritionPreferences[0]?.goal ?? null,
      pantryIngredientsUsed: ownedHere,
      incrementalCheckoutCost: null,
      consumedCost: null,
      why: null,
    });
  }

  const plannedRecipes = chosen
    .map((meal) => pool.find((r) => r.recipeId === meal.recipeId))
    .filter((r): r is Recipe => Boolean(r));

  const basket = buildBasket(
    plannedRecipes,
    pantry,
    scaleFactorsFor(plannedRecipes, request.household.size),
  );

  const budget = request.budget.amount > 0 ? request.budget.amount : null;
  const pantryItemsUsed = [...new Set(chosen.flatMap((meal) => meal.pantryIngredientsUsed))];

  return {
    planId,
    status: 'ok',
    summary: {
      householdSize: request.household.size,
      mealsPlanned: chosen.length,
      budget,
      estimatedCost: basket.checkoutCost,
      // Product rule 5: headroom is measured against the range's UPPER bound.
      headroom: budget === null ? null : Math.round((budget - basket.checkoutCost.high) * 100) / 100,
      consumedCostTotal: null,
      pantryValueUsed: null,
      pantryItemsUsed,
      nutritionGoal: null,
      balancedMealBaseline: { applied: true, avgScore: null },
    },
    meals: chosen,
    groceryList: groupByAisle(basket.items),
    pennyMessage: buildPennyMessage(chosen.length, basket.checkoutCost, budget, pantryItemsUsed.length),
    swapOptions: ['swap_slot', 'cheaper', 'higher_protein', 'faster', 'dislike', 'regenerate_week'],
    assumptions: [
      'Prices are national estimates (tier 3/4).',
      'Pantry items counted as $0 for this trip.',
      'Salt, pepper, and water assumed on hand.',
    ],
  };
}

/**
 * Stands in for Penny's written explanation. Every number is copied from the
 * computed plan — the same rule the real backend's AI must follow (Doc 03 §13).
 */
function buildPennyMessage(
  mealCount: number,
  cost: { low: number; high: number },
  budget: number | null,
  pantryCount: number,
): string {
  const parts = [`I put together ${mealCount} ${mealCount === 1 ? 'meal' : 'meals'} for you.`];
  if (pantryCount > 0) {
    parts.push(
      `I leaned on ${pantryCount} ${pantryCount === 1 ? 'item' : 'items'} you already have, so you don't pay for them twice.`,
    );
  }
  parts.push(`Estimated grocery range: $${cost.low}–$${cost.high}.`);
  if (budget !== null) {
    const headroom = budget - cost.high;
    parts.push(
      headroom >= 0
        ? `That leaves about $${Math.round(headroom)} of headroom against your $${Math.round(budget)} budget.`
        : `That is about $${Math.round(-headroom)} above your $${Math.round(budget)} budget at the high end.`,
    );
  }
  return parts.join(' ');
}

export const mockMealPlanService: MealPlanService = {
  async generate(request: PlanRequest, options: GenerateOptions) {
    await delay(LATENCY_MS * 3);
    const planId = `mock-plan-${Date.now()}`;
    const plan = buildPlan(request, planId);
    if (plan.meals.length === 0) {
      throw new ApiError(
        'validation',
        "We couldn't find recipes that fit all of those requirements. Try relaxing one of them.",
      );
    }
    store.set(planId, { plan, request });
    currentPlanId = planId;
    return plan;
  },

  async get(planId) {
    await delay(LATENCY_MS);
    const entry = store.get(planId);
    if (!entry) throw new ApiError('not_found', 'That plan no longer exists.');
    return entry.plan;
  },

  async getCurrent() {
    await delay(LATENCY_MS);
    if (!currentPlanId) return null;
    return store.get(currentPlanId)?.plan ?? null;
  },

  async swap(planId, slot, action: SwapAction) {
    await delay(LATENCY_MS);
    const entry = store.get(planId);
    if (!entry) throw new ApiError('not_found', 'That plan no longer exists.');

    if (action === 'regenerate_week') {
      const plan = buildPlan(entry.request, planId);
      store.set(planId, { plan, request: entry.request });
      return plan;
    }

    const target = entry.plan.meals.find((meal) => meal.slot.day === slot.day && meal.slot.mealType === slot.mealType);
    if (!target) throw new ApiError('not_found', 'There is no meal in that slot.');

    const request = { ...entry.request, excludeRecipeIds: [...entry.request.excludeRecipeIds, target.recipeId] };
    const pool = eligibleRecipes(request).filter((r) => r.mealTypes.includes(slot.mealType));

    const ranked = [...pool].sort((a, b) => {
      if (action === 'faster') return (a.totalTimeMinutes ?? 999) - (b.totalTimeMinutes ?? 999);
      if (action === 'higher_protein') return (b.nutrition?.proteinG ?? 0) - (a.nutrition?.proteinG ?? 0);
      return score(b, request) - score(a, request);
    });

    const replacement = ranked[0];
    if (!replacement) {
      throw new ApiError('validation', "We couldn't find another recipe that fits your requirements.");
    }

    const meals = entry.plan.meals.map((meal) =>
      meal === target
        ? {
            ...meal,
            recipeId: replacement.recipeId,
            title: replacement.title,
            totalTimeMinutes: replacement.totalTimeMinutes,
            proteinGPerServing: replacement.nutrition?.proteinG ?? null,
          }
        : meal,
    );

    const plan = { ...entry.plan, meals };
    store.set(planId, { plan, request: action === 'dislike' ? request : entry.request });
    return plan;
  },

  /**
   * A move only reassigns slots, so the basket, cost range and headroom are
   * carried through untouched — no regeneration, no re-pricing.
   */
  async move(planId, from, to) {
    await delay(200);
    const entry = store.get(planId);
    if (!entry) throw new ApiError('not_found', 'That plan no longer exists.');

    const outcome = moveMeal(entry.plan.meals, from, to);
    if (outcome.kind === 'invalid') throw new ApiError('validation', outcome.reason);

    const plan = { ...entry.plan, meals: outcome.meals };
    store.set(planId, { plan, request: entry.request });
    return plan;
  },

  async accept(planId): Promise<GroceryList> {
    await delay(LATENCY_MS);
    const entry = store.get(planId);
    if (!entry) throw new ApiError('not_found', 'That plan no longer exists.');
    return entry.plan.groceryList;
  },
};

/** Exposed for tests; not used by the app. */
export const __mockInternals = { buildPlan, eligibleRecipes, requestedSlots, groupByDay };
