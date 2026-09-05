import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { DEV_PREVIEW_AUTH_ENABLED } from '@/auth/dev-preview';

import { useAuth } from '@/auth/auth-context';
import {
  type Deal,
  type ItemStatus,
  initialPantryItems,
  type PantryItem,
  type StorageLocation,
  type WasteStats,
} from '@/data/mock-data';
import {
  completeOnboarding as completeOnboardingRemote,
  checkHandleAvailability as checkHandleAvailabilityRemote,
  type HandleAvailability,
  fetchViewer,
  type PreferencesUpdate,
  type ProfileUpdate,
  updateProfile as updateProfileRemote,
  updatePreferences as updatePreferencesRemote,
  updateHandle as updateHandleRemote,
  type ViewerData,
} from '@/features/profile/profile-repository';
import { refreshPushTokenIfPermitted } from '@/features/notifications/notification-service';
import { clearPendingSignupProfile, loadPendingSignupProfile, savePendingSignupProfile } from './pending-signup-storage';

export type AppProfile = {
  handle?: string;
  firstName: string;
  lastName: string;
  phone: string;
  zip: string;
  householdSize: number;
  profileImageUri?: string;
};

export type GovernmentProfile = {
  completed: boolean;
  firstName: string;
  lastName: string;
  state: string;
  householdSize: number;
  householdMembers: string[];
  employmentStatus: string;
  monthlyIncome: string;
  housingStatus: string;
  monthlyRent: string;
};

export type AppPreferences = {
  weeklyBudget: string;
  preferredFinanceTopics: string[];
  preferredResources: string[];
  wantsGovAssistance: boolean;
  lastMealPlanDate?: string;
  notificationsEnabled: boolean;
  expiringPantryNotificationsEnabled: boolean;
  weeklyMealPlanNotificationsEnabled: boolean;
  resourceReminderNotificationsEnabled: boolean;
};

export type AppRoute = 'welcome' | 'onboarding' | 'main';

type PersistedState = {
  profileOwnerSubject?: string;
  pendingSignupProfile?: PendingSignupProfile;
  hasCompletedOnboarding: boolean;
  hasSeenTour: boolean;
  selectedTab: number;
  ebtConnected: boolean;
  profile: AppProfile;
  preferences: AppPreferences;
  governmentProfile: GovernmentProfile;
  pantryItems: PantryItem[];
  cart: Deal[];
};

type AppStateContextValue = PersistedState & {
  isReady: boolean;
  profileSyncState: 'idle' | 'loading' | 'ready' | 'error';
  profileSyncError: string;
  displayName: string;
  formName: { firstName: string; lastName: string };
  activePantryItems: PantryItem[];
  expiringItems: PantryItem[];
  usedItems: PantryItem[];
  expiredItems: PantryItem[];
  wasteStats: WasteStats;
  shouldPromptNewMealPlan: boolean;
  setSelectedTab: (tab: number) => void;
  hydrateViewer: () => Promise<void>;
  completeOnboarding: (preferences: AppPreferences, profileImageUri?: string) => Promise<void>;
  markTourSeen: () => void;
  saveProfile: (profile: ProfileUpdate) => Promise<void>;
  checkHandleAvailability: (handle: string) => Promise<HandleAvailability>;
  saveHandle: (handle: string) => Promise<void>;
  savePreferences: (preferences: PreferencesUpdate) => Promise<void>;
  setLocalProfileImage: (profileImageUri?: string) => void;
  rememberPendingSignup: (profile: PendingSignupProfile) => void;
  updateGovernmentProfile: (profile: Partial<GovernmentProfile>) => void;
  setEbtConnected: (connected: boolean) => void;
  addPantryItem: (item: PantryItem) => void;
  updatePantryItemStatus: (itemId: string, status: ItemStatus) => void;
  deletePantryItem: (itemId: string) => void;
  addToCart: (deal: Deal) => void;
  clearCart: () => void;
  isInCart: (dealId: string) => boolean;
  markMealPlanGenerated: () => Promise<void>;
};

export type PendingSignupProfile = {
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
};

const defaultProfile: AppProfile = {
  firstName: '',
  lastName: '',
  phone: '',
  zip: '',
  householdSize: 1,
};

