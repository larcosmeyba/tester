// The AppRoot shell's navigation vocabulary.
//
// AppRoot owns navigation: it keeps a stack of these routes and renders the
// matching screen. The feature screen files import these types so they can take
// a `nav` prop without importing the shell, which would be a cycle.
//
// These are the shell's own routes, not Expo Router's. Every route file under
// src/app currently re-exports the shell, so this union is what actually
// decides which screen a user sees. Un-shimming those routes is the next step.

export type ScreenName =
  | 'welcome'
  | 'signup'
  | 'login'
  | 'forgot'
  | 'verify'
  | 'onboarding'
  | 'main'
  | 'pantry'
  | 'addPantry'
  | 'account'
  | 'editProfile'
  | 'editHandle'
  | 'changeEmail'
  | 'deleteAccount'
  | 'settings'
  | 'notifications'
  | 'budgetSettings'
  | 'feedback'
  | 'deals'
  | 'recipe'
  | 'educationHub'
  | 'video'
  | 'resourcesHub'
  | 'resourceSearch'
  | 'resourceDetails'
  | 'government'
  | 'benefitsQuestionnaire'
  | 'programApplication'
  | 'financeHub'
  | 'spendingReport'
  | 'transactions'
  | 'connectAccount';

export type Route = {
  name: ScreenName;
  params?: Record<string, unknown>;
};

export type Navigation = {
  push: (name: ScreenName, params?: Record<string, unknown>) => void;
  replace: (name: ScreenName, params?: Record<string, unknown>) => void;
  back: () => void;
  reset: (name: ScreenName, params?: Record<string, unknown>) => void;
};
