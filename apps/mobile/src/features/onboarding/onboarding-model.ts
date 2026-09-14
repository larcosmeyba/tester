// Pure, UI-free model for the signup onboarding flow (Sign Up / Login /
// Onboarding v2).
//
// The flow is: 7 questionnaire steps (budget -> finance help -> resources ->
// primary goal -> household size -> household income -> profile photo), then
// the native push permission prompt, the location explainer + native prompt
// (ZIP fallback when denied), the email consent, the phone-call consent, and
// the all-set screen.
//
// Each step is saved server-side as it completes (saveQuestionnaire for the
// answers, saveOnboardingStep for the step marker), so an interrupted
// onboarding resumes at `onboardingState.currentStep`. The keys below are the
// exact step keys sent to the backend.

export const BUDGET_MIN = 25;
export const BUDGET_MAX = 300;
export const BUDGET_STEP = 5;
export const DEFAULT_BUDGET_DOLLARS = 100;

/** Display/storage form of the budget slider value, e.g. "$100" or "$300+". */
export function formatBudgetDollars(dollars: number): string {
  return dollars >= BUDGET_MAX ? '$300+' : `\$${dollars}`;
}

/** Parses a stored "$100" / "$300+" budget back into slider dollars. */
export function parseBudgetDollars(value: string | null | undefined): number {
  if (!value) {
    return DEFAULT_BUDGET_DOLLARS;
  }
  const parsed = Number.parseInt(value.replace(/[^0-9]/g, ''), 10);
  if (Number.isNaN(parsed)) {
    return DEFAULT_BUDGET_DOLLARS;
  }
  return Math.min(BUDGET_MAX, Math.max(BUDGET_MIN, parsed));
}

/** Backend step keys in flow order. */
export const ONBOARDING_STEP_KEYS = [
  'questionnaire:1',
  'questionnaire:2',
  'questionnaire:3',
  'questionnaire:4',
  'questionnaire:5',
  'questionnaire:6',
  'questionnaire:7',
  'permissions:push',
  'permissions:location',
  'consent:email',
  'consent:phone',
  'all-set',
] as const;

export type OnboardingStepKey = (typeof ONBOARDING_STEP_KEYS)[number];

/** Screen index inside the onboarding step machine for a saved step key. */
const STEP_KEY_TO_INDEX: Record<string, number> = {
  'questionnaire:1': 0,
  'questionnaire:2': 1,
  'questionnaire:3': 2,
  'questionnaire:4': 3,
  'questionnaire:5': 4,
  'questionnaire:6': 5,
  'questionnaire:7': 6,
  push: 7,
  'permissions:push': 7,
  location: 8,
  'permissions:location': 8,
  email: 9,
  'consent:email': 9,
  phone: 10,
  'consent:phone': 10,
  'all-set': 11,
};

/**
 * Maps a saved `onboardingState.currentStep` to the screen index to resume
 * at. Unknown or missing keys restart at the first questionnaire step.
 */
export function resumeIndexForStepKey(stepKey: string | null | undefined): number {
  if (!stepKey) {
    return 0;
  }
  return STEP_KEY_TO_INDEX[stepKey.trim()] ?? 0;
}

/** primaryGoal values stored by the questionnaire. */
export const PRIMARY_GOAL_APPLY_BENEFITS = 'APPLY_BENEFITS';
export const PRIMARY_GOAL_BUDGET_MEALS = 'BUDGET_MEALS';

/** Household-size tile options (step 5), stored verbatim as the answer. */
export const HOUSEHOLD_SIZE_OPTIONS = ['1', '2', '3', '4', '5', '6', '7', '8+'] as const;

/** Monthly-income bracket options (step 6), stored verbatim as the answer. */
export const INCOME_BRACKET_OPTIONS = [
  'Less than $1,500',
  '$1,500–$2,499',
  '$2,500–$3,499',
  '$3,500–$4,999',
  '$5,000–$6,999',
  '$7,000+',
  'Prefer not to say',
] as const;
