/**
 * Meal-plan request and response models.
 *
 * Request  = the exact JSON the questionnaire produces (Doc 04 "QUESTIONNAIRE OUTPUT").
 * Response = the plan JSON the backend returns (Doc 03 §11).
 *
 * The backend owns the engine: filtering, scaling, pantry matching, pricing,
 * scoring, week optimization and consolidation all happen server-side. This app
 * collects answers, sends them, and renders what comes back.
 */
import { z } from 'zod';
import {
  aisleSchema,
  budgetModeSchema,
  dataConfidenceSchema,
  mealTypeSchema,
  strengthSchema,
  type Allergen,
  type CookingStyle,
  type Diet,
  type Equipment,
  type LeftoversPreference,
  type NutritionGoal,
  type PlannableMealType,
} from '@/features/meals/meal-enums';

const maybe = <T extends z.ZodTypeAny>(schema: T) => schema.nullish().transform((v) => v ?? null);

export const QUESTIONNAIRE_VERSION = '1.0';

/** Brief: the default plan is 5 days. Doc 04 §2 allows 1–7. */
export const DEFAULT_PLAN_DAYS = 5;
export const MIN_PLAN_DAYS = 1;
export const MAX_PLAN_DAYS = 7;
export const MIN_HOUSEHOLD_SIZE = 1;
export const MAX_HOUSEHOLD_SIZE = 8;

// ---------------------------------------------------------------------------
// REQUEST — produced by the questionnaire, sent to POST /plans
// ---------------------------------------------------------------------------

export interface HouseholdRequest {
  size: number;
  adults: number | null;
  children: number | null;
  /** True when the user picked "8+"; size is stored as 8. */
  sizeIsPlus: boolean;
}

/** Per-category meal counts. A user need not plan every category. */
export interface MealCounts {
  breakfast: number;
  lunch: number;
  dinner: number;
  snack: number;
}

export const emptyMealCounts = (): MealCounts => ({ breakfast: 0, lunch: 0, dinner: 0, snack: 0 });

export const totalMeals = (counts: MealCounts): number =>
  counts.breakfast + counts.lunch + counts.dinner + counts.snack;

/** The categories the user actually asked for — drives which rows render. */
export const selectedMealTypes = (counts: MealCounts): PlannableMealType[] =>
  (['breakfast', 'lunch', 'dinner', 'snack'] as const).filter((type) => counts[type] > 0);

export interface BudgetRequest {
  amount: number;
  currency: 'USD';
  /** Doc 04: enabled === amount > 0. */
  enabled: boolean;
  mode: z.infer<typeof budgetModeSchema>;
}

/** Guarded budget check — never divide by amount unless this is true (Doc 03 §6). */
export const hasBudget = (budget: BudgetRequest): boolean => budget.enabled && budget.amount > 0;

export interface DietRequirement {
  diet: Diet;
  strength: z.infer<typeof strengthSchema>;
}

/** Allergies are always `required`. Doc 04 §6 rejects anything else. */
export interface AllergyRequirement {
  allergen: Allergen;
  strength: 'required';
}

export interface NutritionPreference {
  goal: NutritionGoal;
  strength: z.infer<typeof strengthSchema>;
}

export interface CookingTimeRequest {
  maxMinutes: number | null;
  strength: z.infer<typeof strengthSchema>;
}

export interface FoodPreferences {
  ingredients: string[];
  cuisines: string[];
  freeText: string | null;
}

/**
 * The complete questionnaire answer set. Held in the client while the user
 * moves through the 13 sections, then serialized by `toPlanRequestPayload`.
 */
export interface PlanRequest {
  household: HouseholdRequest;
  meals: MealCounts;
  days: number;
  budget: BudgetRequest;
  /** Canonical ingredient ids, not free text. */
  pantryItems: string[];
  dietaryRequirements: DietRequirement[];
  dietaryOtherText: string | null;
  allergies: AllergyRequirement[];
  /** "Other" allergies, resolved to ingredient ids before submit. */
  allergyIngredients: string[];
  nutritionPreferences: NutritionPreference[];
  likes: FoodPreferences;
  dislikes: Omit<FoodPreferences, 'cuisines'> & { cuisines: string[] };
  cookingTime: CookingTimeRequest;
  equipment: Equipment[];
  cookingStyle: CookingStyle[];
  leftovers: LeftoversPreference;
  excludeRecipeIds: string[];
}

