/**
 * The Swift questionnaire's answer set, and its mapping to the real
 * `PlanRequest` the `generateMealPlan` mutation expects.
 *
 * This is the RN equivalent of the Swift file's `buildRequest()`. Every answer
 * the Swift design collects is represented here; the mapping notes where the
 * backend has no matching field (spice, skill level, shopping preference, and
 * health conditions/goals without a nutrition-goal equivalent are persisted
 * with the answers but not sent — inventing a mapping for them would be
 * worse than leaving them out).
 *
 * Locked product rules, applied here:
 * - Breakfast / lunch / dinner only. The snack count is always 0, even though
 *   `PlanRequest` carries a snack field.
 * - Kids count as full servings: the household split is sent as given and the
 *   server scales every serving from it.
 * - Allergies are always `required` strength. The server rejects anything else.
 */
import {
  MAX_CHILDREN_COUNT,
  MAX_HOUSEHOLD_SIZE,
  MAX_PLAN_DAYS,
  MIN_PLAN_DAYS,
} from '@/features/meals/questionnaire-steps';
import { createEmptyPlanRequest, type PlanRequest } from '@/features/meals/meal-plan-model';
import type { Allergen, Diet, Equipment, NutritionGoal } from '@/features/meals/meal-enums';

export interface MealQuestionnaireAnswers {
  householdSize: number;
  childrenCount: number;
  childrenAges: string[];
  diets: string[];
  dietOtherText: string;
  allergies: string[];
  allergyOtherText: string;
  dislikes: string;
  health: string[];
  goals: string[];
  doctorDietText: string;
  cuisines: string[];
  spice: string;
  cookTime: string;
  skill: string;
  equipment: string[];
  dinnersPerWeek: number;
  mealTypes: string[];
  budget: string;
  shopping: string;
}

/** The Swift view's initial values: 2 people, 5 dinners, dinner planned. */
export const DEFAULT_ANSWERS: MealQuestionnaireAnswers = {
  householdSize: 2,
  childrenCount: 0,
  childrenAges: [],
  diets: [],
  dietOtherText: '',
  allergies: [],
  allergyOtherText: '',
  dislikes: '',
  health: [],
  goals: [],
  doctorDietText: '',
  cuisines: [],
  spice: '',
  cookTime: '',
  skill: '',
  equipment: [],
  dinnersPerWeek: 5,
  mealTypes: ['Dinner'],
  budget: '',
  shopping: '',
};

/**
 * Chip-toggle semantics from the Swift `MQChipGrid`: an exclusive option
 * replaces the whole selection (tapping it again clears it); any other option
 * toggles itself and clears the exclusive ones.
 */
export function toggleChip(
  selected: string[],
  option: string,
  exclusive?: string | string[],
): string[] {
  const exclusives = exclusive === undefined ? [] : Array.isArray(exclusive) ? exclusive : [exclusive];
  if (exclusives.includes(option)) {
    return selected.includes(option) ? [] : [option];
  }
  const next = new Set(selected);
  for (const exclusiveOption of exclusives) next.delete(exclusiveOption);
  if (next.has(option)) {
    next.delete(option);
  } else {
    next.add(option);
  }
  return [...next];
}

/** Swift diet labels that have a backend diet enum. The rest ride in `dietaryOtherText`. */
const DIET_TO_ENUM: Record<string, Diet> = {
  Vegetarian: 'vegetarian',
  Vegan: 'vegan',
  Pescatarian: 'pescatarian',
};

const ALLERGY_TO_ENUM: Record<string, Allergen> = {
  Peanuts: 'peanut',
  'Tree Nuts': 'tree_nut',
  'Dairy / Lactose': 'milk',
  Eggs: 'egg',
  'Gluten / Wheat': 'wheat',
  Shellfish: 'shellfish',
  Fish: 'fish',
  Soy: 'soy',
  Sesame: 'sesame',
};

const EQUIPMENT_TO_ENUM: Record<string, Equipment> = {
  'Stove / Cooktop': 'stovetop',
  'Oven / Baking': 'oven',
  Microwave: 'microwave',
  'Slow Cooker': 'slow_cooker',
  'Air Fryer': 'air_fryer',
  'Instant Pot': 'instant_pot',
  Grill: 'grill',
  Blender: 'blender',
  'Microwave Only': 'microwave',
};

/**
 * Only the health conditions and goals with a genuine backend nutrition-goal
 * equivalent are mapped, as soft (`preferred`) hints. Everything else —
 * diabetes, cholesterol, kidney health, pregnancy, "More Energy",
 * "Doctor-Recommended Diet" — is collected in the UI and persisted with the
 * answers, but the backend has no nutrition-goal enum for it, so it is not
 * sent. The Swift reference's `buildRequest()` dropped these too.
 */
const HEALTH_TO_GOAL: Record<string, NutritionGoal> = {
  'High Blood Pressure': 'lower_sodium',
};

const GOAL_TO_GOAL: Record<string, NutritionGoal> = {
  'Eat Healthier Overall': 'balanced',
  'Manage Weight': 'lower_calorie',
  'Build Muscle': 'high_protein',
};

/**
 * Budget ranges map to the top of the range. "$250+" has no top bound, so it
 * — like "No Preference" and a blank answer — means no budget cap.
 */
const BUDGET_TO_AMOUNT: Record<string, number> = {
  'Under $75': 75,
  '$75–$150': 150,
  '$150–$250': 250,
};

