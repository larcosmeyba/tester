/**
 * The iOS meal-planning questionnaire: 5 steps, 14 questions.
 *
 * Every piece of user-facing copy below is transcribed verbatim from the iOS
 * screenshots (see media_library), except where a question's wording was never
 * captured — those questions are NOT invented. They are declared in
 * `PLACEHOLDER_QUESTIONS` and render as a clearly-marked
 * "AWAITING iOS SCREENSHOT" block so they can never ship with made-up copy.
 *
 * Verified question numbers: 1, 2, 3, 4, 6, 7, 8, 9, 12, 13, 14.
 * Missing (no screenshot): 5, 10, 11 — plus the third spice option on Q9,
 * which was cut off in its screenshot.
 */
import type { HiveIconName } from '@/components/hive-ui';
import {
  budgetRangeBounds,
  type BudgetRangeKey,
  type PlanRequest,
} from '@/features/meals/meal-plan-model';
import type { Allergen, Diet } from '@/features/meals/meal-enums';

export type QuestionnaireStepId = 'household' | 'diets' | 'health' | 'taste' | 'budget';

export type QuestionKind = 'stepper' | 'multi' | 'single';

export interface QuestionOption {
  value: string;
  label: string;
  /** Rendered as a disabled "awaiting screenshot" row — never selectable. */
  pendingCopy?: boolean;
}

export interface QuestionnaireQuestion {
  number: number;
  text: string;
  kind: QuestionKind;
  options?: QuestionOption[];
  /** Two-column chip grid (iOS) vs full-width rows. */
  columns?: 1 | 2;
  warning?: string;
  stepperMin?: number;
  stepperMax?: number;
}

export interface QuestionnaireStep {
  id: QuestionnaireStepId;
  /** 1-based position, shown as "Step N of 5". */
  position: number;
  title: string;
  subtitle: string;
  icon: HiveIconName;
  questions: QuestionnaireQuestion[];
}

/** Exact placeholder copy — mandated by the product brief. */
export const PLACEHOLDER_COPY = 'AWAITING iOS SCREENSHOT — do not ship without real copy';

export interface PlaceholderQuestion {
  number: number;
  /** Rendered after this step's questions, where the numbering jumps. */
  afterStep: QuestionnaireStepId;
}

/**
 * Questions 5, 10 and 11 have no iOS screenshot. They are listed here —
 * never with invented wording — so the renderer can show the placeholder.
 */
export const PLACEHOLDER_QUESTIONS: PlaceholderQuestion[] = [
  { number: 5, afterStep: 'diets' },
  { number: 10, afterStep: 'taste' },
  { number: 11, afterStep: 'taste' },
];

