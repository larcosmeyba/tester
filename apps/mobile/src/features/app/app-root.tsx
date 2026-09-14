// The application shell.
//
// AppRoot owns the navigation stack, decides public vs. signed-in, and renders
// one screen at a time. The screens themselves live in their own feature
// folders; this file composes them and nothing else.
//
// It was a single 3,365-line file until the cleanup pass split it apart. The
// navigation model is unchanged: every route under src/app still re-exports
// this shell, so the ScreenName union in navigation-types.ts is what actually
// decides what a user sees.

import { useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { useAuth } from '@/auth/auth-context';
import { AppButton, type HiveIconName, ModalSheet, PennyImage, Screen, uiText } from '@/components/hive-ui';
import { SplashVideoScreen } from '@/features/app/splash-video-screen';
import { FloatingTabBar } from '@/components/hive-navigation';
import { MealPlanScreen as WeeklyMealPlanScreen } from '@/features/meals/meal-plan-screen';
import { allVideos, type BenefitProgram, type MealRecipe, type ResourceItem, transactions, type VideoItem } from '@/data/mock-data';
import { useAppState } from '@/state/app-state';
import { ForgotPasswordScreen, LoginScreen, SignUpScreen, VerifyScreen, WelcomeScreen } from '@/features/auth/auth-screens';
import { OnboardingScreen } from '@/features/onboarding/onboarding-screens';
import { HomeScreen } from '@/features/home/home-screen';
import { PennyScreen } from '@/features/penny/penny-screen';
import { BenefitsQuestionnaireScreen, GovernmentScreen, ProgramApplicationScreen, ResourceDetailsScreen, ResourceSearchScreen, ResourcesScreen, VideoDetailScreen, VideoHubScreen } from '@/features/resources/resources-screens';
import { BudgetSettingsScreen, ConnectAccountScreen, FinanceScreen, SpendingReportScreen, TransactionsScreen } from '@/features/budget/budget-screens';
import { AddPantryScreen, PantryScreen } from '@/features/pantry/pantry-screens';
import { AccountScreen, ChangeEmailScreen, DeleteAccountScreen, EditHandleScreen, EditProfileScreen, FeedbackScreen, NotificationsScreen, SettingsScreen } from '@/features/profile/profile-screens';
import { DealsScreen, RecipeScreen } from '@/features/meals/recipe-deals-screens';
import { type Navigation, type Route, type ScreenName } from '@/features/app/navigation-types';
import { sharedStyles } from '@/features/app/app-shared';
import { StyleSheet } from 'react-native';
import { HiveColors } from '@/constants/theme';

const pennySource = require('@/assets/images/hive/penny.png');

const tabs: { label: string; icon: HiveIconName }[] = [
  { label: 'Home', icon: 'home' },
  { label: 'Meal Plan', icon: 'calendar' },
  { label: 'Penny', icon: 'penny' },
  { label: 'Resources', icon: 'resources' },
  { label: 'Finance', icon: 'finance' },
];
const publicScreens = new Set<ScreenName>(['welcome', 'signup', 'login', 'forgot', 'verify']);

export default function AppRoot({ initialPublicScreen }: { initialPublicScreen?: 'login' | 'forgot' }) {
  const app = useAppState();
  const auth = useAuth();
  const [stack, setStack] = useState<Route[]>([]);
  // The brand splash video plays once on every cold start — new users and
  // returning logins alike — before any navigation renders.
  const [splashFinished, setSplashFinished] = useState(false);
  // Only new users see the questionnaire: routing comes from the viewer's
  // onboarding state, not local markers. Completed onboarding -> main app;
  // incomplete -> resume at onboardingState.currentStep; logged out -> the
  // public auth screens. Verification is enforced for accounts the API
  // reports as unverified (pre-v2 accounts are grandfathered as verified by
  // migration 00016): an authenticated but unverified user always lands on
  // the verify screen and cannot reach onboarding or main until the code
  // checks out. A normal login never re-verifies a verified user.
  const needsVerification =
    auth.isAuthenticated && app.verificationStatus != null && !app.verificationStatus.verified;
  const initialRouteName: ScreenName = !auth.isAuthenticated
    ? (initialPublicScreen ?? 'welcome')
    : needsVerification
      ? 'verify'
      : app.hasCompletedOnboarding
        ? 'main'
        : 'onboarding';

  const nav = useMemo<Navigation>(
    () => ({
      push: (name, params) => {
        setStack((current) => [...(current.length > 0 ? current : [{ name: initialRouteName }]), { name, params }]);
      },
      replace: (name, params) => setStack((current) => [...current.slice(0, -1), { name, params }]),
      back: () => setStack((current) => (current.length > 1 ? current.slice(0, -1) : current)),
      reset: (name, params) => setStack([{ name, params }]),
    }),
    [initialRouteName]
  );

  if (!splashFinished) {
    return <SplashVideoScreen onDone={() => setSplashFinished(true)} />;
  }

  if (!app.isReady || !auth.isReady) {
    // The video finished but the providers are still warming up (rare):
    // hold on black rather than flashing any loader.
    return <View style={styles.splashHold} />;
  }

  const activeStack = stack.length > 0 ? stack : [{ name: initialRouteName }];
  const requestedRoute = activeStack[activeStack.length - 1];
  // Unverified users are fenced into the verify screen (params may be absent
  // on a cold start — the screen falls back to the viewer/auth email+phone).
  const route = !auth.isAuthenticated && !publicScreens.has(requestedRoute.name)
    ? { name: 'welcome' as const }
    : auth.isAuthenticated && needsVerification && requestedRoute.name !== 'verify'
      ? { name: 'verify' as const }
      : auth.isAuthenticated && publicScreens.has(requestedRoute.name) && requestedRoute.name !== 'verify'
        ? { name: initialRouteName }
        : requestedRoute;

  switch (route.name) {
    case 'signup':
      return <SignUpScreen nav={nav} />;
    case 'login':
      return <LoginScreen nav={nav} />;
    case 'forgot':
      return <ForgotPasswordScreen nav={nav} initialEmail={route.params?.email as string | undefined} />;
    case 'verify':
      return (
        <VerifyScreen
          nav={nav}
          email={(route.params?.email as string | undefined) ?? auth.user?.email ?? ''}
          phone={(route.params?.phone as string | undefined) ?? app.profile.phone ?? ''}
        />
      );
    case 'onboarding':
      return <OnboardingScreen nav={nav} initialStepKey={app.onboardingCurrentStep} />;
    case 'main':
      return <MainTabs nav={nav} />;
    case 'pantry':
      return <PantryScreen nav={nav} />;
    case 'addPantry':
      return <AddPantryScreen nav={nav} />;
    case 'account':
      return <AccountScreen nav={nav} />;
    case 'editProfile':
      return <EditProfileScreen nav={nav} />;
    case 'editHandle':
      return <EditHandleScreen nav={nav} />;
    case 'changeEmail':
      return <ChangeEmailScreen nav={nav} />;
    case 'deleteAccount':
      return <DeleteAccountScreen nav={nav} />;
    case 'settings':
      return <SettingsScreen nav={nav} />;
    case 'notifications':
      return <NotificationsScreen nav={nav} />;
    case 'budgetSettings':
      return <BudgetSettingsScreen nav={nav} />;
    case 'feedback':
      return <FeedbackScreen nav={nav} />;
    case 'deals':
      return <DealsScreen nav={nav} />;
    case 'recipe':
      return <RecipeScreen nav={nav} recipe={route.params?.recipe as MealRecipe | undefined} />;
    case 'educationHub':
      return <VideoHubScreen nav={nav} title="Education Hub" videos={allVideos} />;
    case 'video':
      return <VideoDetailScreen nav={nav} video={route.params?.video as VideoItem | undefined} />;
    case 'resourcesHub':
      return <VideoHubScreen nav={nav} title="Resource How-To Videos" videos={allVideos.filter((video) => video.category === 'resources')} />;
    case 'resourceSearch':
      return <ResourceSearchScreen nav={nav} />;
    case 'resourceDetails':
      return <ResourceDetailsScreen nav={nav} resource={route.params?.resource as ResourceItem | undefined} />;
    case 'government':
      return <GovernmentScreen nav={nav} />;
    case 'benefitsQuestionnaire':
      return <BenefitsQuestionnaireScreen nav={nav} />;
    case 'programApplication':
      return <ProgramApplicationScreen nav={nav} program={route.params?.program as BenefitProgram | undefined} />;
    case 'financeHub':
      return <VideoHubScreen nav={nav} title="Finance Learning Hub" videos={allVideos.filter((video) => video.category === 'finance')} />;
    case 'spendingReport':
      return <SpendingReportScreen nav={nav} />;
    case 'transactions':
      return <TransactionsScreen nav={nav} />;
    case 'connectAccount':
      return <ConnectAccountScreen nav={nav} />;
    case 'welcome':
    default:
      return <WelcomeScreen nav={nav} />;
  }
}

function MainTabs({ nav }: { nav: Navigation }) {
  const app = useAppState();
  const [showTour, setShowTour] = useState(!app.hasSeenTour);

  function closeTour() {
    app.markTourSeen();
    setShowTour(false);
  }

  return (
    <Screen>
      <View style={styles.tabShell}>
        <View style={styles.tabContent}>
          {app.selectedTab === 0 ? <HomeScreen nav={nav} /> : null}
          {app.selectedTab === 1 ? <WeeklyMealPlanScreen /> : null}
          {app.selectedTab === 2 ? <PennyScreen nav={nav} /> : null}
          {app.selectedTab === 3 ? <ResourcesScreen nav={nav} /> : null}
          {app.selectedTab === 4 ? <FinanceScreen nav={nav} /> : null}
        </View>
        <FloatingTabBar tabs={tabs} selectedIndex={app.selectedTab} onSelect={app.setSelectedTab} />
      </View>
      <ModalSheet visible={showTour} onClose={closeTour}>
        <View style={styles.tourContent}>
          <PennyImage source={pennySource} size={82} />
          <Text style={uiText.subtitle}>Meet Penny</Text>
          <Text style={[uiText.muted, sharedStyles.centerText]}>
            Penny helps you find local resources, build budget-friendly meals, track pantry items, and understand benefits.
          </Text>
          <AppButton title="Start Saving" onPress={closeTour} style={sharedStyles.fullWidth} />
        </View>
      </ModalSheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  splashHold: {
    flex: 1,
    backgroundColor: '#000000',
  },
  tabContent: {
    flex: 1,
  },
  tabShell: {
    flex: 1,
    backgroundColor: HiveColors.white,
  },
  tourContent: {
    alignItems: 'center',
    gap: 14,
  },
});
