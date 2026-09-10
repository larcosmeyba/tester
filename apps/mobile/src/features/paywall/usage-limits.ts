// Free-tier usage limits for the Help The Hive freemium model.
//
// Product rules (do not change without a product decision):
// - No ads anywhere in the app.
// - Freemium with SOFT usage limits only.
// - Upgrade prompts appear ONLY after a limit is actually hit — never
//   preemptively, and never in the benefits flow (Government /
//   benefits questionnaire / program application screens must stay
//   completely free of paywalls and Plus promotion).
//
// Free-tier limits, documented here so any screen can enforce them the same
// way:
//
// - Meal-plan generations: 2 per week. A "generation" is one full week plan
//   built by the AI (questionnaire, "cook what I have", or video import all
//   end in the week builder and each count as one).
// - Penny questions: 10 per day. Plain chat questions to Penny the assistant.
// - Video recipe imports: 1 per week. TikTok / Reel / YouTube link
//   transcription into a recipe.
//
// These are soft limits: hitting one just unlocks the upgrade prompt and
// suggests Hive Plus. Nothing else changes about the free experience.

export const FREE_TIER_LIMITS = {
  /** AI meal-plan generations allowed per rolling 7-day window. */
  mealPlanGenerationsPerWeek: 2,
  /** Penny assistant questions allowed per calendar day. */
  pennyQuestionsPerDay: 10,
  /** Video-to-recipe transcriptions allowed per rolling 7-day window. */
  videoRecipeImportsPerWeek: 1,
} as const;

/** How much of each free-tier allowance the user has already consumed. */
export type UsageSnapshot = {
  mealPlanGenerationsThisWeek: number;
  pennyQuestionsToday: number;
  videoRecipeImportsThisWeek: number;
};

export type LimitCheck = {
  /** True only when the user has actually hit a limit — the ONLY time the upgrade prompt may appear. */
  show: boolean;
  /** Which limit was hit, for copy like "You've used your 2 free meal plans this week". */
  hitLimit: 'mealPlanGenerations' | 'pennyQuestions' | 'videoRecipeImports' | null;
};

/**
 * Decide whether the Hive Plus upgrade prompt should appear.
 * Returns show=true only when a limit has actually been reached; otherwise
 * the caller must NOT show any paywall or Plus promotion.
 */
export function shouldShowUpgradePrompt(usage: UsageSnapshot): LimitCheck {
  if (usage.mealPlanGenerationsThisWeek >= FREE_TIER_LIMITS.mealPlanGenerationsPerWeek) {
    return { show: true, hitLimit: 'mealPlanGenerations' };
  }
  if (usage.pennyQuestionsToday >= FREE_TIER_LIMITS.pennyQuestionsPerDay) {
    return { show: true, hitLimit: 'pennyQuestions' };
  }
  if (usage.videoRecipeImportsThisWeek >= FREE_TIER_LIMITS.videoRecipeImportsPerWeek) {
    return { show: true, hitLimit: 'videoRecipeImports' };
  }
  return { show: false, hitLimit: null };
}

/** Human-readable copy for the limit that was hit, used by the upgrade prompt. */
export function limitHitCopy(hitLimit: NonNullable<LimitCheck['hitLimit']>): string {
  switch (hitLimit) {
    case 'mealPlanGenerations':
      return `You've used your ${FREE_TIER_LIMITS.mealPlanGenerationsPerWeek} free meal plans this week.`;
    case 'pennyQuestions':
      return `You've used your ${FREE_TIER_LIMITS.pennyQuestionsPerDay} free Penny questions today.`;
    case 'videoRecipeImports':
      return `You've used your ${FREE_TIER_LIMITS.videoRecipeImportsPerWeek} free video recipe import this week.`;
  }
}
