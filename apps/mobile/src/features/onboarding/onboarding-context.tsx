// Draft answers for the expo-router (onboarding) group.
//
// Each step route reads/writes this draft; the permissions route calls
// finish(), which persists everything through app state and leaves the
// onboarding group for the main app.

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { router } from 'expo-router';

import { refreshPushTokenIfPermitted } from '@/features/notifications/notification-service';
import { useAppState, type AppPreferences } from '@/state/app-state';
import { DEFAULT_BUDGET_DOLLARS, formatBudgetDollars } from './onboarding-model';

export type OnboardingDraft = {
  budgetDollars: number;
  setBudgetDollars: (dollars: number) => void;
  financeTopics: string[];
  toggleFinanceTopic: (topic: string) => void;
  resources: string[];
  toggleResource: (resource: string) => void;
  wantsGovAssistance: boolean | null;
  setWantsGovAssistance: (value: boolean) => void;
  profileImageUri?: string;
  setProfileImageUri: (uri?: string) => void;
  notificationsEnabled: boolean;
  setNotificationsEnabled: (enabled: boolean) => void;
  /** Status line surfaced on the permission prompts (e.g. "Notifications skipped…"). */
  statusMessage: string;
  setStatusMessage: (message: string) => void;
  isFinishing: boolean;
  finishError: string;
  finish: () => Promise<void>;
};

const OnboardingDraftContext = createContext<OnboardingDraft | null>(null);

export function useOnboardingDraft(): OnboardingDraft {
  const draft = useContext(OnboardingDraftContext);
  if (!draft) {
    throw new Error('useOnboardingDraft must be used inside OnboardingDraftProvider');
  }
  return draft;
}

function toggleInList(value: string, list: string[]): string[] {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

export function OnboardingDraftProvider({ children }: { children: ReactNode }) {
  const app = useAppState();
  const [budgetDollars, setBudgetDollars] = useState(DEFAULT_BUDGET_DOLLARS);
  const [financeTopics, setFinanceTopics] = useState<string[]>(() => app.preferences.preferredFinanceTopics);
  const [resources, setResources] = useState<string[]>(() => app.preferences.preferredResources);
  const [wantsGovAssistance, setWantsGovAssistance] = useState<boolean | null>(() => app.preferences.wantsGovAssistance);
  const [profileImageUri, setProfileImageUri] = useState<string | undefined>(() => app.profile.profileImageUri);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [isFinishing, setIsFinishing] = useState(false);
  const [finishError, setFinishError] = useState('');

  const toggleFinanceTopic = useCallback((topic: string) => {
    setFinanceTopics((current) => toggleInList(topic, current));
  }, []);

  const toggleResource = useCallback((resource: string) => {
    setResources((current) => toggleInList(resource, current));
  }, []);

  const finish = useCallback(async () => {
    if (isFinishing) {
      return;
    }
    setIsFinishing(true);
    setFinishError('');
    try {
      const preferences: AppPreferences = {
        weeklyBudget: formatBudgetDollars(budgetDollars),
        preferredFinanceTopics: financeTopics,
        preferredResources: resources,
        wantsGovAssistance: wantsGovAssistance ?? false,
        notificationsEnabled,
        expiringPantryNotificationsEnabled: app.preferences.expiringPantryNotificationsEnabled,
        weeklyMealPlanNotificationsEnabled: app.preferences.weeklyMealPlanNotificationsEnabled,
        resourceReminderNotificationsEnabled: app.preferences.resourceReminderNotificationsEnabled,
      };
      await app.completeOnboarding(preferences, profileImageUri);
      if (notificationsEnabled) {
        void refreshPushTokenIfPermitted();
      }
      router.replace('/');
    } catch (error) {
      setFinishError(error instanceof Error ? error.message : 'Unable to save onboarding.');
    } finally {
      setIsFinishing(false);
    }
  }, [app, budgetDollars, financeTopics, isFinishing, notificationsEnabled, profileImageUri, resources, wantsGovAssistance]);

  const value = useMemo<OnboardingDraft>(
    () => ({
      budgetDollars,
      setBudgetDollars,
      financeTopics,
      toggleFinanceTopic,
      resources,
      toggleResource,
      wantsGovAssistance,
      setWantsGovAssistance,
      profileImageUri,
      setProfileImageUri,
      notificationsEnabled,
      setNotificationsEnabled,
      statusMessage,
      setStatusMessage,
      isFinishing,
      finishError,
      finish,
    }),
    [
      budgetDollars,
      financeTopics,
      toggleFinanceTopic,
      resources,
      toggleResource,
      wantsGovAssistance,
      profileImageUri,
      notificationsEnabled,
      statusMessage,
      isFinishing,
      finishError,
      finish,
    ],
  );

  return <OnboardingDraftContext.Provider value={value}>{children}</OnboardingDraftContext.Provider>;
}