/** "40+ Minutes" and "Depends on the Day" are not caps, so they map to null. */
const COOK_TIME_TO_MINUTES: Record<string, number | null> = {
  'Under 20 Minutes': 20,
  '20–40 Minutes': 40,
  '40+ Minutes': null,
  'Depends on the Day': null,
};

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, Number.isFinite(value) ? Math.trunc(value) : min));

const unique = <T>(values: T[]): T[] => [...new Set(values)];

/**
 * Builds the real generation request from the Swift questionnaire's answers.
 * `pantryNames` are the active pantry item names from the pantry-confirm step
 * (the Swift reference sends names; the server resolves them when matching).
 */
export function toPlanRequest(
  answers: MealQuestionnaireAnswers,
  pantryNames: string[],
): PlanRequest {
  const request = createEmptyPlanRequest();

  const size = clamp(answers.householdSize, 1, MAX_HOUSEHOLD_SIZE);
  const children = clamp(answers.childrenCount, 0, Math.min(MAX_CHILDREN_COUNT, size));
  request.household = {
    size,
    adults: Math.max(1, size - children),
    children,
    // The stepper tops out at a "10+" label, so 10 means "10 or more".
    sizeIsPlus: size >= MAX_HOUSEHOLD_SIZE,
  };

  const days = clamp(answers.dinnersPerWeek, MIN_PLAN_DAYS, MAX_PLAN_DAYS);
  request.days = days;
  const plansMeal = (label: string): boolean => answers.mealTypes.includes(label);
  // No snack slot in this flow, ever.
  let meals = {
    breakfast: plansMeal('Breakfast') ? days : 0,
    lunch: plansMeal('Lunch') ? days : 0,
    dinner: plansMeal('Dinner') ? days : 0,
    snack: 0,
  };
  if (meals.breakfast + meals.lunch + meals.dinner === 0) {
    // Swift fallback: an emptied selection plans all three meal types.
    meals = { breakfast: days, lunch: days, dinner: days, snack: 0 };
  }
  request.meals = meals;

  const budgetAmount = BUDGET_TO_AMOUNT[answers.budget] ?? 0;
  request.budget = {
    amount: budgetAmount,
    currency: 'USD',
    enabled: budgetAmount > 0,
    mode: 'balanced',
  };

  request.pantryItems = unique(
    pantryNames.map((name) => name.trim()).filter((name) => name.length > 0),
  );

  const dietEnums = unique(
    answers.diets
      .filter((diet) => diet !== 'None' && diet !== 'Other')
      .map((diet) => DIET_TO_ENUM[diet])
      .filter((diet): diet is Diet => diet !== undefined),
  );
  request.dietaryRequirements = dietEnums.map((diet) => ({ diet, strength: 'required' as const }));
  // Halal, Kosher and Keto / Low-Carb have no backend enum; they travel as text.
  const otherDietText = unique([
    ...answers.diets.filter(
      (diet) => diet !== 'None' && diet !== 'Other' && DIET_TO_ENUM[diet] === undefined,
    ),
    answers.dietOtherText.trim(),
  ]).filter((text) => text.length > 0);
  request.dietaryOtherText = otherDietText.length > 0 ? otherDietText.join('; ') : null;

  const allergenEnums = unique(
    answers.allergies
      .filter((allergy) => allergy !== 'None' && allergy !== 'Other')
      .map((allergy) => ALLERGY_TO_ENUM[allergy])
      .filter((allergen): allergen is Allergen => allergen !== undefined),
  );
  request.allergies = allergenEnums.map((allergen) => ({ allergen, strength: 'required' as const }));
  const otherAllergy = answers.allergyOtherText.trim();
  request.allergyIngredients = otherAllergy.length > 0 ? [otherAllergy] : [];

  const dislikes = answers.dislikes.trim();
  request.dislikes = { ingredients: [], cuisines: [], freeText: dislikes.length > 0 ? dislikes : null };

  // The backend takes cuisine names as free strings, so the Swift labels pass through.
  request.likes = {
    ingredients: [],
    cuisines: answers.cuisines.filter((cuisine) => cuisine !== 'Surprise Me'),
    freeText: null,
  };

  const nutritionGoals = unique([
    ...answers.health
      .filter((item) => item !== 'None of These' && item !== 'Prefer Not to Say')
      .map((item) => HEALTH_TO_GOAL[item])
      .filter((goal): goal is NutritionGoal => goal !== undefined),
    ...answers.goals
      .filter((goal) => goal !== 'No Specific Goal')
      .map((goal) => GOAL_TO_GOAL[goal])
      .filter((goal): goal is NutritionGoal => goal !== undefined),
  ]);
  request.nutritionPreferences = nutritionGoals.map((goal) => ({
    goal,
    strength: 'preferred' as const,
  }));

  const maxMinutes =
    answers.cookTime in COOK_TIME_TO_MINUTES ? COOK_TIME_TO_MINUTES[answers.cookTime] : null;
  request.cookingTime = { maxMinutes: maxMinutes ?? null, strength: 'preferred' };

  request.equipment = unique(
    answers.equipment
      .map((item) => EQUIPMENT_TO_ENUM[item])
      .filter((item): item is Equipment => item !== undefined),
  );

  // Spice level, skill level and shopping preference have no backend request
  // field, so they stay with the persisted answers (see questionnaire-storage).
  return request;
}
