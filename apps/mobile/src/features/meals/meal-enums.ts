/**
 * Closed vocabularies from the Help The Hive build docs (02/03/04), with the
 * exact wire values. Ported verbatim from HTHMealKit `Models/Enums.swift`.
 *
 * These raw strings are a backend contract. Do not rename them.
 */
import { z } from 'zod';

/** `ai_generated` is a backend source_type only — never a fourth user path. */
export const sourceTypeSchema = z.enum([
  'hth_library',
  'ai_generated',
  'video_import',
  'url_import',
  'user_created',
]);
export type SourceType = z.infer<typeof sourceTypeSchema>;

export const visibilitySchema = z.enum(['public', 'private', 'hidden']);
export type Visibility = z.infer<typeof visibilitySchema>;

export const reviewStatusSchema = z.enum(['draft', 'needs_review', 'approved', 'rejected', 'hidden']);
export type ReviewStatus = z.infer<typeof reviewStatusSchema>;

export const valueConfidenceSchema = z.enum(['source', 'human', 'inferred', 'missing']);
export type ValueConfidence = z.infer<typeof valueConfidenceSchema>;

export const dataConfidenceSchema = z.enum(['high', 'medium', 'low']);
export type DataConfidence = z.infer<typeof dataConfidenceSchema>;

export const strengthSchema = z.enum(['required', 'preferred']);
export type Strength = z.infer<typeof strengthSchema>;

export const dietSchema = z.enum([
  'vegan',
  'vegetarian',
  'pescatarian',
  'gluten_free',
  'dairy_free',
  'egg_free',
  'nut_free',
]);
export type Diet = z.infer<typeof dietSchema>;

/** The recipe tag id a diet maps to (Doc 03 §2). */
export const dietTagId = (diet: Diet): string => `diet.${diet}`;

export const allergenSchema = z.enum([
  'milk',
  'egg',
  'fish',
  'shellfish',
  'tree_nut',
  'peanut',
  'wheat',
  'soy',
  'sesame',
]);
export type Allergen = z.infer<typeof allergenSchema>;

export const nutritionGoalSchema = z.enum([
  'high_protein',
  'high_fiber',
  'more_produce',
  'lower_sodium',
  'lower_calorie',
  'balanced',
]);
export type NutritionGoal = z.infer<typeof nutritionGoalSchema>;

export const budgetModeSchema = z.enum(['lowest', 'balanced', 'variety']);
export type BudgetMode = z.infer<typeof budgetModeSchema>;

export const equipmentSchema = z.enum([
  'stovetop',
  'oven',
  'microwave',
  'grill',
  'blender',
  'air_fryer',
  'slow_cooker',
  'instant_pot',
]);
export type Equipment = z.infer<typeof equipmentSchema>;

export const cookingStyleSchema = z.enum([
  'quick_easy',
  'few_ingredients',
  'one_pot',
  'meal_prep',
  'family_friendly',
  'kid_friendly',
  'freezer_friendly',
  'use_what_i_have',
  'lowest_cost',
  'variety',
]);
export type CookingStyle = z.infer<typeof cookingStyleSchema>;

export const leftoversPreferenceSchema = z.enum(['yes', 'sometimes', 'no']);
export type LeftoversPreference = z.infer<typeof leftoversPreferenceSchema>;

export const mealTypeSchema = z.enum(['breakfast', 'lunch', 'dinner', 'snack', 'dessert', 'side']);
export type MealType = z.infer<typeof mealTypeSchema>;

/**
 * The four meal categories a user can plan. `dessert` and `side` exist on
 * recipes but are not plannable slots (brief: BREAKFAST/LUNCH/DINNER/SNACK).
 */
export const PLANNABLE_MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack'] as const;
export type PlannableMealType = (typeof PLANNABLE_MEAL_TYPES)[number];

export const foodGroupSchema = z.enum([
  'protein',
  'vegetable',
  'fruit',
  'grain',
  'legume',
  'dairy',
  'fat',
  'spice',
  'other',
]);
export type FoodGroup = z.infer<typeof foodGroupSchema>;

