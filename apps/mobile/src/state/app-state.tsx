import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { DEV_PREVIEW_AUTH_ENABLED } from '@/auth/dev-preview';

import { useAuth } from '@/auth/auth-context';
import { type Deal } from '@/data/mock-data';
import type {
  QuestionnaireAnswers,
  VerificationStatus,
} from '@helpthehive/api-contract';
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
  recordConsent as recordConsentRemote,
  type ViewerData,
} from '@/features/profile/profile-repository';
import { PRIVACY_VERSION, TERMS_VERSION } from '@/constants/legal';
import { formatMemberSince } from '@/features/profile/account-helpers';
import { refreshPushTokenIfPermitted } from '@/features/notifications/notification-service';
import { clearPendingSignupProfile, loadPendingSignupProfile, savePendingSignupProfile } from './pending-signup-storage';
import { loadSensitiveProfile, saveSensitiveProfile } from './sensitive-profile-storage';
import { syncAnalyticsConsent } from '@/features/analytics/vexo-client';

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
  selectedBenefitPrograms: string[];
  locationPermissionStatus: 'unset' | 'granted' | 'denied';
  emailMarketingOptIn: boolean;
  lastMealPlanDate?: string;
  notificationsEnabled: boolean;
  expiringPantryNotificationsEnabled: boolean;
  weeklyMealPlanNotificationsEnabled: boolean;
  resourceReminderNotificationsEnabled: boolean;
};

export type AppRoute = 'login' | 'onboarding' | 'main';

type PersistedState = {
  profileOwnerSubject?: string;
  pendingSignupProfile?: PendingSignupProfile;
  /** Social signups skip the Sign Up screen: first login still needs onboarding + consent. */
  isNewSocialAccount?: boolean;
  /** Set once the signup legal consent has been recorded server-side. */
  signupConsentRecorded?: boolean;
  hasCompletedOnboarding: boolean;
  hasSeenTour: boolean;
  selectedTab: number;
  ebtConnected: boolean;
  /**
   * Vexo engagement-analytics consent. OFF by default; the user opts in from
   * the Settings screen's Analytics toggle. Persisted in AsyncStorage (a plain
   * boolean carries no PII). The Vexo SDK is only initialized when this is
   * true — see syncAnalyticsConsent in features/analytics/vexo-client.ts.
   */
  analyticsConsentGranted: boolean;
  profile: AppProfile;
  preferences: AppPreferences;
  governmentProfile: GovernmentProfile;
  cart: Deal[];
};

