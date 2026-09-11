// Pure, UI-free model for the signup onboarding flow.
//
// Benefits-first: the flow is 3 steps —
//   1. resources (food, healthcare, bills, and more) -> 2. benefits help
//   -> 3. profile photo
// then an all-set screen, a notifications permission prompt, and a location
// permission prompt. The shelved meal-planning and finance steps (grocery
// budget, bank/EBT connection, finance topics) keep their components and
// storage fields but are no longer part of the flow.

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
  '/(onboarding)/resources',
  '/(onboarding)/benefits',
  '/(onboarding)/profile-photo',
  '/(onboarding)/all-set',
  '/(onboarding)/permissions',
] as const;

export type OnboardingRoute = (typeof ONBOARDING_ROUTES)[number];