/** Store-section grouping for the grocery list (Doc 03 §9). */
export const aisleSchema = z.enum([
  'produce',
  'meat_seafood',
  'dairy_refrigerated',
  'pantry',
  'canned',
  'frozen',
  'bakery',
  'spice',
  'other',
]);
export type Aisle = z.infer<typeof aisleSchema>;

/** Display order for grocery sections (Doc 03 §9). */
export const AISLE_ORDER: readonly Aisle[] = [
  'produce',
  'meat_seafood',
  'dairy_refrigerated',
  'pantry',
  'canned',
  'frozen',
  'bakery',
  'spice',
  'other',
];

const AISLE_LABELS: Record<Aisle, string> = {
  produce: 'Produce',
  meat_seafood: 'Meat / Seafood',
  dairy_refrigerated: 'Dairy / Refrigerated',
  pantry: 'Pantry',
  canned: 'Canned',
  frozen: 'Frozen',
  bakery: 'Bakery',
  spice: 'Other',
  other: 'Other',
};

export const aisleLabel = (aisle: Aisle): string => AISLE_LABELS[aisle];

const DIET_LABELS: Record<Diet, string> = {
  vegan: 'Vegan',
  vegetarian: 'Vegetarian',
  pescatarian: 'Pescatarian',
  gluten_free: 'Gluten Free',
  dairy_free: 'Dairy Free',
  egg_free: 'Egg Free',
  nut_free: 'Nut Free',
};

export const dietLabel = (diet: Diet): string => DIET_LABELS[diet];

const ALLERGEN_LABELS: Record<Allergen, string> = {
  milk: 'Milk',
  egg: 'Egg',
  fish: 'Fish',
  shellfish: 'Shellfish',
  tree_nut: 'Tree Nuts',
  peanut: 'Peanuts',
  wheat: 'Wheat',
  soy: 'Soy',
  sesame: 'Sesame',
};

export const allergenLabel = (allergen: Allergen): string => ALLERGEN_LABELS[allergen];

const MEAL_TYPE_LABELS: Record<MealType, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Snacks',
  dessert: 'Dessert',
  side: 'Side',
};

export const mealTypeLabel = (mealType: MealType): string => MEAL_TYPE_LABELS[mealType];

const EQUIPMENT_LABELS: Record<Equipment, string> = {
  stovetop: 'Stovetop',
  oven: 'Oven',
  microwave: 'Microwave',
  grill: 'Grill',
  blender: 'Blender',
  air_fryer: 'Air Fryer',
  slow_cooker: 'Slow Cooker',
  instant_pot: 'Instant Pot / Pressure Cooker',
};

export const equipmentLabel = (equipment: Equipment): string => EQUIPMENT_LABELS[equipment];

const NUTRITION_GOAL_LABELS: Record<NutritionGoal, string> = {
  high_protein: 'More protein',
  high_fiber: 'More fiber',
  more_produce: 'More fruits and vegetables',
  lower_sodium: 'Lower sodium',
  lower_calorie: 'Lighter meals',
  balanced: 'Balanced meals',
};

export const nutritionGoalLabel = (goal: NutritionGoal): string => NUTRITION_GOAL_LABELS[goal];

const COOKING_STYLE_LABELS: Record<CookingStyle, string> = {
  quick_easy: 'Quick and easy',
  few_ingredients: 'Few ingredients',
  one_pot: 'One-pot meals',
  meal_prep: 'Meal prep',
  family_friendly: 'Family friendly',
  kid_friendly: 'Kid friendly',
  freezer_friendly: 'Freezer friendly',
  use_what_i_have: 'Use what I already have',
  lowest_cost: 'Lowest grocery cost',
  variety: 'Lots of variety',
};

export const cookingStyleLabel = (style: CookingStyle): string => COOKING_STYLE_LABELS[style];

/**
 * Option lists for the questionnaire. Kept beside the enums so a new diet or
 * cooking style is added in exactly one place.
 */
export const DIET_OPTIONS = dietSchema.options;
export const ALLERGEN_OPTIONS = allergenSchema.options;
export const NUTRITION_GOAL_OPTIONS = nutritionGoalSchema.options;
export const EQUIPMENT_ALL = equipmentSchema.options;
export const COOKING_STYLE_OPTIONS = cookingStyleSchema.options;