export const QUESTIONNAIRE_STEPS: QuestionnaireStep[] = [
  {
    id: 'household',
    position: 1,
    title: 'Your Household',
    subtitle: "Tell us who we're planning meals for.",
    icon: 'user',
    questions: [
      {
        number: 1,
        text: 'How many people are you planning meals for?',
        kind: 'stepper',
        stepperMin: 1,
        stepperMax: 8,
      },
      {
        number: 2,
        text: 'How many are children?',
        kind: 'stepper',
        stepperMin: 0,
        stepperMax: 8,
      },
    ],
  },
  {
    id: 'diets',
    position: 2,
    title: 'Diets & Restrictions',
    subtitle: "We'll make sure the plan works for everyone at the table.",
    icon: 'shield',
    questions: [
      {
        number: 3,
        text: 'Does anyone in your household follow a specific diet?',
        kind: 'multi',
        columns: 2,
        options: [
          { value: 'none', label: 'None' },
          { value: 'vegetarian', label: 'Vegetarian' },
          { value: 'vegan', label: 'Vegan' },
          { value: 'pescatarian', label: 'Pescatarian' },
          { value: 'halal', label: 'Halal' },
          { value: 'kosher', label: 'Kosher' },
          { value: 'keto_low_carb', label: 'Keto / Low-Carb' },
          { value: 'other', label: 'Other' },
        ],
      },
      {
        number: 4,
        text: 'Any food allergies or intolerances?',
        kind: 'multi',
        columns: 2,
        warning: 'Allergies are always treated as hard restrictions.',
        options: [
          { value: 'none', label: 'None' },
          { value: 'peanuts', label: 'Peanuts' },
          { value: 'tree_nuts', label: 'Tree Nuts' },
          { value: 'dairy_lactose', label: 'Dairy / Lactose' },
          { value: 'eggs', label: 'Eggs' },
          { value: 'gluten_wheat', label: 'Gluten / Wheat' },
          { value: 'shellfish', label: 'Shellfish' },
          { value: 'fish', label: 'Fish' },
        ],
      },
    ],
  },
  {
    id: 'health',
    position: 3,
    title: 'Health & Goals',
    subtitle: "We'll personalize your meals. This is never medical advice.",
    icon: 'heart',
    questions: [
      {
        number: 6,
        text: 'Any health considerations to keep in mind?',
        kind: 'multi',
        columns: 2,
        options: [
          { value: 'high_blood_pressure', label: 'High Blood Pressure' },
          { value: 'diabetes_high_blood_sugar', label: 'Diabetes / High Blood Sugar' },
          { value: 'pre_diabetes', label: 'Pre-Diabetes' },
          { value: 'high_cholesterol', label: 'High Cholesterol' },
          { value: 'kidney_health', label: 'Kidney Health' },
          { value: 'pregnant_or_breastfeeding', label: 'Pregnant or Breastfeeding' },
          { value: 'none_of_these', label: 'None of These' },
          { value: 'prefer_not_to_say', label: 'Prefer Not to Say' },
        ],
      },
      {
        number: 7,
        text: 'What goals would you like your plan to support?',
        kind: 'multi',
        columns: 2,
        options: [
          { value: 'eat_healthier_overall', label: 'Eat Healthier Overall' },
          { value: 'manage_weight', label: 'Manage Weight' },
          { value: 'more_energy', label: 'More Energy' },
          { value: 'build_muscle', label: 'Build Muscle' },
          { value: 'doctor_recommended_diet', label: 'Doctor-Recommended Diet' },
          { value: 'no_specific_goal', label: 'No Specific Goal' },
        ],
      },
    ],
  },
  {
    id: 'taste',
    position: 4,
    title: 'Taste & Cooking',
    subtitle: "Help us match meals to your family's taste and schedule.",
    icon: 'fork',
    questions: [
      {
        number: 8,
        text: 'What types of food do you enjoy most?',
        kind: 'multi',
        columns: 2,
        options: [
          { value: 'american', label: 'American' },
          { value: 'mexican', label: 'Mexican' },
          { value: 'italian', label: 'Italian' },
          { value: 'caribbean', label: 'Caribbean' },
          { value: 'soul_food', label: 'Soul Food' },
          { value: 'mediterranean', label: 'Mediterranean' },
          { value: 'asian', label: 'Asian' },
          { value: 'indian', label: 'Indian' },
          { value: 'african', label: 'African' },
          { value: 'middle_eastern', label: 'Middle Eastern' },
          { value: 'surprise_me', label: 'Surprise Me' },
        ],
      },
      {
        number: 9,
        text: 'How spicy do you like your food?',
        kind: 'single',
        columns: 1,
        options: [
          { value: 'mild', label: 'Mild' },
          { value: 'medium', label: 'Medium' },
          // The iOS screenshot cuts off below "Medium" — the third option's
          // real wording is unknown, so it is NOT invented.
          { value: '__pending__', label: PLACEHOLDER_COPY, pendingCopy: true },
        ],
      },
    ],
  },
  {
    id: 'budget',
    position: 5,
    title: 'Meal Planning & Budget',
    subtitle: "Almost there! Let's set up your weekly plan.",
    icon: 'card',
    questions: [
      {
        number: 12,
        text: 'How many dinners would you like planned each week?',
        kind: 'stepper',
        stepperMin: 1,
        stepperMax: 7,
      },
      {
        number: 13,
        text: 'Which meals would you like included in your plan?',
        kind: 'multi',
        columns: 2,
        options: [
          { value: 'breakfast', label: 'Breakfast' },
          { value: 'lunch', label: 'Lunch' },
          { value: 'dinner', label: 'Dinner' },
        ],
      },
      {
        number: 14,
        text: 'About how much would you like to spend on groceries per week?',
        kind: 'single',
        columns: 1,
        options: [
          { value: 'under_75', label: 'Under $75' },
          { value: '75_150', label: '$75–$150' },
          { value: '150_250', label: '$150–$250' },
        ],
      },
    ],
  },
];

/** Q14 options as typed budget-range values (labels are the exact iOS copy). */
export const BUDGET_RANGE_OPTIONS: { value: BudgetRangeKey; label: string }[] = [
  { value: 'under_75', label: 'Under $75' },
  { value: '75_150', label: '$75–$150' },
  { value: '150_250', label: '$150–$250' },
];

// ---------------------------------------------------------------------------
// Answers
// ---------------------------------------------------------------------------

export interface IosQuestionnaireAnswers {
  householdSize: number;
  children: number;
  diets: string[];
  allergies: string[];
  healthConsiderations: string[];
  goals: string[];
  cuisines: string[];
  spiceLevel: string | null;
  dinnersPerWeek: number;
  mealTypes: ('breakfast' | 'lunch' | 'dinner')[];
  budgetRange: BudgetRangeKey | null;
}

/** Defaults mirror the iOS screenshots (Q1=2, Q2=0, Q12=5, Q13=Dinner, Q14=$75–$150). */
export const DEFAULT_IOS_ANSWERS: IosQuestionnaireAnswers = {
  householdSize: 2,
  children: 0,
  diets: [],
  allergies: [],
  healthConsiderations: [],
  goals: [],
  cuisines: [],
  spiceLevel: null,
  dinnersPerWeek: 5,
  mealTypes: ['dinner'],
  budgetRange: '75_150',
};

