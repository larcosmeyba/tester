// Pure, UI-free model for the signup onboarding flow (September 2026
// redesign, from Marcos's Xcode flow).
//
// The flow is: 6 questionnaire steps (resources -> household size -> intent
// -> household income -> finance topics -> profile photo), then the all-set
// screen, then the native push permission prompt, then the location
// explainer + native prompt (ZIP fallback when denied).
//
// Each step is saved server-side as it completes (saveQuestionnaire for the
// answers, saveOnboardingStep for the step marker), so an interrupted
// onboarding resumes at `onboardingState.currentStep`. The keys below are the
// exact step keys sent to the backend.
//
// Resume is answer-driven for the questionnaire: the saved answers say which
// steps are done, so a redesign of the step order never strands a user. Only
// the post-questionnaire markers (all-set / permissions) are key-driven.

import type { QuestionnaireAnswers } from '@helpthehive/api-contract';

/** Backend step keys in flow order. */
export const ONBOARDING_STEP_KEYS = [
  'questionnaire:1',
  'questionnaire:2',
  'questionnaire:3',
  'questionnaire:4',
  'questionnaire:5',
  'questionnaire:6',
  'all-set',
  'permissions:push',
  'permissions:location',
] as const;

export type OnboardingStepKey = (typeof ONBOARDING_STEP_KEYS)[number];

/** Screen indices in the onboarding step machine. */
export const STEP_RESOURCES = 0;
export const STEP_HOUSEHOLD_SIZE = 1;
export const STEP_INTENT = 2;
export const STEP_INCOME = 3;
export const STEP_FINANCE_TOPICS = 4;
export const STEP_PROFILE_PHOTO = 5;
export const STEP_ALL_SET = 6;
export const STEP_PUSH_PERMISSION = 7;
export const STEP_LOCATION = 8;
export const STEP_COUNT = 9;

/** Questionnaire progress steps shown in the top bar (1 of 6, ...). */
export const QUESTIONNAIRE_STEP_COUNT = 6;

/**
 * Maps a saved `onboardingState.currentStep` to the screen index to resume
 * at. Questionnaire markers are answer-driven (the saved answers say which
 * steps are done); post-questionnaire markers map by key. Unknown or missing
 * keys restart at the first questionnaire step.
 */
export function resumeIndexForStepKey(
  stepKey: string | null | undefined,
  answers?: QuestionnaireAnswers | null,
): number {
  const key = stepKey?.trim() ?? '';
  switch (key) {
    case 'all-set':
      return STEP_ALL_SET + 1;
    case 'permissions:push':
      return STEP_PUSH_PERMISSION + 1;
    case 'permissions:location':
      return STEP_COUNT;
    default:
      break;
  }
  // Questionnaire (or a legacy/unknown key): infer from saved answers. The
  // backend fields are stable across redesigns, so this remaps cleanly.
  if (!answers?.resources?.length) {
    return STEP_RESOURCES;
  }
  if (!answers?.householdSize) {
    return STEP_HOUSEHOLD_SIZE;
  }
  if (!answers?.primaryGoal) {
    return STEP_INTENT;
  }
  if (!answers?.incomeBracket) {
    return STEP_INCOME;
  }
  if (!answers?.financeTopics?.length) {
    return STEP_FINANCE_TOPICS;
  }
  return STEP_PROFILE_PHOTO;
}

/** primaryGoal values stored by the questionnaire. */
export const PRIMARY_GOAL_APPLY_BENEFITS = 'APPLY_BENEFITS';
export const PRIMARY_GOAL_BUDGET_MEALS = 'BUDGET_MEALS';

/** Household-size tile options (step 2), stored verbatim as the answer. */
export const HOUSEHOLD_SIZE_OPTIONS = ['1', '2', '3', '4', '5', '6', '7', '8+'] as const;

/** Monthly-income bracket options (step 4), stored verbatim as the answer. */
export const INCOME_BRACKET_OPTIONS = [
  'Less than $1,500',
  '$1,500–$2,499',
  '$2,500–$3,499',
  '$3,500–$4,999',
  '$5,000–$6,999',
  '$7,000+',
  'Prefer not to say',
] as const;