type AppStateContextValue = PersistedState & {
  isReady: boolean;
  profileSyncState: 'idle' | 'loading' | 'ready' | 'error';
  profileSyncError: string;
  displayName: string;
  formName: { firstName: string; lastName: string };
  shouldPromptNewMealPlan: boolean;
  /**
   * The real account creation date from the viewer, formatted for the
   * Account screen's MEMBER SINCE stat ("SEP 2026"). Null until the viewer
   * hydrates — the stat card hides entirely rather than showing a placeholder.
   */
  memberSinceLabel: string | null;
  /** Saved questionnaire answers from the viewer (seeds onboarding resume). */
  questionnaireAnswers: QuestionnaireAnswers | null;
  /** Email-verification status from the viewer. */
  verificationStatus: VerificationStatus | null;
  /** Server-side onboarding step marker used to resume interrupted onboarding. */
  onboardingCurrentStep: string | null;
  setSelectedTab: (tab: number) => void;
  hydrateViewer: () => Promise<void>;
  completeOnboarding: (preferences: AppPreferences, profileImageUri?: string) => Promise<void>;
  markTourSeen: () => void;
  markSocialSignupComplete: () => void;
  setTransientSignupPassword: (password?: string) => void;
  consumeTransientSignupPassword: () => string | undefined;
  saveProfile: (profile: ProfileUpdate) => Promise<void>;
  checkHandleAvailability: (handle: string) => Promise<HandleAvailability>;
  saveHandle: (handle: string) => Promise<void>;
  savePreferences: (preferences: PreferencesUpdate) => Promise<void>;
  setLocalProfileImage: (profileImageUri?: string) => void;
  rememberPendingSignup: (profile: PendingSignupProfile) => void;
  recordSignupConsent: (consent?: { emailMarketingOptIn: boolean }) => Promise<void>;
  updateGovernmentProfile: (profile: Partial<GovernmentProfile>) => void;
  setEbtConnected: (connected: boolean) => void;
  /**
   * Record the user's analytics consent choice: persists the flag and brings
   * the Vexo SDK in line with it (initializes + enables on opt-in,
   * disables + stops in-flight recording on opt-out).
   */
  setAnalyticsConsent: (granted: boolean) => Promise<void>;
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
  /** Set for email signups: routes the first login into onboarding. */
  isNewAccount?: boolean;
  /** Legal consent captured on the Sign Up screen (before auth exists). */
  termsVersion?: string;
  privacyVersion?: string;
  emailMarketingOptIn?: boolean;
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
  selectedBenefitPrograms: [],
  locationPermissionStatus: 'unset',
  emailMarketingOptIn: false,
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
  analyticsConsentGranted: false,
  profile: defaultProfile,
  preferences: defaultPreferences,
  governmentProfile: defaultGovernmentProfile,
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

type ViewerPreferencesSource = {
  preferences: ViewerData['preferences'];
  consent?: { emailMarketingOptIn?: boolean | null } | null;
};

function toLocationPermissionStatus(value: string | null | undefined): 'unset' | 'granted' | 'denied' {
  return value === 'granted' || value === 'denied' ? value : 'unset';
}

function preferencesFromViewer(viewer: ViewerPreferencesSource): AppPreferences {
  const preferences = viewer.preferences;
  return {
    weeklyBudget: preferences.weeklyBudget,
    preferredFinanceTopics: preferences.preferredFinanceTopics,
    preferredResources: preferences.preferredResources,
    wantsGovAssistance: preferences.wantsGovAssistance,
    selectedBenefitPrograms: preferences.selectedBenefitPrograms ?? [],
    locationPermissionStatus: toLocationPermissionStatus(preferences.locationPermissionStatus),
    // The email opt-in lives on the consent record, not on preferences.
    emailMarketingOptIn: viewer.consent?.emailMarketingOptIn ?? false,
    lastMealPlanDate: preferences.lastMealPlanDate ?? undefined,
    notificationsEnabled: preferences.notificationsEnabled,
    expiringPantryNotificationsEnabled: preferences.expiringPantryNotificationsEnabled,
    weeklyMealPlanNotificationsEnabled: preferences.weeklyMealPlanNotificationsEnabled,
    resourceReminderNotificationsEnabled: preferences.resourceReminderNotificationsEnabled,
  };
}

const NEW_ACCOUNT_WINDOW_MS = 15 * 60 * 1000;

function isRecentlyCreated(createdAt: string | undefined): boolean {
  if (!createdAt) return false;
  const created = new Date(createdAt).getTime();
  if (Number.isNaN(created)) return false;
  return Date.now() - created < NEW_ACCOUNT_WINDOW_MS;
}

function fallbackName(name: string | undefined) {
  const parts = name?.trim().split(/\s+/).filter(Boolean) ?? [];
  return { firstName: parts[0] ?? '', lastName: parts.slice(1).join(' ') };
}


export function AppStateProvider({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const [state, setState] = useState<PersistedState>(defaultState);
  const [isLocalReady, setIsLocalReady] = useState(false);
  const [profileSyncState, setProfileSyncState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [profileSyncError, setProfileSyncError] = useState('');
  const [questionnaireAnswers, setQuestionnaireAnswers] = useState<QuestionnaireAnswers | null>(null);
  const [verificationStatus, setVerificationStatus] = useState<VerificationStatus | null>(null);
  const [onboardingCurrentStep, setOnboardingCurrentStep] = useState<string | null>(null);
  // The viewer's real account creation date (viewer.user.createdAt). Kept out
  // of PersistedState: it is re-hydrated from the server on every login, so
  // there is nothing to migrate and nothing stale to display.
  const [memberSince, setMemberSince] = useState<string | undefined>(undefined);
  // The signup password handed to the verify screen so a successful code
  // check can sign the user in. In-memory only — never persisted, cleared
  // the moment it is consumed (or on sign-out).
  const transientSignupPassword = useRef<string | undefined>(undefined);
  const lastHydratedSubject = useRef<string | undefined>(undefined);
  const previousAuthenticatedSubject = useRef<string | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;

    async function hydrate() {
      try {
        const raw = await AsyncStorage.getItem(storageKey);
        const securedPending = await loadPendingSignupProfile();
        const securedProfile = await loadSensitiveProfile();
        if (!raw && !securedProfile) {
          if (!cancelled) {
            setState((current) => ({ ...current, pendingSignupProfile: securedPending }));
          }
          return;
        }
        const parsed = (raw ? JSON.parse(raw) : {}) as Partial<PersistedState> & { notificationPreferences?: unknown };
        const legacyPending = parsed.pendingSignupProfile;
        const persisted = { ...parsed };
        delete persisted.notificationPreferences;
        delete persisted.pendingSignupProfile;
        if (!securedPending && legacyPending) {
          await savePendingSignupProfile(legacyPending).catch(() => undefined);
        }
        // Migrate any profile PII left in the old plaintext store into
        // SecureStore, then drop it from the AsyncStorage copy below.
        // governmentProfile is not migrated: benefits answers live on the
        // server now and are never kept on device.
        const legacyProfile = persisted.profile;
        delete persisted.profile;
        delete persisted.governmentProfile;
        if (!securedProfile && legacyProfile) {
          await saveSensitiveProfile(legacyProfile).catch(() => undefined);
        }
        if (!cancelled) {
          setState({
            ...defaultState,
            ...persisted,
            pendingSignupProfile: securedPending ?? legacyPending,
            profile: { ...defaultProfile, ...(securedProfile ?? legacyProfile) },
            preferences: { ...defaultPreferences, ...persisted.preferences },
            // Never restored from device storage: see the write below.
            governmentProfile: defaultGovernmentProfile,
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
    // The app profile holds PII (name, phone, zip): it is encrypted in
    // SecureStore, and only genuinely non-sensitive state goes to unencrypted
    // AsyncStorage. governmentProfile is dropped along with the pending signup
    // profile: benefits answers are the most sensitive data in the product —
    // dates of birth, income, immigration status, for a whole household
    // including children — and they live on the server now, behind the
    // viewer's token, fetched by the benefits screens when needed. Anything
    // already written to this key by an older build is overwritten below.
    // selectedTab is session UI state, not persisted: every cold start lands
    // on the Home tab (the designed front door), never on whichever tab was
    // open when the app was last backgrounded.
    const {
      pendingSignupProfile: _pendingSignupProfile,
      profile: _profile,
      governmentProfile: _governmentProfile,
      selectedTab: _selectedTab,
      ...nonSensitiveState
    } = state;
    AsyncStorage.setItem(storageKey, JSON.stringify(nonSensitiveState)).catch(() => undefined);
    void saveSensitiveProfile(state.profile).catch(() => undefined);
  }, [isLocalReady, state]);

  // Cold start: bring the Vexo SDK in line with the stored analytics consent.
  // Consent defaults to OFF, so a fresh install initializes nothing. Runs once
  // local state is ready; later changes go through setAnalyticsConsent.
  useEffect(() => {
    if (!isLocalReady) {
      return;
    }
    void syncAnalyticsConsent(state.analyticsConsentGranted).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLocalReady]);

  const patchState = useCallback((patch: Partial<PersistedState>) => {
    setState((current) => ({ ...current, ...patch }));
  }, []);

  const hydrateViewer = useCallback(async () => {
    const subject = auth.user?.id;
    if (!subject) return;
    if (state.profileOwnerSubject && state.profileOwnerSubject !== subject) {
      void clearPendingSignupProfile().catch(() => undefined);
      setMemberSince(undefined);
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
      if (pending && !pendingMatches) {
        // A signup attempt for a different email: discard it so an existing
        // account is never routed into the new-account onboarding.
        void clearPendingSignupProfile().catch(() => undefined);
      }
      // A social sign-in that just created the account still needs onboarding
      // and the legal consent gate, even though it skipped the Sign Up screen.
      const newSocialAccount =
        !pendingMatches &&
        !viewer.onboardingState.hasCompletedOnboarding &&
        isRecentlyCreated(viewer.user.createdAt);
      // Record the email-signup legal consent now that auth exists: it was
      // accepted on the Sign Up screen before the account existed. The server
      // stamps the acceptance time; a failure retries on the next hydrate.
      let consentRecorded = false;
      if (pendingMatches && pending?.termsVersion && pending?.privacyVersion) {
        try {
          await recordConsentRemote({
            termsVersion: pending.termsVersion,
            privacyVersion: pending.privacyVersion,
            emailMarketingOptIn: pending.emailMarketingOptIn ?? false,
          });
          consentRecorded = true;
        } catch {
          // Leave signupConsentRecorded unset; the next hydrate retries.
        }
      }
      setState((current) => ({
        ...current,
        profileOwnerSubject: subject,
        pendingSignupProfile: pendingMatches ? pending : undefined,
        // Once set, the flag survives re-hydrates until onboarding completes.
        isNewSocialAccount: newSocialAccount || current.isNewSocialAccount ? true : undefined,
        signupConsentRecorded: consentRecorded ? true : current.signupConsentRecorded,
        hasCompletedOnboarding: viewer.onboardingState.hasCompletedOnboarding,
        profile: profileFromViewer(viewer.profile, current.profileOwnerSubject === subject ? current.profile.profileImageUri : undefined),
        preferences: preferencesFromViewer(viewer),
      }));
      setQuestionnaireAnswers(viewer.questionnaireAnswers ?? null);
      setVerificationStatus(viewer.verification ?? null);
      setOnboardingCurrentStep(viewer.onboardingState.currentStep ?? null);
      setMemberSince(viewer.user.createdAt ?? undefined);
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
        setQuestionnaireAnswers(null);
        setVerificationStatus(null);
        setOnboardingCurrentStep(null);
        setMemberSince(undefined);
        transientSignupPassword.current = undefined;
        setState((current) => ({
          ...current,
          profileOwnerSubject: undefined,
          hasCompletedOnboarding: false,
          isNewSocialAccount: undefined,
          signupConsentRecorded: undefined,
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
      // updatePreferences accepts the email opt-in but does not return the
      // consent record, so the requested value is kept locally.
      preferences: preferencesFromViewer({
        preferences: saved,
        consent: { emailMarketingOptIn: preferences.emailMarketingOptIn ?? current.preferences.emailMarketingOptIn },
      }),
    }));
  }, []);

  const recordSignupConsent = useCallback(async (consent?: { emailMarketingOptIn: boolean }) => {
    // Consent is accepted before auth exists (Sign Up screen, or the
    // onboarding consent gate for social signups), so it is recorded here on
    // the first authenticated moment. The server stamps the acceptance time.
    const pending = state.pendingSignupProfile;
    const emailMarketingOptIn = consent?.emailMarketingOptIn ?? pending?.emailMarketingOptIn ?? false;
    await recordConsentRemote({
      termsVersion: pending?.termsVersion ?? TERMS_VERSION,
      privacyVersion: pending?.privacyVersion ?? PRIVACY_VERSION,
      emailMarketingOptIn,
    });
    setState((current) => ({
      ...current,
      signupConsentRecorded: true,
      preferences: { ...current.preferences, emailMarketingOptIn },
    }));
  }, [state.pendingSignupProfile]);

  const markSocialSignupComplete = useCallback(() => {
    // The social signup's consent gate finished: the account is no longer a
    // "new social account" for onboarding routing purposes.
    setState((current) => ({
      ...current,
      isNewSocialAccount: undefined,
      signupConsentRecorded: true,
    }));
  }, []);

  const setTransientSignupPassword = useCallback((password?: string) => {
    transientSignupPassword.current = password;
  }, []);

  const consumeTransientSignupPassword = useCallback(() => {
    const password = transientSignupPassword.current;
    transientSignupPassword.current = undefined;
    return password;
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
        selectedBenefitPrograms: preferences.selectedBenefitPrograms,
        locationPermissionStatus: preferences.locationPermissionStatus,
        emailMarketingOptIn: preferences.emailMarketingOptIn,
        lastMealPlanDate: preferences.lastMealPlanDate,
        notificationsEnabled: preferences.notificationsEnabled,
        expiringPantryNotificationsEnabled: preferences.expiringPantryNotificationsEnabled,
        weeklyMealPlanNotificationsEnabled: preferences.weeklyMealPlanNotificationsEnabled,
        resourceReminderNotificationsEnabled: preferences.resourceReminderNotificationsEnabled,
      },
    });
    void clearPendingSignupProfile().catch(() => undefined);
    transientSignupPassword.current = undefined;
    setState((current) => ({
      ...current,
      hasCompletedOnboarding: viewer.onboardingState.hasCompletedOnboarding,
      pendingSignupProfile: undefined,
      isNewSocialAccount: undefined,
      profile: profileFromViewer(viewer.profile, profileImageUri ?? current.profile.profileImageUri),
      preferences: preferencesFromViewer(viewer),
    }));
  }, [state.profile]);

  const shouldPromptNewMealPlan = useMemo(() => {
    if (!state.preferences.lastMealPlanDate) {
      return true;
    }
    return sessionStartedAt - new Date(state.preferences.lastMealPlanDate).getTime() >= 7 * 24 * 3600 * 1000;
  }, [state.preferences.lastMealPlanDate]);

  const isReady = isLocalReady && auth.isReady && (!auth.isAuthenticated || profileSyncState === 'ready' || profileSyncState === 'error');
  const displayName = `${state.profile.firstName} ${state.profile.lastName}`.trim();
  const memberSinceLabel = formatMemberSince(memberSince);
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
      shouldPromptNewMealPlan,
      memberSinceLabel,
      questionnaireAnswers,
      verificationStatus,
      onboardingCurrentStep,
      setSelectedTab: (selectedTab) => patchState({ selectedTab }),
      hydrateViewer,
      completeOnboarding,
      markTourSeen: () => patchState({ hasSeenTour: true }),
      markSocialSignupComplete,
      setTransientSignupPassword,
      consumeTransientSignupPassword,
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
      recordSignupConsent,
      updateGovernmentProfile: (profile) => {
        patchState({ governmentProfile: { ...state.governmentProfile, ...profile } });
      },
      setEbtConnected: (ebtConnected) => patchState({ ebtConnected }),
      setAnalyticsConsent: async (granted) => {
        patchState({ analyticsConsentGranted: granted });
        // The persisted flag is the consent record; this brings the SDK in
        // line with the choice immediately (stops in-flight recording on
        // opt-out). Never throws: the client no-ops in dev / without a key.
        await syncAnalyticsConsent(granted);
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
      completeOnboarding,
      hydrateViewer,
      isReady,
      patchState,
      profileSyncError,
      profileSyncState,
      displayName,
      formName,
      markSocialSignupComplete,
      setTransientSignupPassword,
      consumeTransientSignupPassword,
      saveHandle,
      savePreferences,
      saveProfile,
      shouldPromptNewMealPlan,
      memberSinceLabel,
      state,
      questionnaireAnswers,
      verificationStatus,
      onboardingCurrentStep,
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