const defaultGovernmentProfile: GovernmentProfile = {
  completed: false,
  firstName: '',
  lastName: '',
  state: '',
  householdSize: 1,
  householdMembers: [],
  employmentStatus: '',
  monthlyIncome: '',
  housingStatus: '',
  monthlyRent: '',
};

const defaultPreferences: AppPreferences = {
  weeklyBudget: '',
  preferredFinanceTopics: [],
  preferredResources: [],
  wantsGovAssistance: false,
  notificationsEnabled: false,
  expiringPantryNotificationsEnabled: true,
  weeklyMealPlanNotificationsEnabled: true,
  resourceReminderNotificationsEnabled: false,
};

const defaultState: PersistedState = {
  hasCompletedOnboarding: false,
  hasSeenTour: false,
  selectedTab: 0,
  ebtConnected: false,
  profile: defaultProfile,
  preferences: defaultPreferences,
  governmentProfile: defaultGovernmentProfile,
  pantryItems: initialPantryItems,
  cart: [],
};

const storageKey = 'hth_expo_app_state';
const AppStateContext = createContext<AppStateContextValue | null>(null);
const sessionStartedAt = Date.now();

function profileFromViewer(profile: ViewerData['profile'], localImageUri?: string): AppProfile {
  return {
    handle: profile.handle ?? undefined,
    firstName: profile.firstName,
    lastName: profile.lastName,
    phone: profile.phone,
    zip: profile.zip,
    householdSize: profile.householdSize,
    profileImageUri: localImageUri,
  };
}

function preferencesFromViewer(preferences: ViewerData['preferences']): AppPreferences {
  return {
    weeklyBudget: preferences.weeklyBudget,
    preferredFinanceTopics: preferences.preferredFinanceTopics,
    preferredResources: preferences.preferredResources,
    wantsGovAssistance: preferences.wantsGovAssistance,
    lastMealPlanDate: preferences.lastMealPlanDate ?? undefined,
    notificationsEnabled: preferences.notificationsEnabled,
    expiringPantryNotificationsEnabled: preferences.expiringPantryNotificationsEnabled,
    weeklyMealPlanNotificationsEnabled: preferences.weeklyMealPlanNotificationsEnabled,
    resourceReminderNotificationsEnabled: preferences.resourceReminderNotificationsEnabled,
  };
}

function fallbackName(name: string | undefined) {
  const parts = name?.trim().split(/\s+/).filter(Boolean) ?? [];
  return { firstName: parts[0] ?? '', lastName: parts.slice(1).join(' ') };
}

function isExpired(item: PantryItem) {
  return item.status === 'active' && new Date(item.expirationDate).getTime() < Date.now();
}

function normalizePantryItems(items: PantryItem[]) {
  return items.map((item) => (isExpired(item) ? { ...item, status: 'expired' as ItemStatus } : item));
}

function getWasteStats(items: PantryItem[]): WasteStats {
  const expired = items.filter((item) => item.status === 'expired');
  const categoryCounts = expired.reduce<Record<string, number>>((acc, item) => {
    acc[item.category] = (acc[item.category] ?? 0) + 1;
    return acc;
  }, {});
  const mostWastedCategories = Object.entries(categoryCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([category]) => category);

  return {
    totalAdded: items.length,
    totalUsed: items.filter((item) => item.status === 'used').length,
    totalExpired: expired.length,
    estimatedWasteValue: expired.length * 2.5,
    mostWastedCategories,
  };
}

