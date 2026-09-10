// Pure, UI-free model for the signup onboarding flow.
//
// The flow mirrors the Xcode app's 6-step onboarding exactly:
//   1. grocery budget -> 2. bank/EBT connection -> 3. finance topics
//   -> 4. resources -> 5. benefits help -> 6. profile photo
// then an all-set screen, a notifications permission prompt, and a location
// permission prompt. The meal questionnaire is intentionally NOT part of
// onboarding; it runs at meal-plan generation time.

export const BUDGET_MIN = 25;
export const BUDGET_MAX = 300;
export const BUDGET_STEP = 5;
export const DEFAULT_BUDGET_DOLLARS = 100;

/** Display/storage form of the budget slider value, e.g. "$100" or "$300+". */
export function formatBudgetDollars(dollars: number): string {
  return dollars >= BUDGET_MAX ? '$300+' : `\$${dollars}`;
}

/** Ordered route hrefs of the signup onboarding flow (expo-router group paths). */
export const ONBOARDING_ROUTES = [
  '/(onboarding)/budget',
  '/(onboarding)/connect-ebt',
  '/(onboarding)/finance-topics',
  '/(onboarding)/resources',
  '/(onboarding)/benefits',
  '/(onboarding)/profile-photo',
  '/(onboarding)/all-set',
  '/(onboarding)/permissions',
] as const;

export type OnboardingRoute = (typeof ONBOARDING_ROUTES)[number];
