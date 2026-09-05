/**
 * The Standard HTH Recipe Object (Doc 02 §1).
 *
 * ONE recipe format for every path: HTH library, Penny-generated, video/URL
 * import, and manual entry. There is no second recipe model anywhere in this
 * app — `sourceType` is just a field.
 *
 * The wire format is snake_case. These schemas parse the backend's JSON and
 * produce camelCase app objects, so a malformed response fails loudly at the
 * service boundary instead of rendering as `undefined` three screens later.
 */
import { z } from 'zod';
import {
  dataConfidenceSchema,
  equipmentSchema,
  mealTypeSchema,
  reviewStatusSchema,
  sourceTypeSchema,
  valueConfidenceSchema,
  visibilitySchema,
} from '@/features/meals/meal-enums';

/** Nullable-and-optional: the backend may omit a key or send an explicit null. */
const maybe = <T extends z.ZodTypeAny>(schema: T) => schema.nullish().transform((v) => v ?? null);

export const ingredientLineSchema = z
  .object({
    position: z.number().int(),
    /** What the source said, verbatim ("1.5 lb boneless skinless chicken breast"). */
    raw_text: z.string(),
    /** Canonical id from the ingredient catalog. null = unresolved. */
    ingredient_id: maybe(z.string()),
    display_name: maybe(z.string()),
    /**
     * Quantity in the ingredient's price reference unit.
     * null means the source never stated it. NEVER invent it (Doc 02 §3).
     */
    quantity: maybe(z.number()),
    unit: maybe(z.string()),
    preparation: maybe(z.string()),
    grams: maybe(z.number()),
    is_optional: z.boolean().default(false),
    is_to_taste: z.boolean().default(false),
    /** e.g. "Chicken quantity was not specified." */
    missing_information: maybe(z.string()),
  })
  .transform((v) => ({
    position: v.position,
    rawText: v.raw_text,
    ingredientId: v.ingredient_id,
    displayName: v.display_name,
    quantity: v.quantity,
    unit: v.unit,
    preparation: v.preparation,
    grams: v.grams,
    isOptional: v.is_optional,
    isToTaste: v.is_to_taste,
    missingInformation: v.missing_information,
  }));

export type IngredientLine = z.infer<typeof ingredientLineSchema>;

export const instructionStepSchema = z
  .object({
    step: z.number().int(),
    text: z.string(),
    minutes: maybe(z.number().int()),
  })
  .transform((v) => ({ step: v.step, text: v.text, minutes: v.minutes }));

export type InstructionStep = z.infer<typeof instructionStepSchema>;

/**
 * Per-serving nutrition. `basis: "hth_computed"` is Help The Hive's own
 * calculation (FoodData Central); `"source_reported"` is the source's claim.
 */
export const nutritionInfoSchema = z
  .object({
    basis: z.string().default('hth_computed'),
    per_serving: z.boolean().default(true),
    calories_kcal: maybe(z.number()),
    protein_g: maybe(z.number()),
    carbs_g: maybe(z.number()),
    fat_g: maybe(z.number()),
    fiber_g: maybe(z.number()),
    sodium_mg: maybe(z.number()),
    coverage_pct: maybe(z.number()),
    confidence: maybe(dataConfidenceSchema),
  })
  .transform((v) => ({
    basis: v.basis,
    perServing: v.per_serving,
    caloriesKcal: v.calories_kcal,
    proteinG: v.protein_g,
    carbsG: v.carbs_g,
    fatG: v.fat_g,
    fiberG: v.fiber_g,
    sodiumMg: v.sodium_mg,
    coveragePct: v.coverage_pct,
    confidence: v.confidence,
  }));

export type NutritionInfo = z.infer<typeof nutritionInfoSchema>;

export const recipeSchema = z
  .object({
    recipe_id: z.string(),
    /** null = HTH library recipe. */
    owner_user_id: maybe(z.string()),

    title: z.string(),
    description: maybe(z.string()),

    source_type: sourceTypeSchema,
    source_url: maybe(z.string()),
    source_name: maybe(z.string()),
    license_id: maybe(z.string()),
    attribution_text: maybe(z.string()),

    visibility: visibilitySchema,
    review_status: reviewStatusSchema,

    servings: maybe(z.number()),
    servings_confidence: valueConfidenceSchema.default('missing'),
    serving_size_text: maybe(z.string()),
    scalable: z.boolean().default(true),

    prep_time_minutes: maybe(z.number().int()),
    cook_time_minutes: maybe(z.number().int()),
    total_time_minutes: maybe(z.number().int()),
    time_confidence: valueConfidenceSchema.default('missing'),

    meal_types: z.array(mealTypeSchema).default([]),
    cuisine: maybe(z.string()),
    difficulty: maybe(z.number().int()),
    equipment_required: z.array(equipmentSchema).default([]),
    is_component: z.boolean().default(false),

    /** Taxonomy ids, e.g. "diet.dairy_free", "time.30_min", "method.one_pot". */
    tags: z.array(z.string()).default([]),

    ingredients: z.array(ingredientLineSchema).default([]),
    instructions: z.array(instructionStepSchema).default([]),
    nutrition: nutritionInfoSchema.nullish().transform((v) => v ?? null),

    /** Universal plannability (Doc 02 §9.1). Computed by the backend, never the client. */
    base_meal_plan_eligible: z.boolean().default(false),
    missing_information: z.array(z.string()).default([]),
  })
  .transform((v) => ({
    recipeId: v.recipe_id,
    ownerUserId: v.owner_user_id,
    title: v.title,
    description: v.description,
    sourceType: v.source_type,
    sourceUrl: v.source_url,
    sourceName: v.source_name,
    licenseId: v.license_id,
    attributionText: v.attribution_text,
    visibility: v.visibility,
    reviewStatus: v.review_status,
    servings: v.servings,
    servingsConfidence: v.servings_confidence,
    servingSizeText: v.serving_size_text,
    scalable: v.scalable,
    prepTimeMinutes: v.prep_time_minutes,
    cookTimeMinutes: v.cook_time_minutes,
    totalTimeMinutes: v.total_time_minutes,
    timeConfidence: v.time_confidence,
    mealTypes: v.meal_types,
    cuisine: v.cuisine,
    difficulty: v.difficulty,
    equipmentRequired: v.equipment_required,
    isComponent: v.is_component,
    tags: v.tags,
    ingredients: v.ingredients,
    instructions: v.instructions,
    nutrition: v.nutrition,
    baseMealPlanEligible: v.base_meal_plan_eligible,
    missingInformation: v.missing_information,
  }));

export type Recipe = z.infer<typeof recipeSchema>;

export const recipeListSchema = z.array(recipeSchema);

// ---------------------------------------------------------------------------
// Derived helpers — presentation only. None of these decide safety.
// ---------------------------------------------------------------------------

export const hasTag = (recipe: Recipe, tagId: string): boolean => recipe.tags.includes(tagId);

/**
 * True when the recipe is missing data the source never provided. Such recipes
 * stay viewable but must never be auto-planned (product rule 4 / Doc 02 §9.1).
 */
export const isIncomplete = (recipe: Recipe): boolean =>
  recipe.missingInformation.length > 0 ||
  recipe.ingredients.some((line) => line.missingInformation !== null);

/** A recipe the user created, imported, or Penny drafted for them privately. */
export const isUserRecipe = (recipe: Recipe): boolean => recipe.ownerUserId !== null;

/** Ingredient lines that count toward the grocery basket (Doc 03 §7). */
export const purchasableLines = (recipe: Recipe): IngredientLine[] =>
  recipe.ingredients.filter((line) => !line.isOptional && !line.isToTaste);
