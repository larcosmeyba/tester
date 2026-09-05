/**
 * The meal-planning questionnaire (product Doc 04).
 *
 * Thirteen sections, defined as data rather than thirteen hand-written screens,
 * so the order and copy can change without touching the renderer. Every answer
 * maps to one field of `PlanRequest`, which is serialised verbatim into the
 * `POST /plans` body.
 *
 * Only Household and Meals are required; everything else is skippable, exactly
 * as the spec states.
 */
import {
  COOKING_STYLE_OPTIONS,
  DIET_OPTIONS,
  type Allergen,
  type CookingStyle,
  type Diet,
  type Equipment,
  type NutritionGoal,
} from '@/features/meals/meal-enums';
import { totalMeals, type PlanRequest } from '@/features/meals/meal-plan-model';

export type QuestionnaireStepId =
  | 'household'
  | 'meals'
  | 'budget'
  | 'pantry'
  | 'diet'
  | 'allergies'
  | 'nutrition'
  | 'preferences'
  | 'time'
  | 'equipment'
  | 'style'
  | 'leftovers'
  | 'review';

export type QuestionnaireStep = {
  id: QuestionnaireStepId;
  title: string;
  subtitle?: string;
  /** Required steps cannot be skipped and gate the Next button. */
  required: boolean;
};

export const QUESTIONNAIRE_STEPS: QuestionnaireStep[] = [
  {
    id: 'household',
    title: 'How many people are you planning meals for?',
    subtitle: 'We use this to size the recipes, nothing else.',
    required: true,
  },
  {
    id: 'meals',
    title: 'What do you want help planning?',
    subtitle: "Pick any combination — you don't have to plan every meal.",
    required: true,
  },
  {
    id: 'budget',
    title: "What's your grocery budget for this plan?",
    subtitle: "We'll show an estimated range and leave some headroom, because prices vary by store.",
    required: false,
  },
  {
    id: 'pantry',
    title: 'What do you already have?',
    subtitle: "We'll plan around it so you don't buy it twice.",
    required: false,
  },
  {
    id: 'diet',
    title: 'Do you follow any of these?',
    required: false,
  },
  {
    id: 'allergies',
    title: 'Are there ingredients that must be avoided because of an allergy?',
    subtitle: 'We remove every recipe containing them. This is checked in code, not guessed.',
    required: false,
  },
  {
    id: 'nutrition',
    title: "Is there anything you'd like Penny to prioritise?",
    required: false,
  },
  {
    id: 'preferences',
    title: 'What foods do you like — and what would you rather skip?',
    required: false,
  },
  {
    id: 'time',
    title: 'How much time do you usually want to spend cooking?',
    required: false,
  },
  {
    id: 'equipment',
    title: 'What can you cook with?',
    subtitle: "Penny won't suggest a recipe that needs something you don't have.",
    required: false,
  },
  {
    id: 'style',
    title: 'What sounds most useful?',
    subtitle: 'Pick up to three.',
    required: false,
  },
  {
    id: 'leftovers',
    title: 'Are you okay with leftovers?',
    required: false,
  },
  {
    id: 'review',
    title: 'Does this look right?',
    subtitle: 'Tap any row to change it.',
    required: false,
  },
];

export const MAX_COOKING_STYLES = 3;

/** Doc 04 §3 — the three budget modes. */
export const BUDGET_MODE_OPTIONS = [
  { value: 'lowest', label: 'Spend as little as possible' },
  { value: 'balanced', label: 'Balance savings and variety' },
  { value: 'variety', label: 'Use my budget for maximum variety' },
] as const;

/** Doc 04 §9 — cooking-time bands. `null` means no preference. */
export const COOKING_TIME_OPTIONS = [
  { value: 15, label: '15 minutes or less' },
  { value: 30, label: '30 minutes or less' },
  { value: 45, label: '45 minutes or less' },
  { value: 60, label: '60 minutes or less' },
  { value: null, label: 'No preference' },
] as const;

export const LEFTOVERS_OPTIONS = [
  { value: 'yes', label: 'Yes — use leftovers to save money' },
  { value: 'sometimes', label: 'Sometimes' },
  { value: 'no', label: 'No — I prefer different meals' },
] as const;

export const EQUIPMENT_OPTIONS: Equipment[] = [
  'stovetop',
  'oven',
  'microwave',
  'air_fryer',
  'slow_cooker',
  'instant_pot',
  'grill',
  'blender',
];

export const DIET_CHOICES: Diet[] = [...DIET_OPTIONS];

export const ALLERGEN_CHOICES: Allergen[] = [
  'milk',
  'egg',
  'fish',
  'shellfish',
  'tree_nut',
  'peanut',
  'wheat',
  'soy',
  'sesame',
];

export const NUTRITION_GOAL_CHOICES: NutritionGoal[] = [
  'high_protein',
  'high_fiber',
  'more_produce',
  'lower_sodium',
  'lower_calorie',
  'balanced',
];

export const COOKING_STYLE_CHOICES: CookingStyle[] = [...COOKING_STYLE_OPTIONS];

/**
 * Common pantry staples (Doc 04 §4). Each maps to a canonical ingredient id.
 * Nothing is pre-checked — the spec is explicit that we must not assume a
 * household has olive oil or any other expensive staple.
 */
export const PANTRY_STAPLES: { ingredientId: string; label: string }[] = [
  { ingredientId: 'rice_white', label: 'Rice' },
  { ingredientId: 'pasta', label: 'Pasta' },
  { ingredientId: 'black_beans_canned', label: 'Beans' },
  { ingredientId: 'flour_all_purpose', label: 'Flour' },
  { ingredientId: 'oats', label: 'Oats' },
  { ingredientId: 'eggs', label: 'Eggs' },
  { ingredientId: 'milk', label: 'Milk' },
  { ingredientId: 'butter', label: 'Butter' },
  { ingredientId: 'oil_neutral', label: 'Cooking oil' },
  { ingredientId: 'garlic', label: 'Garlic' },
  { ingredientId: 'onion', label: 'Onion' },
  { ingredientId: 'bread', label: 'Bread' },
  { ingredientId: 'tomatoes_canned', label: 'Canned tomatoes' },
];

/** Cuisine chips (Doc 04 §8). */
export const CUISINE_CHOICES = [
  { value: 'mexican_inspired', label: 'Mexican' },
  { value: 'italian_inspired', label: 'Italian' },
  { value: 'asian_inspired', label: 'Asian-inspired' },
  { value: 'mediterranean_inspired', label: 'Mediterranean' },
  { value: 'american', label: 'American' },
] as const;

/**
 * Whether a step's answers are complete enough to move on. Only the two
 * required steps can block; the rest always pass.
 */
export function canAdvance(step: QuestionnaireStepId, request: PlanRequest): boolean {
  switch (step) {
    case 'household':
      return request.household.size >= 1;
    case 'meals':
      // Doc 04 validation: at least one meal count must be greater than zero.
      return totalMeals(request.meals) > 0 && request.days >= 1;
    default:
      return true;
  }
}

/**
 * Adults + children must sum to the household size when both are given
 * (Doc 04 §1). Returns null when the split is fine or was left blank.
 */
export function householdSplitError(request: PlanRequest): string | null {
  const { size, adults, children } = request.household;
  if (adults === null && children === null) return null;
  const total = (adults ?? 0) + (children ?? 0);
  if (total === size) return null;
  return `Adults and children should add up to ${size}.`;
}