/**
 * Whether the step's answers are complete enough to move on. Household size
 * always has a value (stepper, min 1); the final step needs at least one meal
 * category and a budget range.
 */
export function canAdvance(step: QuestionnaireStepId, answers: IosQuestionnaireAnswers): boolean {
  switch (step) {
    case 'household':
      return (
        answers.householdSize >= 1 &&
        answers.children >= 0 &&
        answers.children <= answers.householdSize
      );
    case 'budget':
      return (
        answers.mealTypes.length > 0 && answers.budgetRange !== null && answers.dinnersPerWeek >= 1
      );
    default:
      return true;
  }
}

// ---------------------------------------------------------------------------
// Mapping to PlanRequest
// ---------------------------------------------------------------------------

const DIET_LABEL_TO_DIET: Record<string, Diet> = {
  vegetarian: 'vegetarian',
  vegan: 'vegan',
  pescatarian: 'pescatarian',
};

const ALLERGY_LABEL_TO_ALLERGEN: Record<string, Allergen> = {
  peanuts: 'peanut',
  tree_nuts: 'tree_nut',
  dairy_lactose: 'milk',
  eggs: 'egg',
  gluten_wheat: 'wheat',
  shellfish: 'shellfish',
  fish: 'fish',
};

const CUISINE_LABEL_TO_VALUE: Record<string, string> = {
  american: 'american',
  mexican: 'mexican',
  italian: 'italian',
  caribbean: 'caribbean',
  soul_food: 'soul_food',
  mediterranean: 'mediterranean',
  asian: 'asian',
  indian: 'indian',
  african: 'african',
  middle_eastern: 'middle_eastern',
  surprise_me: 'surprise_me',
};

function withoutNone(values: string[]): string[] {
  return values.filter((value) => value !== 'none');
}

/**
 * Folds the iOS answers into the `PlanRequest` the backend expects.
 *
 * - Children count as full servings: household size is the serving count.
 * - Snacks are deferred (B/L/D only) — snack count is always 0.
 * - The Q14 range drives the budget: the range top becomes the plan budget so
 *   the existing "estimated cost fits inside budget" check stays meaningful.
 */
export function applyIosAnswers(
  request: PlanRequest,
  answers: IosQuestionnaireAnswers,
): PlanRequest {
  const diets = withoutNone(answers.diets);
  const allergies = withoutNone(answers.allergies);

  const dietaryRequirements = diets
    .filter((value) => DIET_LABEL_TO_DIET[value] !== undefined)
    .map((value) => ({ diet: DIET_LABEL_TO_DIET[value]!, strength: 'required' as const }));
  const unmappedDiets = diets.filter((value) => DIET_LABEL_TO_DIET[value] === undefined);
  const dietaryOtherText = unmappedDiets.length > 0 ? unmappedDiets.join(', ') : null;

  const range = answers.budgetRange ? budgetRangeBounds(answers.budgetRange) : null;
  const budgetAmount = range?.maxCents != null ? range.maxCents / 100 : 0;

  const children = Math.max(0, Math.min(answers.children, answers.householdSize));

  return {
    ...request,
    household: {
      size: answers.householdSize,
      adults: answers.householdSize - children,
      children,
      sizeIsPlus: false,
    },
    meals: {
      breakfast: answers.mealTypes.includes('breakfast') ? answers.dinnersPerWeek : 0,
      lunch: answers.mealTypes.includes('lunch') ? answers.dinnersPerWeek : 0,
      dinner: answers.mealTypes.includes('dinner') ? answers.dinnersPerWeek : 0,
      snack: 0,
    },
    days: 7,
    budget: {
      amount: budgetAmount,
      currency: 'USD',
      enabled: budgetAmount > 0,
      mode: 'balanced',
    },
    dietaryRequirements,
    dietaryOtherText,
    allergies: allergies
      .filter((value) => ALLERGY_LABEL_TO_ALLERGEN[value] !== undefined)
      .map((value) => ({
        allergen: ALLERGY_LABEL_TO_ALLERGEN[value]!,
        strength: 'required' as const,
      })),
    likes: {
      ...request.likes,
      cuisines: withoutNone(answers.cuisines)
        .map((value) => CUISINE_LABEL_TO_VALUE[value] ?? value)
        .filter(Boolean),
    },
    healthConsiderations: withoutNone(answers.healthConsiderations),
    planGoals: withoutNone(answers.goals),
    spiceLevel: answers.spiceLevel,
    dinnersPerWeek: answers.dinnersPerWeek,
    budgetRange: answers.budgetRange,
  };
}

/**
 * Common pantry staples. Each maps to a canonical ingredient id.
 * Nothing is pre-checked — we must not assume a household owns anything.
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
