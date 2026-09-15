/**
 * The AI meal-plan questionnaire — the 7-step design from Marcos's SwiftUI
 * sandbox (`22_-_MealPlanQuestionnaireView`), rebuilt in React Native.
 *
 * Step order and copy follow the Swift file exactly, including its question
 * numbering — except the grocery-shopping question, which the Swift file
 * labels "15." a second time and is renumbered here to "16.".
 *
 * Product rules this flow must never break:
 * - Breakfast / lunch / dinner only. There is no snack slot anywhere in this
 *   flow, even though the shared `PlanRequest` model has a snack count.
 * - Kids count as full servings when the request is built.
 * - Allergies are always hard restrictions (`required` strength).
 */
import type { HiveIconName } from '@/components/hive-ui';

export type QuestionnaireStepId =
  | 'household'
  | 'diets'
  | 'health'
  | 'taste'
  | 'kitchen'
  | 'planning'
  | 'pantry';

export type QuestionnaireStep = {
  id: QuestionnaireStepId;
  /** Decorative header icon (HiveIcon name), tinted per step like the Swift design. */
  icon: HiveIconName;
  iconTint: string;
  title: string;
  subtitle: string;
};

export const QUESTIONNAIRE_STEPS: QuestionnaireStep[] = [
  {
    id: 'household',
    icon: 'users',
    iconTint: '#3887FF',
    title: 'Your Household',
    subtitle: "Tell us who we're planning meals for.",
  },
  {
    id: 'diets',
    icon: 'leaf',
    iconTint: '#38A64D',
    title: 'Diets & Restrictions',
    subtitle: "We'll make sure the plan works for everyone at the table.",
  },
  {
    id: 'health',
    icon: 'heart',
    iconTint: '#D9404D',
    title: 'Health & Goals',
    subtitle: "We'll personalize your meals. This is never medical advice.",
  },
  {
    id: 'taste',
    icon: 'fork',
    iconTint: '#F28C1A',
    title: 'Taste & Cooking',
    subtitle: "Help us match meals to your family's taste and schedule.",
  },
  {
    id: 'kitchen',
    icon: 'box',
    iconTint: '#D9772A',
    title: 'Your Kitchen',
    subtitle: 'Penny only plans meals you can actually make with what you have.',
  },
  {
    id: 'planning',
    icon: 'dollar',
    iconTint: '#1F8C33',
    title: 'Meal Planning & Budget',
    subtitle: "Almost there! Let's set up your weekly plan.",
  },
  {
    id: 'pantry',
    icon: 'fridge',
    iconTint: '#1F8C33',
    title: 'Confirm your Pantry + Fridge',
    subtitle:
      "Penny will try to use what you already have. Remove anything you no longer have, or add items we're missing.",
  },
];

/** Swift steppers: household 1...10 with a "10+" label at the top end. */
export const MIN_HOUSEHOLD_SIZE = 1;
export const MAX_HOUSEHOLD_SIZE = 10;
export const HOUSEHOLD_SIZE_PLUS_LABEL = '10+';
export const MAX_CHILDREN_COUNT = 10;

/** Swift: dinners-per-week stepper, 1...7. */
export const MIN_PLAN_DAYS = 1;
export const MAX_PLAN_DAYS = 7;

/** Question 2 follow-up, shown only when at least one child is counted. */
export const CHILD_AGE_RANGES = ['0–3', '4–8', '9–12', '13–17'];

/** Q3. "None" is exclusive: picking it clears every other diet. */
export const DIET_OPTIONS = [
  'None',
  'Vegetarian',
  'Vegan',
  'Pescatarian',
  'Halal',
  'Kosher',
  'Keto / Low-Carb',
  'Other',
];
export const DIET_EXCLUSIVE_OPTION = 'None';

/** Q4. "None" is exclusive. */
export const ALLERGY_OPTIONS = [
  'None',
  'Peanuts',
  'Tree Nuts',
  'Dairy / Lactose',
  'Eggs',
  'Gluten / Wheat',
  'Shellfish',
  'Fish',
  'Soy',
  'Sesame',
  'Other',
];
export const ALLERGY_EXCLUSIVE_OPTION = 'None';

/** Q6. Both exclusives clear every other health consideration. */
export const HEALTH_OPTIONS = [
  'High Blood Pressure',
  'Diabetes / High Blood Sugar',
  'Pre-Diabetes',
  'High Cholesterol',
  'Kidney Health',
  'Pregnant or Breastfeeding',
  'None of These',
  'Prefer Not to Say',
];
export const HEALTH_EXCLUSIVE_OPTIONS = ['None of These', 'Prefer Not to Say'];

/** Q7. "No Specific Goal" is exclusive. */
export const GOAL_OPTIONS = [
  'Eat Healthier Overall',
  'Manage Weight',
  'More Energy',
  'Build Muscle',
  'Doctor-Recommended Diet',
  'No Specific Goal',
];
export const GOAL_EXCLUSIVE_OPTION = 'No Specific Goal';

/** Q8. "Surprise Me" is exclusive. */
export const CUISINE_OPTIONS = [
  'American',
  'Mexican',
  'Italian',
  'Caribbean',
  'Soul Food',
  'Mediterranean',
  'Asian',
  'Indian',
  'African',
  'Middle Eastern',
  'Surprise Me',
];
export const CUISINE_EXCLUSIVE_OPTION = 'Surprise Me';

/** Q9–Q11 single-selects. */
export const SPICE_OPTIONS = ['Mild', 'Medium', 'Hot'];
export const COOK_TIME_OPTIONS = [
  'Under 20 Minutes',
  '20–40 Minutes',
  '40+ Minutes',
  'Depends on the Day',
];
export const SKILL_OPTIONS = ['Beginner', 'Comfortable', 'Confident Cook'];

/** Q12. "Microwave Only" is exclusive — it replaces every other equipment pick. */
export const EQUIPMENT_OPTIONS = [
  'Stove / Cooktop',
  'Oven / Baking',
  'Microwave',
  'Slow Cooker',
  'Air Fryer',
  'Instant Pot',
  'Grill',
  'Blender',
  'Microwave Only',
];
export const EQUIPMENT_EXCLUSIVE_OPTION = 'Microwave Only';

/** Q14. Breakfast / lunch / dinner only — no snack slot, per the product rules. */
export const MEAL_TYPE_OPTIONS = ['Breakfast', 'Lunch', 'Dinner'];

/** Q15. "$250+" has no top bound, so it maps to no budget cap (see answers). */
export const BUDGET_OPTIONS = ['Under $75', '$75–$150', '$150–$250', '$250+', 'No Preference'];

/** Q16 (renumbered — the Swift file labels this "15." a second time). */
export const SHOPPING_OPTIONS = ['Give Me a Grocery List', 'Shop with Instacart', "I'm Not Sure Yet"];