/** A fresh questionnaire with the defaults Doc 04 specifies. */
export const createEmptyPlanRequest = (): PlanRequest => ({
  household: { size: 1, adults: null, children: null, sizeIsPlus: false },
  meals: emptyMealCounts(),
  days: DEFAULT_PLAN_DAYS,
  budget: { amount: 0, currency: 'USD', enabled: false, mode: 'balanced' },
  pantryItems: [],
  dietaryRequirements: [],
  dietaryOtherText: null,
  allergies: [],
  allergyIngredients: [],
  nutritionPreferences: [],
  likes: { ingredients: [], cuisines: [], freeText: null },
  dislikes: { ingredients: [], cuisines: [], freeText: null },
  cookingTime: { maxMinutes: null, strength: 'preferred' },
  // Doc 04 §10: first three checked by default.
  equipment: ['stovetop', 'oven', 'microwave'],
  cookingStyle: [],
  leftovers: 'sometimes',
  excludeRecipeIds: [],
});

/** The exact snake_case body `POST /plans` expects (Doc 04). */
export interface PlanRequestPayload {
  questionnaire_version: string;
  user_id: string;
  plan_scope: string;
  household: { size: number; adults: number | null; children: number | null; size_is_plus: boolean };
  meals: MealCounts;
  days: number;
  budget: { amount: number; currency: string; enabled: boolean; mode: string };
  pantry_items: string[];
  dietary_requirements: { diet: string; strength: string }[];
  dietary_other_text: string | null;
  allergies: { allergen: string; strength: string }[];
  allergy_ingredients: string[];
  nutrition_preferences: { goal: string; strength: string }[];
  likes: { ingredients: string[]; cuisines: string[]; free_text: string | null };
  dislikes: { ingredients: string[]; free_text: string | null };
  cooking_time: { max_minutes: number | null; strength: string };
  equipment: string[];
  cooking_style: string[];
  leftovers: string;
  exclude_recipe_ids: string[];
  seed: number | null;
}

export const toPlanRequestPayload = (
  request: PlanRequest,
  userId: string,
  options: { planScope?: string; seed?: number | null } = {},
): PlanRequestPayload => ({
  questionnaire_version: QUESTIONNAIRE_VERSION,
  user_id: userId,
  plan_scope: options.planScope ?? 'us',
  household: {
    size: request.household.size,
    adults: request.household.adults,
    children: request.household.children,
    size_is_plus: request.household.sizeIsPlus,
  },
  meals: request.meals,
  days: request.days,
  budget: {
    amount: request.budget.amount,
    currency: request.budget.currency,
    // Doc 04 validation: enabled is derived, never trusted from the UI.
    enabled: request.budget.amount > 0,
    mode: request.budget.mode,
  },
  pantry_items: request.pantryItems,
  dietary_requirements: request.dietaryRequirements.map((d) => ({
    diet: d.diet,
    strength: d.strength,
  })),
  dietary_other_text: request.dietaryOtherText,
  allergies: request.allergies.map((a) => ({ allergen: a.allergen, strength: 'required' })),
  allergy_ingredients: request.allergyIngredients,
  nutrition_preferences: request.nutritionPreferences.map((n) => ({
    goal: n.goal,
    strength: n.strength,
  })),
  likes: {
    ingredients: request.likes.ingredients,
    cuisines: request.likes.cuisines,
    free_text: request.likes.freeText,
  },
  dislikes: {
    ingredients: request.dislikes.ingredients,
    free_text: request.dislikes.freeText,
  },
  cooking_time: {
    max_minutes: request.cookingTime.maxMinutes,
    strength: request.cookingTime.strength,
  },
  equipment: request.equipment,
  cooking_style: request.cookingStyle,
  leftovers: request.leftovers,
  exclude_recipe_ids: request.excludeRecipeIds,
  seed: options.seed ?? null,
});

