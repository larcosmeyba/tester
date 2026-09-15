/**
 * Screen context for Penny AI (Audit Section 7).
 *
 * Penny lives on tab 2, which expo-router and the custom nav stack can't
 * reach with params — so callers stash context here and PennyScreen consumes
 * it on mount (cold entry) or via subscription (warm tap while Penny is open).
 * Same set/consume/subscribe pattern as the benefits pending-deep-link and
 * the pantry pending-purchases modules.
 *
 * TODO(call sites, outside features/penny/): home-screen.tsx and
 * benefits-ready-screen.tsx already carry TODOs to call setPennyContext
 * before switching to the Penny tab.
 */

export type PennyContextSource =
  | 'home'
  | 'benefits-state'
  | 'benefits-program-picker'
  | 'benefits-questionnaire'
  | 'benefits-ready'
  | 'benefits-review'
  | 'meal-plan'
  | 'meal-calendar'
  | 'pantry'
  | 'cook-what-i-have'
  | 'resources'
  | 'other';

export type PennyScreenContext = {
  source: PennyContextSource;
  /** Benefits application IDs the user is asking about, when relevant. */
  applicationIds?: string[];
  /** Filing state, when the context is a benefits application. */
  state?: string;
  /**
   * Suggested opener prefilled into the composer. The user reviews and sends
   * it — nothing is ever sent on their behalf.
   */
  suggestedOpener?: string;
};

export const PENNY_CONTEXT_LABELS: Record<PennyContextSource, string> = {
  home: 'Home',
  'benefits-state': 'Benefits application',
  'benefits-program-picker': 'Benefits application',
  'benefits-questionnaire': 'Benefits application',
  'benefits-ready': 'Benefits application',
  'benefits-review': 'Benefits application',
  'meal-plan': 'Meal plan',
  'meal-calendar': 'Meal calendar',
  pantry: 'Pantry',
  'cook-what-i-have': 'Cook What I Have',
  resources: 'Resources',
  other: 'Help The Hive',
};

/** Sources where the user is mid-application; used for the paywall safety exemption. */
const BENEFITS_SOURCES: ReadonlySet<PennyContextSource> = new Set([
  'benefits-state',
  'benefits-program-picker',
  'benefits-questionnaire',
  'benefits-ready',
  'benefits-review',
]);

export function isBenefitsContext(context: PennyScreenContext | null | undefined): boolean {
  return !!context && BENEFITS_SOURCES.has(context.source);
}

let pending: PennyScreenContext | null = null;

type Listener = (context: PennyScreenContext) => void;
const listeners = new Set<Listener>();

export function setPennyContext(context: PennyScreenContext): void {
  pending = context;
  listeners.forEach((listener) => listener(context));
}

export function consumePennyContext(): PennyScreenContext | null {
  const context = pending;
  pending = null;
  return context;
}

export function subscribePennyContext(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