export function AppStateProvider({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const [state, setState] = useState<PersistedState>(defaultState);
  const [isLocalReady, setIsLocalReady] = useState(false);
  const [profileSyncState, setProfileSyncState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [profileSyncError, setProfileSyncError] = useState('');
  const lastHydratedSubject = useRef<string | undefined>(undefined);
  const previousAuthenticatedSubject = useRef<string | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;

    async function hydrate() {
      try {
        const raw = await AsyncStorage.getItem(storageKey);
        const securedPending = await loadPendingSignupProfile();
        if (!raw) {
          if (!cancelled) {
            setState((current) => ({ ...current, pendingSignupProfile: securedPending, pantryItems: normalizePantryItems(current.pantryItems) }));
          }
          return;
        }
        const parsed = JSON.parse(raw) as Partial<PersistedState> & { notificationPreferences?: unknown };
        const legacyPending = parsed.pendingSignupProfile;
        const persisted = { ...parsed };
        delete persisted.notificationPreferences;
        delete persisted.pendingSignupProfile;
        if (!securedPending && legacyPending) {
          await savePendingSignupProfile(legacyPending).catch(() => undefined);
        }
        if (!cancelled) {
          setState({
            ...defaultState,
            ...persisted,
            pendingSignupProfile: securedPending ?? legacyPending,
            profile: { ...defaultProfile, ...persisted.profile },
            preferences: { ...defaultPreferences, ...persisted.preferences },
            governmentProfile: { ...defaultGovernmentProfile, ...persisted.governmentProfile },
            pantryItems: normalizePantryItems(persisted.pantryItems ?? defaultState.pantryItems),
            cart: persisted.cart ?? [],
          });
        }
      } finally {
        if (!cancelled) {
          setIsLocalReady(true);
        }
      }
    }

    hydrate();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isLocalReady) {
      return;
    }
    const { pendingSignupProfile: _pendingSignupProfile, ...nonSensitiveState } = state;
    AsyncStorage.setItem(storageKey, JSON.stringify(nonSensitiveState)).catch(() => undefined);
  }, [isLocalReady, state]);

  const patchState = useCallback((patch: Partial<PersistedState>) => {
    setState((current) => ({ ...current, ...patch }));
  }, []);

  const hydrateViewer = useCallback(async () => {
    const subject = auth.user?.id;
    if (!subject) return;
    if (state.profileOwnerSubject && state.profileOwnerSubject !== subject) {
      void clearPendingSignupProfile().catch(() => undefined);
      setState((current) => ({
        ...current,
        profileOwnerSubject: undefined,
        pendingSignupProfile: undefined,
        hasCompletedOnboarding: false,
        profile: defaultProfile,
        preferences: defaultPreferences,
        governmentProfile: defaultGovernmentProfile,
      }));
    }
    setProfileSyncState('loading');
    setProfileSyncError('');
    try {
      let viewer = await fetchViewer();
      const pending = state.pendingSignupProfile;
      const pendingMatches = pending?.email.toLowerCase() === auth.user?.email.toLowerCase();
      const serverProfileIsEmpty = !viewer.profile.firstName && !viewer.profile.lastName && !viewer.profile.phone;
      if (serverProfileIsEmpty) {
        const names = pendingMatches && pending
          ? { firstName: pending.firstName, lastName: pending.lastName }
          : fallbackName(auth.user?.name);
        if (names.firstName && names.lastName) {
          const seeded = await updateProfileRemote({
            firstName: names.firstName,
            lastName: names.lastName,
            phone: pendingMatches && pending ? pending.phone : '',
          });
          viewer = { ...viewer, profile: seeded };
        }
      }
      if (pendingMatches) void clearPendingSignupProfile().catch(() => undefined);
      setState((current) => ({
        ...current,
        profileOwnerSubject: subject,
        pendingSignupProfile: pendingMatches ? undefined : current.pendingSignupProfile,
        hasCompletedOnboarding: viewer.onboardingState.hasCompletedOnboarding,
        profile: profileFromViewer(viewer.profile, current.profileOwnerSubject === subject ? current.profile.profileImageUri : undefined),
        preferences: preferencesFromViewer(viewer.preferences),
      }));
      if (viewer.preferences.notificationsEnabled) {
        void refreshPushTokenIfPermitted();
      }
      lastHydratedSubject.current = subject;
      setProfileSyncState('ready');
    } catch (error) {
      lastHydratedSubject.current = subject;
      setProfileSyncError(error instanceof Error ? error.message : 'Unable to load your profile.');
      setProfileSyncState('error');
    }
  }, [auth, state.pendingSignupProfile, state.profileOwnerSubject]);

  useEffect(() => {
    if (!isLocalReady || !auth.isReady) return;
    if (!auth.isAuthenticated || !auth.user?.id) {
      const signedOutSubject = previousAuthenticatedSubject.current;
      previousAuthenticatedSubject.current = undefined;
      lastHydratedSubject.current = undefined;
      const timer = setTimeout(() => {
        setProfileSyncState('idle');
        setProfileSyncError('');
        setState((current) => ({
          ...current,
          profileOwnerSubject: undefined,
          hasCompletedOnboarding: false,
          profile: defaultProfile,
          preferences: defaultPreferences,
          governmentProfile: defaultGovernmentProfile,
        }));
        if (signedOutSubject) {
          void clearPendingSignupProfile().catch(() => undefined);
          setState((current) => ({ ...current, pendingSignupProfile: undefined }));
        }
      }, 0);
      return () => clearTimeout(timer);
    }
    previousAuthenticatedSubject.current = auth.user.id;
    if (DEV_PREVIEW_AUTH_ENABLED) {
      // No backend to hydrate from. Treat onboarding as done so the tabs render;
      // individual screens still show their own empty and error states. Deferred
      // the same way the signed-out branch above is, to keep setState out of the
      // effect body.
      lastHydratedSubject.current = auth.user.id;
      const timer = setTimeout(() => {
        setProfileSyncState('ready');
        setState((current) => ({ ...current, hasCompletedOnboarding: true }));
      }, 0);
      return () => clearTimeout(timer);
    }
    if (lastHydratedSubject.current !== auth.user.id && profileSyncState !== 'loading') {
      void hydrateViewer();
    }
  }, [auth.isAuthenticated, auth.isReady, auth.user?.id, hydrateViewer, isLocalReady, profileSyncState]);

  const saveProfile = useCallback(async (profile: ProfileUpdate) => {
    const saved = await updateProfileRemote(profile);
    setState((current) => ({
      ...current,
      profile: profileFromViewer(saved, current.profile.profileImageUri),
    }));
  }, []);

  const saveHandle = useCallback(async (handle: string) => {
    const saved = await updateHandleRemote(handle);
    setState((current) => ({
      ...current,
      profile: profileFromViewer(saved, current.profile.profileImageUri),
    }));
  }, []);

  const savePreferences = useCallback(async (preferences: PreferencesUpdate) => {
    const saved = await updatePreferencesRemote(preferences);
    setState((current) => ({
      ...current,
      preferences: preferencesFromViewer(saved),
    }));
  }, []);

  const completeOnboarding = useCallback(async (preferences: AppPreferences, profileImageUri?: string) => {
    const viewer = await completeOnboardingRemote({
      profile: {
        firstName: state.profile.firstName,
        lastName: state.profile.lastName,
        phone: state.profile.phone,
        zip: state.profile.zip,
        householdSize: state.profile.householdSize,
      },
      preferences: {
        weeklyBudget: preferences.weeklyBudget,
        preferredFinanceTopics: preferences.preferredFinanceTopics,
        preferredResources: preferences.preferredResources,
        wantsGovAssistance: preferences.wantsGovAssistance,
        lastMealPlanDate: preferences.lastMealPlanDate,
        notificationsEnabled: preferences.notificationsEnabled,
        expiringPantryNotificationsEnabled: preferences.expiringPantryNotificationsEnabled,
        weeklyMealPlanNotificationsEnabled: preferences.weeklyMealPlanNotificationsEnabled,
        resourceReminderNotificationsEnabled: preferences.resourceReminderNotificationsEnabled,
      },
    });
    setState((current) => ({
      ...current,
      hasCompletedOnboarding: viewer.onboardingState.hasCompletedOnboarding,
      profile: profileFromViewer(viewer.profile, profileImageUri ?? current.profile.profileImageUri),
      preferences: preferencesFromViewer(viewer.preferences),
    }));
  }, [state.profile]);

  const activePantryItems = useMemo(
    () =>
      state.pantryItems
        .filter((item) => item.status === 'active')
        .sort((a, b) => new Date(a.expirationDate).getTime() - new Date(b.expirationDate).getTime()),
    [state.pantryItems]
  );

  const expiringItems = useMemo(() => {
    const soon = sessionStartedAt + 5 * 24 * 3600 * 1000;
    return activePantryItems.filter((item) => new Date(item.expirationDate).getTime() <= soon);
  }, [activePantryItems]);

  const usedItems = useMemo(
    () => state.pantryItems.filter((item) => item.status === 'used').sort((a, b) => (b.dateUsed ?? '').localeCompare(a.dateUsed ?? '')),
    [state.pantryItems]
  );

  const expiredItems = useMemo(
    () => state.pantryItems.filter((item) => item.status === 'expired').sort((a, b) => b.expirationDate.localeCompare(a.expirationDate)),
    [state.pantryItems]
  );

  const wasteStats = useMemo(() => getWasteStats(state.pantryItems), [state.pantryItems]);

  const shouldPromptNewMealPlan = useMemo(() => {
    if (!state.preferences.lastMealPlanDate) {
      return true;
    }
    return sessionStartedAt - new Date(state.preferences.lastMealPlanDate).getTime() >= 7 * 24 * 3600 * 1000;
  }, [state.preferences.lastMealPlanDate]);

  const isReady = isLocalReady && auth.isReady && (!auth.isAuthenticated || profileSyncState === 'ready' || profileSyncState === 'error');
  const displayName = `${state.profile.firstName} ${state.profile.lastName}`.trim();
  const formName = useMemo(() => ({
    firstName: state.governmentProfile.firstName.trim() || state.profile.firstName,
    lastName: state.governmentProfile.lastName.trim() || state.profile.lastName,
  }), [state.governmentProfile.firstName, state.governmentProfile.lastName, state.profile.firstName, state.profile.lastName]);

  const value = useMemo<AppStateContextValue>(
    () => ({
      ...state,
      isReady,
      profileSyncState,
      profileSyncError,
      displayName,
      formName,
      activePantryItems,
      expiringItems,
      usedItems,
      expiredItems,
      wasteStats,
      shouldPromptNewMealPlan,
      setSelectedTab: (selectedTab) => patchState({ selectedTab }),
      hydrateViewer,
      completeOnboarding,
      markTourSeen: () => patchState({ hasSeenTour: true }),
      saveProfile,
      checkHandleAvailability: checkHandleAvailabilityRemote,
      saveHandle,
      savePreferences,
      setLocalProfileImage: (profileImageUri) => {
        setState((current) => ({
          ...current,
          profile: { ...current.profile, profileImageUri },
        }));
      },
      rememberPendingSignup: (profile) => {
        patchState({ pendingSignupProfile: profile });
        void savePendingSignupProfile(profile).catch(() => undefined);
      },
      updateGovernmentProfile: (profile) => {
        patchState({ governmentProfile: { ...state.governmentProfile, ...profile } });
      },
      setEbtConnected: (ebtConnected) => patchState({ ebtConnected }),
      addPantryItem: (item) => patchState({ pantryItems: [...state.pantryItems, item] }),
      updatePantryItemStatus: (itemId, status) => {
        patchState({
          pantryItems: state.pantryItems.map((item) =>
            item.id === itemId
              ? {
                  ...item,
                  status,
                  dateUsed: status === 'used' ? new Date().toISOString() : item.dateUsed,
                }
              : item
          ),
        });
      },
      deletePantryItem: (itemId) => {
        patchState({ pantryItems: state.pantryItems.filter((item) => item.id !== itemId) });
      },
      addToCart: (deal) => {
        if (state.cart.some((item) => item.id === deal.id)) {
          return;
        }
        patchState({ cart: [...state.cart, deal] });
      },
      clearCart: () => patchState({ cart: [] }),
      isInCart: (dealId) => state.cart.some((deal) => deal.id === dealId),
      markMealPlanGenerated: async () => savePreferences({ lastMealPlanDate: new Date().toISOString().slice(0, 10) }),
    }),
    [
      activePantryItems,
      completeOnboarding,
      expiredItems,
      expiringItems,
      hydrateViewer,
      isReady,
      patchState,
      profileSyncError,
      profileSyncState,
      displayName,
      formName,
      saveHandle,
      savePreferences,
      saveProfile,
      shouldPromptNewMealPlan,
      state,
      usedItems,
      wasteStats,
    ]
  );

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

export function useAppState() {
  const value = useContext(AppStateContext);
  if (!value) {
    throw new Error('useAppState must be used inside AppStateProvider');
  }
  return value;
}

export function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(new Date(value));
}

export function daysFromNow(days: number) {
  return new Date(Date.now() + days * 24 * 3600 * 1000).toISOString();
}

export function locationIcon(location: StorageLocation) {
  if (location === 'Refrigerator') {
    return 'fridge';
  }
  if (location === 'Freezer') {
    return 'snow';
  }
  return 'box';
}