// ---------------------------------------------------------------------------
// RESPONSE — Doc 03 §11
// ---------------------------------------------------------------------------

/**
 * An estimated cost is always a RANGE with a confidence — never fake precision.
 * Budget compliance is checked against `high`, never `point` (product rule 5).
 */
export const costRangeSchema = z
  .object({
    point: z.number(),
    low: z.number(),
    high: z.number(),
    confidence: dataConfidenceSchema,
    tier_mix: z.record(z.string(), z.number()).nullish().transform((v) => v ?? null),
    basis: maybe(z.string()),
  })
  .transform((v) => ({
    point: v.point,
    low: v.low,
    high: v.high,
    confidence: v.confidence,
    tierMix: v.tier_mix,
    basis: v.basis,
  }));

export type CostRange = z.infer<typeof costRangeSchema>;

export const mealSlotSchema = z
  .object({ day: z.number().int(), meal_type: mealTypeSchema })
  .transform((v) => ({ day: v.day, mealType: v.meal_type }));

export type MealSlot = z.infer<typeof mealSlotSchema>;

export const sameSlot = (a: MealSlot, b: MealSlot): boolean =>
  a.day === b.day && a.mealType === b.mealType;

export const plannedMealSchema = z
  .object({
    slot: mealSlotSchema,
    recipe_id: z.string(),
    title: z.string(),
    total_time_minutes: maybe(z.number().int()),
    scale_factor: z.number().default(1),
    servings_planned: z.number(),
    protein_g_per_serving: maybe(z.number()),
    goal_indicator: maybe(z.string()),
    pantry_ingredients_used: z.array(z.string()).default([]),
    incremental_checkout_cost: maybe(z.number()),
    consumed_cost: maybe(z.number()),
    /** Penny's one-line explanation, written by the backend from computed facts. */
    why: maybe(z.string()),
  })
  .transform((v) => ({
    slot: v.slot,
    recipeId: v.recipe_id,
    title: v.title,
    totalTimeMinutes: v.total_time_minutes,
    scaleFactor: v.scale_factor,
    servingsPlanned: v.servings_planned,
    proteinGPerServing: v.protein_g_per_serving,
    goalIndicator: v.goal_indicator,
    pantryIngredientsUsed: v.pantry_ingredients_used,
    incrementalCheckoutCost: v.incremental_checkout_cost,
    consumedCost: v.consumed_cost,
    why: v.why,
  }));

export type PlannedMeal = z.infer<typeof plannedMealSchema>;

export const groceryItemSchema = z
  .object({
    ingredient_id: z.string(),
    display_name: z.string(),
    needed_qty: z.number(),
    unit: z.string(),
    /** null for divisible (loose) items sold by weight. */
    packages: maybe(z.number().int()),
    package_label: maybe(z.string()),
    estimated_price: z.number(),
    price_tier: maybe(z.number().int()),
    in_pantry: z.boolean().default(false),
    used_by: z.array(z.string()).default([]),
  })
  .transform((v) => ({
    ingredientId: v.ingredient_id,
    displayName: v.display_name,
    neededQty: v.needed_qty,
    unit: v.unit,
    packages: v.packages,
    packageLabel: v.package_label,
    estimatedPrice: v.estimated_price,
    priceTier: v.price_tier,
    inPantry: v.in_pantry,
    usedBy: v.used_by,
  }));

export type GroceryItem = z.infer<typeof groceryItemSchema>;

/**
 * The backend sends `aisle` as a display label ("Meat / Seafood") in Doc 03 §11
 * and as an enum value elsewhere. Accept either and keep both.
 */
export const grocerySectionSchema = z
  .object({
    aisle: z.union([aisleSchema, z.string()]),
    items: z.array(groceryItemSchema).default([]),
  })
  .transform((v) => ({
    aisle: aisleSchema.safeParse(v.aisle).success ? (v.aisle as z.infer<typeof aisleSchema>) : null,
    aisleLabel: typeof v.aisle === 'string' ? v.aisle : String(v.aisle),
    items: v.items,
  }));

export type GrocerySection = z.infer<typeof grocerySectionSchema>;

export const groceryListSchema = z.array(grocerySectionSchema);
export type GroceryList = z.infer<typeof groceryListSchema>;

export const planSummarySchema = z
  .object({
    household_size: z.number().int(),
    meals_planned: z.number().int(),
    budget: maybe(z.number()),
    estimated_cost: costRangeSchema,
    /** budget − estimatedCost.high; null when no budget was set. */
    headroom: maybe(z.number()),
    consumed_cost_total: maybe(z.number()),
    pantry_value_used: maybe(z.number()),
    pantry_items_used: z.array(z.string()).default([]),
    nutrition_goal: z
      .object({
        goal: z.string(),
        met_by: z.number(),
        of: z.number(),
        avg_protein_g: z.number().nullish(),
      })
      .nullish()
      .transform((v) =>
        v ? { goal: v.goal, metBy: v.met_by, of: v.of, avgProteinG: v.avg_protein_g ?? null } : null,
      ),
    balanced_meal_baseline: z
      .object({ applied: z.boolean(), avg_score: z.number().nullish() })
      .nullish()
      .transform((v) => (v ? { applied: v.applied, avgScore: v.avg_score ?? null } : null)),
  })
  .transform((v) => ({
    householdSize: v.household_size,
    mealsPlanned: v.meals_planned,
    budget: v.budget,
    estimatedCost: v.estimated_cost,
    headroom: v.headroom,
    consumedCostTotal: v.consumed_cost_total,
    pantryValueUsed: v.pantry_value_used,
    pantryItemsUsed: v.pantry_items_used,
    nutritionGoal: v.nutrition_goal,
    balancedMealBaseline: v.balanced_meal_baseline,
  }));

export type PlanSummary = z.infer<typeof planSummarySchema>;

export const SWAP_ACTIONS = [
  'swap_slot',
  'cheaper',
  'higher_protein',
  'faster',
  'dislike',
  'regenerate_week',
] as const;
export type SwapAction = (typeof SWAP_ACTIONS)[number];

export const mealPlanSchema = z
  .object({
    plan_id: z.string(),
    status: z.string().default('ok'),
    summary: planSummarySchema,
    meals: z.array(plannedMealSchema).default([]),
    grocery_list: groceryListSchema.default([]),
    /** AI-written text. Never a source of numbers (Doc 03 §13). */
    penny_message: z.string().default(''),
    swap_options: z.array(z.string()).default([]),
    assumptions: z.array(z.string()).default([]),
  })
  .transform((v) => ({
    planId: v.plan_id,
    status: v.status,
    summary: v.summary,
    meals: v.meals,
    groceryList: v.grocery_list,
    pennyMessage: v.penny_message,
    swapOptions: v.swap_options.filter((o): o is SwapAction =>
      (SWAP_ACTIONS as readonly string[]).includes(o),
    ),
    assumptions: v.assumptions,
  }));

export type MealPlan = z.infer<typeof mealPlanSchema>;

/** One day of the plan, grouped for the Meal Plan screen. */
export interface MealPlanDay {
  day: number;
  meals: PlannedMeal[];
}

/**
 * Groups the flat meal array into days 1..dayCount. Days with no meals are kept
 * so the UI can render an empty slot rather than skipping the day.
 */
export const groupByDay = (meals: PlannedMeal[], dayCount?: number): MealPlanDay[] => {
  const highestDay = meals.reduce((max, meal) => Math.max(max, meal.slot.day), 0);
  const total = dayCount ?? highestDay;
  const days: MealPlanDay[] = [];
  for (let day = 1; day <= total; day += 1) {
    days.push({ day, meals: meals.filter((meal) => meal.slot.day === day) });
  }
  return days;
};

/** True when the plan's estimated cost range fits inside the budget (product rule 5). */
export const isWithinBudget = (plan: MealPlan): boolean | null => {
  const { budget, estimatedCost } = plan.summary;
  if (budget === null || budget <= 0) return null;
  return estimatedCost.high <= budget;
};
