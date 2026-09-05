import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { Linking, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { AuthFlowError, useAuth } from '@/auth/auth-context';
import {
  AppButton,
  AppHeader,
  AppLogo,
  AppTextField,
  AvatarButton,
  Card,
  CheckboxRow,
  Chip,
  EmptyState,
  HiveIcon,
  type HiveIconName,
  InfoRow,
  ModalSheet,
  OrDivider,
  PennyImage,
  ProgressBar,
  Screen,
  ScrollScreen,
  SectionHeader,
  SelectionRow,
  StatBadge,
  rowStyles,
  uiText,
} from '@/components/hive-ui';
import { HiveColors, Radii } from '@/constants/theme';
import {
  AlertBanner,
  ComingSoonCard,
  ComingSoonHub,
  ComingSoonRow,
  GradientActionCard,
  GradientActionRow,
  SoftGreenPanel,
} from '@/components/hive-cards';
import {
  FLOATING_TAB_BAR_HEIGHT,
  FloatingPill,
  FloatingPillRow,
  FloatingTabBar,
} from '@/components/hive-navigation';
import {
  refreshPushTokenIfPermitted,
  requestAndRegisterPushToken,
  requestNotificationPermission,
  unregisterStoredPushToken,
} from '@/features/notifications/notification-service';
import { deleteViewerData, HandleUpdateError, type HandleAvailability } from '@/features/profile/profile-repository';
import { PENNY_DISCLAIMER, PENNY_SUGGESTIONS, pennyService } from '@/features/penny/penny-service';
import { describeError } from '@/services/api-error';
import { MealPlanScreen as WeeklyMealPlanScreen } from '@/features/meals/meal-plan-screen';
import {
  allVideos,
  benefitPrograms,
  type BenefitProgram,
  type Deal,
  makePantryItem,
  type MealRecipe,
  mealsByDow,
  nearbyResources,
  type ResourceItem,
  type StorageLocation,
  sampleDeals,
  spendingCategories,
  storageLocations,
  transactions,
  type VideoItem,
} from '@/data/mock-data';
import { daysFromNow, formatDate, locationIcon, useAppState, type AppPreferences } from '@/state/app-state';

const logoSource = require('@/assets/images/hive/logo.png');
const pennySource = require('@/assets/images/hive/penny.png');
const googleSource = require('@/assets/images/hive/google.png');

type ScreenName =
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

type Route = {
  name: ScreenName;
  params?: Record<string, unknown>;
};

type Navigation = {
  push: (name: ScreenName, params?: Record<string, unknown>) => void;
  replace: (name: ScreenName, params?: Record<string, unknown>) => void;
  back: () => void;
  reset: (name: ScreenName, params?: Record<string, unknown>) => void;
};

const tabs: { label: string; icon: HiveIconName }[] = [
  { label: 'Home', icon: 'home' },
  { label: 'Meal Plan', icon: 'calendar' },
  { label: 'Penny', icon: 'penny' },
  { label: 'Resources', icon: 'resources' },
  { label: 'Finance', icon: 'finance' },
];

const publicScreens = new Set<ScreenName>(['welcome', 'signup', 'login', 'forgot', 'verify']);

const financeTopics: { title: string; subtitle: string; icon: HiveIconName }[] = [
  { title: 'How to Open a Roth IRA', subtitle: 'Learn the basics of tax-free retirement savings', icon: 'chart' },
  { title: 'How to Save for Kids College', subtitle: '529 plans, education savings, and strategies', icon: 'resources' },
  { title: 'How to Save for Retirement', subtitle: 'Build a plan for long-term financial security', icon: 'calendar' },
  { title: 'Budgeting & Money Management', subtitle: 'Track spending, reduce debt, and save more', icon: 'card' },
  { title: 'Building an Emergency Fund', subtitle: 'Prepare for unexpected expenses', icon: 'shield' },
];

const resourceOptions: { title: string; subtitle: string; icon: HiveIconName }[] = [
  { title: 'Food Assistance', subtitle: 'Food pantries, free meals, and grocery programs', icon: 'fork' },
  { title: 'Housing Help', subtitle: 'Housing assistance programs', icon: 'home' },
  { title: 'Healthcare', subtitle: 'Medicaid and related programs', icon: 'heart' },
  { title: 'Utility Assistance', subtitle: 'Electric, gas, water, and phone bills', icon: 'bolt' },
  { title: 'Job', subtitle: 'Career programs, resume help, and places hiring', icon: 'job' },
  { title: 'Childcare', subtitle: 'Daycare assistance and after-school programs', icon: 'child' },
];

export default function AppRoot({ initialPublicScreen }: { initialPublicScreen?: 'login' | 'forgot' }) {
  const app = useAppState();
  const auth = useAuth();
  const [stack, setStack] = useState<Route[]>([]);
  const initialRouteName: ScreenName = auth.isAuthenticated
    ? app.hasCompletedOnboarding
      ? 'main'
      : 'onboarding'
    : initialPublicScreen ?? 'welcome';

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

  if (!app.isReady || !auth.isReady) {
    return (
      <Screen>
        <View style={styles.centered}>
          <AppLogo source={logoSource} size={92} />
          <Text style={styles.loadingText}>Loading Help The Hive</Text>
        </View>
      </Screen>
    );
  }

  const activeStack = stack.length > 0 ? stack : [{ name: initialRouteName }];
  const requestedRoute = activeStack[activeStack.length - 1];
  const route = !auth.isAuthenticated && !publicScreens.has(requestedRoute.name)
    ? { name: 'welcome' as const }
    : auth.isAuthenticated && publicScreens.has(requestedRoute.name)
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
      return <VerifyScreen nav={nav} email={route.params?.email as string | undefined} />;
    case 'onboarding':
      return <OnboardingScreen nav={nav} />;
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

function WelcomeScreen({ nav }: { nav: Navigation }) {
  return (
    <Screen>
      <View style={styles.authShell}>
        <View style={styles.authCenter}>
          <AppLogo source={logoSource} />
          <Text style={styles.welcomeTitle}>Feed Your Family{'\n'}Smarter.</Text>
        </View>
        <View style={styles.authActions}>
          <AppButton title="Get Started" onPress={() => nav.push('signup')} />
          <TextLinkLine label="Already a member?" action="Login" onPress={() => nav.push('login')} />
        </View>
      </View>
    </Screen>
  );
}

function SignUpScreen({ nav }: { nav: Navigation }) {
  const app = useAppState();
  const auth = useAuth();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isAppleSubmitting, setIsAppleSubmitting] = useState(false);
  const [isGoogleSubmitting, setIsGoogleSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const canSubmit = firstName.length > 0 && lastName.length > 0 && email.includes('@') && phone.length > 0 && password.length >= 8;

  async function submit() {
    setIsSubmitting(true);
    setErrorMessage('');
    try {
      const result = await auth.signUp({ name: `${firstName} ${lastName}`.trim(), email: email.trim(), password });
      app.rememberPendingSignup({ firstName, lastName, email: result.email, phone });
      nav.reset('verify', { email: result.email });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to create your account.');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function signInWithApple() {
    setIsAppleSubmitting(true);
    setErrorMessage('');
    try {
      await auth.signInWithApple();
      nav.reset('welcome');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to continue with Apple.');
    } finally {
      setIsAppleSubmitting(false);
    }
  }

  async function signInWithGoogle() {
    setIsGoogleSubmitting(true);
    setErrorMessage('');
    try {
      await auth.signInWithGoogle();
      nav.reset('welcome');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to continue with Google.');
    } finally {
      setIsGoogleSubmitting(false);
    }
  }

  return (
    <ScrollScreen keyboard>
      <AppHeader onBack={nav.back} hiddenTitle />
      <View style={styles.formScreen}>
        <Text style={styles.authTitle}>Create your account</Text>
        <Text style={styles.authSubtitle}>Penny will use this profile to personalize meals, resources, and savings tips.</Text>
        <View style={styles.formStack}>
          <AppTextField label="First name" value={firstName} onChangeText={setFirstName} placeholder="Sam" />
          <AppTextField label="Last name" value={lastName} onChangeText={setLastName} placeholder="Chavez" />
          <AppTextField label="Email" value={email} onChangeText={setEmail} placeholder="you@example.com" keyboardType="email-address" />
          <AppTextField label="Phone number" value={phone} onChangeText={setPhone} placeholder="(818) 555-0142" keyboardType="phone-pad" />
          <AppTextField label="Password" value={password} onChangeText={setPassword} placeholder="Create a password" secureTextEntry />
        </View>
        {errorMessage ? <Text style={styles.authError}>{errorMessage}</Text> : null}
        <AppButton
          title={isSubmitting ? 'Creating account…' : 'Continue'}
          disabled={!canSubmit || isSubmitting || isAppleSubmitting || isGoogleSubmitting}
          onPress={() => void submit()}
        />
        <OrDivider />
        <SocialButton
          title={isGoogleSubmitting ? 'Connecting to Google…' : 'Continue with Google'}
          source={googleSource}
          disabled={isSubmitting || isAppleSubmitting || isGoogleSubmitting}
          onPress={() => void signInWithGoogle()}
        />
        <AppButton
          title={isAppleSubmitting ? 'Connecting to Apple…' : 'Continue with Apple'}
          variant="dark"
          disabled={isSubmitting || isAppleSubmitting || isGoogleSubmitting}
          onPress={() => void signInWithApple()}
        />
        <TextLinkLine label="Already have an account?" action="Login" onPress={() => nav.replace('login')} />
      </View>
    </ScrollScreen>
  );
}

function LoginScreen({ nav }: { nav: Navigation }) {
  const app = useAppState();
  const auth = useAuth();
  const [email, setEmail] = useState(app.pendingSignupProfile?.email ?? '');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isAppleSubmitting, setIsAppleSubmitting] = useState(false);
  const [isGoogleSubmitting, setIsGoogleSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  async function submit() {
    setIsSubmitting(true);
    setErrorMessage('');
    try {
      await auth.signIn({ email: email.trim(), password });
      nav.reset('welcome');
    } catch (error) {
      if (error instanceof AuthFlowError && error.code === 'verification_required') {
        nav.reset('verify', { email: email.trim().toLowerCase() });
      } else {
        setErrorMessage(error instanceof Error ? error.message : 'Unable to sign in.');
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  async function signInWithApple() {
    setIsAppleSubmitting(true);
    setErrorMessage('');
    try {
      await auth.signInWithApple();
      nav.reset('welcome');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to sign in with Apple.');
    } finally {
      setIsAppleSubmitting(false);
    }
  }

  async function signInWithGoogle() {
    setIsGoogleSubmitting(true);
    setErrorMessage('');
    try {
      await auth.signInWithGoogle();
      nav.reset('welcome');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to sign in with Google.');
    } finally {
      setIsGoogleSubmitting(false);
    }
  }

  return (
    <ScrollScreen keyboard>
      <AppHeader onBack={nav.back} hiddenTitle />
      <View style={styles.formScreen}>
        <Text style={styles.authTitle}>Welcome back</Text>
        <Text style={styles.authSubtitle}>Log in to continue to Help The Hive.</Text>
        <View style={styles.formStack}>
          <AppTextField label="Email" value={email} onChangeText={setEmail} placeholder="you@example.com" keyboardType="email-address" />
          <AppTextField label="Password" value={password} onChangeText={setPassword} placeholder="Password" secureTextEntry />
        </View>
        <Pressable onPress={() => nav.push('forgot', { email: email.trim() })} style={styles.alignEnd}>
          <Text style={styles.greenLink}>Forgot password?</Text>
        </Pressable>
        {errorMessage ? <Text style={styles.authError}>{errorMessage}</Text> : null}
        <AppButton
          title={isSubmitting ? 'Logging in…' : 'Login'}
          disabled={!email.includes('@') || password.length === 0 || isSubmitting || isAppleSubmitting || isGoogleSubmitting}
          onPress={() => void submit()}
        />
        <OrDivider />
        <SocialButton
          title={isGoogleSubmitting ? 'Connecting to Google…' : 'Continue with Google'}
          source={googleSource}
          disabled={isSubmitting || isAppleSubmitting || isGoogleSubmitting}
          onPress={() => void signInWithGoogle()}
        />
        <AppButton
          title={isAppleSubmitting ? 'Connecting to Apple…' : 'Continue with Apple'}
          variant="dark"
          disabled={isSubmitting || isAppleSubmitting || isGoogleSubmitting}
          onPress={() => void signInWithApple()}
        />
        <TextLinkLine label="New to Help The Hive?" action="Create account" onPress={() => nav.replace('signup')} />
      </View>
    </ScrollScreen>
  );
}

function ForgotPasswordScreen({ nav, initialEmail = '' }: { nav: Navigation; initialEmail?: string }) {
  const auth = useAuth();
  const [email, setEmail] = useState(initialEmail);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  async function submit() {
    setIsSubmitting(true);
    setErrorMessage('');
    try {
      await auth.requestPasswordReset(email);
      setHasSubmitted(true);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to request a password reset.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <ScrollScreen keyboard>
      <AppHeader title="Forgot Password" onBack={nav.back} />
      <View style={styles.formScreen}>
        <Text style={uiText.subtitle}>Reset your password</Text>
        <Text style={uiText.muted}>
          {hasSubmitted
            ? 'If an account exists for that address, a password reset link is on its way.'
            : 'Enter your email and we will send a secure password reset link.'}
        </Text>
        {!hasSubmitted ? (
          <>
            <AppTextField label="Email" value={email} onChangeText={setEmail} placeholder="you@example.com" keyboardType="email-address" />
            {errorMessage ? <Text style={styles.authError}>{errorMessage}</Text> : null}
            <AppButton
              title={isSubmitting ? 'Sending…' : 'Send reset link'}
              disabled={!email.includes('@') || isSubmitting}
              onPress={() => void submit()}
            />
          </>
        ) : (
          <>
            <AppButton title="Back to Login" onPress={() => nav.reset('login')} />
            <TextLinkLine label="Did not receive it?" action="Try again" onPress={() => setHasSubmitted(false)} />
          </>
        )}
      </View>
    </ScrollScreen>
  );
}

function VerifyScreen({ nav, email = '' }: { nav: Navigation; email?: string }) {
  const auth = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [canResend, setCanResend] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (canResend) return;
    const timer = setTimeout(() => setCanResend(true), 60_000);
    return () => clearTimeout(timer);
  }, [canResend]);

  async function resend() {
    if (!email) {
      nav.reset('login');
      return;
    }
    setIsSubmitting(true);
    setMessage('');
    try {
      await auth.sendVerificationEmail(email);
      setMessage('A new verification link has been sent.');
      setCanResend(false);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to resend verification email.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <ScrollScreen keyboard>
      <AppHeader title="Verify Email" onBack={nav.back} />
      <View style={styles.formScreen}>
        <Text style={uiText.subtitle}>Check your inbox</Text>
        <Text style={uiText.muted}>Open the link in your verification email, then return here to log in.</Text>
        {message ? <Text style={styles.authError}>{message}</Text> : null}
        <AppButton
          title={isSubmitting ? 'Sending…' : canResend ? 'Resend verification email' : 'Resend available in one minute'}
          disabled={isSubmitting || !canResend}
          onPress={() => void resend()}
        />
        <TextLinkLine label="Already verified?" action="Back to Login" onPress={() => nav.reset('login')} />
        <TextLinkLine label="Wrong email?" action="Create account" onPress={() => nav.reset('signup')} />
      </View>
    </ScrollScreen>
  );
}

function OnboardingScreen({ nav }: { nav: Navigation }) {
  const app = useAppState();
  const [step, setStep] = useState(0);
  const [budget, setBudget] = useState(app.preferences.weeklyBudget);
  const [connectBank, setConnectBank] = useState('');
  const [selectedFinanceTopics, setSelectedFinanceTopics] = useState<string[]>(app.preferences.preferredFinanceTopics);
  const [selectedResources, setSelectedResources] = useState<string[]>(app.preferences.preferredResources);
  const [wantsGovAssistance, setWantsGovAssistance] = useState<boolean | null>(app.preferences.wantsGovAssistance);
  const [profileImageUri, setProfileImageUri] = useState(app.profile.profileImageUri);
  const [notificationsEnabled, setNotificationsEnabled] = useState(app.preferences.notificationsEnabled);
  const [permissionMessage, setPermissionMessage] = useState('');
  const [isFinishing, setIsFinishing] = useState(false);
  const [finishError, setFinishError] = useState('');

  function toggleList(value: string, list: string[], setList: (items: string[]) => void) {
    setList(list.includes(value) ? list.filter((item) => item !== value) : [...list, value]);
  }

  async function pickImage() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
    });
    if (!result.canceled && result.assets[0]) {
      setProfileImageUri(result.assets[0].uri);
    }
  }

  async function requestLocationAndFinish() {
    const result = await Location.requestForegroundPermissionsAsync();
    setPermissionMessage(result.granted ? 'Location permission enabled.' : 'Location skipped. You can enable it later.');
    await finish();
  }

  async function requestNotifications() {
    try {
      const granted = await requestNotificationPermission();
      setNotificationsEnabled(granted);
      setPermissionMessage(granted ? 'Notification permission enabled.' : 'Notifications skipped. You can enable them later.');
    } catch {
      setNotificationsEnabled(false);
      setPermissionMessage('Push notifications are unavailable in Expo Go. You can enable them in a development build.');
    }
    setStep(7);
  }

  async function finish() {
    if (isFinishing) return;
    const preferences: AppPreferences = {
      weeklyBudget: budget,
      preferredFinanceTopics: selectedFinanceTopics,
      preferredResources: selectedResources,
      wantsGovAssistance: wantsGovAssistance ?? false,
      notificationsEnabled,
      expiringPantryNotificationsEnabled: app.preferences.expiringPantryNotificationsEnabled,
      weeklyMealPlanNotificationsEnabled: app.preferences.weeklyMealPlanNotificationsEnabled,
      resourceReminderNotificationsEnabled: app.preferences.resourceReminderNotificationsEnabled,
    };
    setIsFinishing(true);
    setFinishError('');
    try {
      await app.completeOnboarding(preferences, profileImageUri);
      if (notificationsEnabled) {
        void refreshPushTokenIfPermitted();
      }
      app.setEbtConnected(connectBank === 'yes');
      nav.reset('main');
    } catch (error) {
      setFinishError(error instanceof Error ? error.message : 'Unable to save onboarding.');
    } finally {
      setIsFinishing(false);
    }
  }

  const shellProps = {
    step,
    setStep,
    total: 6,
  };

  if (step === 0) {
    return (
      <OnboardingShell {...shellProps} current={1} canGoBack={false}>
        <Text style={styles.stepTitle}>What is your weekly{'\n'}grocery budget?</Text>
        <Text style={styles.stepSubtitle}>This helps us plan meals that fit around your budget.</Text>
        {['Below $50', '$75-100', '$100-$150', '$150-$200'].map((option) => (
          <SelectionRow key={option} title={option} selected={budget === option} onPress={() => setBudget(option)} />
        ))}
        <View style={styles.flexSpacer} />
        <AppButton title="Continue" disabled={!budget} onPress={() => setStep(1)} />
      </OnboardingShell>
    );
  }

  if (step === 1) {
    return (
      <OnboardingShell {...shellProps} current={2}>
        <Text style={styles.stepTitle}>Connect your bank or{'\n'}EBT card to get insights</Text>
        <Text style={styles.stepSubtitle}>Connecting your EBT card helps us find local deals and track your weekly benefits.</Text>
        <SelectionRow title="Yes, I would like to connect" selected={connectBank === 'yes'} onPress={() => setConnectBank('yes')} />
        <SelectionRow title="I'll connect to this later." selected={connectBank === 'later'} onPress={() => setConnectBank('later')} />
        <View style={styles.flexSpacer} />
        <Text style={styles.helperText}>You can always change this later in settings.</Text>
        <AppButton title="Next" disabled={!connectBank} onPress={() => setStep(2)} />
      </OnboardingShell>
    );
  }

  if (step === 2) {
    return (
      <OnboardingShell {...shellProps} current={3}>
        <Text style={styles.stepTitle}>What financial help do{'\n'}you want to learn?</Text>
        <Text style={styles.stepSubtitle}>Select all that apply. We will personalize your learning experience.</Text>
        {financeTopics.map((topic) => (
          <CheckboxRow
            key={topic.title}
            title={topic.title}
            subtitle={topic.subtitle}
            icon={topic.icon}
            selected={selectedFinanceTopics.includes(topic.title)}
            onPress={() => toggleList(topic.title, selectedFinanceTopics, setSelectedFinanceTopics)}
          />
        ))}
        <View style={styles.flexSpacer} />
        <AppButton title="Next" onPress={() => setStep(3)} />
      </OnboardingShell>
    );
  }

  if (step === 3) {
    return (
      <OnboardingShell {...shellProps} current={4}>
        <Text style={styles.stepTitle}>What resources do you{'\n'}need?</Text>
        <Text style={styles.stepSubtitle}>Select all that apply. We will match you with nearby resources.</Text>
        {resourceOptions.map((resource) => (
          <CheckboxRow
            key={resource.title}
            title={resource.title}
            subtitle={resource.subtitle}
            icon={resource.icon}
            selected={selectedResources.includes(resource.title)}
            onPress={() => toggleList(resource.title, selectedResources, setSelectedResources)}
          />
        ))}
        <View style={styles.flexSpacer} />
        <AppButton title="Next" onPress={() => setStep(4)} />
      </OnboardingShell>
    );
  }

  if (step === 4) {
    return (
      <OnboardingShell {...shellProps} current={5}>
        <Text style={styles.stepTitle}>Would you like help applying{'\n'}for benefits?</Text>
        <Text style={styles.stepSubtitle}>Penny can help prepare applications for programs you may qualify for.</Text>
        <View style={styles.chipRow}>
          {['SNAP', 'WIC', 'Medicaid', 'LIHEAP'].map((program) => (
            <Chip key={program} label={program} tone="green" />
          ))}
        </View>
        <SelectionRow title="Yes, I'd like help with applications" selected={wantsGovAssistance === true} onPress={() => setWantsGovAssistance(true)} />
        <SelectionRow title="I'll explore this on my own" selected={wantsGovAssistance === false} onPress={() => setWantsGovAssistance(false)} />
        <View style={styles.flexSpacer} />
        <AppButton title="Next" onPress={() => setStep(5)} />
      </OnboardingShell>
    );
  }

  if (step === 5) {
    return (
      <OnboardingShell {...shellProps} current={6}>
        <Text style={styles.stepTitle}>Upload a profile picture</Text>
        <Text style={styles.stepSubtitle}>Add a photo so Penny can greet you personally.</Text>
        <Pressable onPress={pickImage} style={styles.photoPicker}>
          {profileImageUri ? <AvatarButton imageUri={profileImageUri} size={130} onPress={pickImage} /> : <HiveIcon name="camera" size={38} color={HiveColors.green} />}
          {!profileImageUri ? <Text style={styles.helperText}>Tap to choose</Text> : null}
        </Pressable>
        <View style={styles.flexSpacer} />
        <AppButton title="Continue" onPress={() => setStep(6)} />
      </OnboardingShell>
    );
  }

  if (step === 6) {
    return (
      <PermissionStep
        icon="bell"
        title="Enable notifications"
        subtitle="Get reminders when items are expiring and when it is time to plan meals."
        primaryLabel="Enable Notifications"
        secondaryLabel="Maybe Later"
        onPrimary={() => void requestNotifications()}
        onSecondary={() => {
          setNotificationsEnabled(false);
          setStep(7);
        }}
      />
    );
  }

  return (
    <PermissionStep
      icon="map"
      title="Use your location"
      subtitle={finishError || permissionMessage || 'Location helps Penny show resources close to you.'}
      primaryLabel={isFinishing ? 'Saving…' : 'Allow Location'}
      secondaryLabel={isFinishing ? 'Saving…' : 'Skip for Now'}
      onPrimary={requestLocationAndFinish}
      onSecondary={() => void finish()}
    />
  );
}

function OnboardingShell({
  children,
  step,
  setStep,
  current,
  total,
  canGoBack = true,
}: {
  children: ReactNode;
  step: number;
  setStep: (step: number) => void;
  current: number;
  total: number;
  canGoBack?: boolean;
}) {
  return (
    <ScrollScreen contentStyle={styles.onboardingContent}>
      <View style={styles.onboardingTop}>
        <View style={rowStyles.spread}>
          {canGoBack ? (
            <Pressable onPress={() => setStep(Math.max(0, step - 1))} style={styles.smallBackButton}>
              <HiveIcon name="back" size={18} color={HiveColors.text} />
            </Pressable>
          ) : (
            <View style={styles.smallBackButton} />
          )}
          <Text style={styles.stepLabel}>STEP {current} OF {total}</Text>
          <View style={styles.smallBackButton} />
        </View>
        <ProgressBar current={current} total={total} />
      </View>
      <View style={styles.onboardingBody}>{children}</View>
    </ScrollScreen>
  );
}

function PermissionStep({
  icon,
  title,
  subtitle,
  primaryLabel,
  secondaryLabel,
  onPrimary,
  onSecondary,
}: {
  icon: HiveIconName;
  title: string;
  subtitle: string;
  primaryLabel: string;
  secondaryLabel: string;
  onPrimary: () => void;
  onSecondary: () => void;
}) {
  return (
    <Screen>
      <View style={styles.permissionScreen}>
        <View style={styles.bigIconCircle}>
          <HiveIcon name={icon} size={38} color={HiveColors.green} />
        </View>
        <Text style={styles.permissionTitle}>{title}</Text>
        <Text style={styles.permissionSubtitle}>{subtitle}</Text>
        <View style={styles.flexSpacer} />
        <View style={styles.fullWidth}>
          <AppButton title={primaryLabel} onPress={onPrimary} />
          <AppButton title={secondaryLabel} variant="plain" onPress={onSecondary} />
        </View>
      </View>
    </Screen>
  );
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
          <Text style={[uiText.muted, styles.centerText]}>
            Penny helps you find local resources, build budget-friendly meals, track pantry items, and understand benefits.
          </Text>
          <AppButton title="Start Saving" onPress={closeTour} style={styles.fullWidth} />
        </View>
      </ModalSheet>
    </Screen>
  );
}

function HomeScreen({ nav }: { nav: Navigation }) {
  const app = useAppState();
  const firstName = app.profile.firstName || 'there';

  return (
    <View style={styles.tabScreen}>
      <ScrollView contentContainerStyle={styles.homeContent} showsVerticalScrollIndicator={false}>
        <View style={styles.homeHeader}>
          <View style={styles.flexOne}>
            <Text style={styles.homeGreeting}>Hi {firstName},</Text>
            <Text style={styles.homeSubGreeting}>Ready to save some money today?</Text>
          </View>
          <AvatarButton imageUri={app.profile.profileImageUri} onPress={() => nav.push('account')} />
        </View>

        {app.ebtConnected ? (
          <LinearGradient
            colors={['#1F5220', '#2E6B2E']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.ebtConnected}>
            <View style={rowStyles.spread}>
              <Text style={styles.ebtLight}>EBT Balance</Text>
              <HiveIcon name="card" size={20} color="rgba(255,255,255,0.6)" />
            </View>
            <Text style={styles.ebtBalance}>$234.00</Text>
            <Text style={styles.ebtMeta}>Updated today · Next deposit Aug 1</Text>
            <Pressable onPress={() => app.setSelectedTab(4)} style={styles.ebtDetailsButton}>
              <Text style={styles.ebtDetailsText}>See details</Text>
            </Pressable>
          </LinearGradient>
        ) : (
          <SoftGreenPanel
            icon="card"
            title="EBT Card Balance"
            subtitle="Coming soon — balance & deposit tracking"
            badge="Coming Soon"
            onPress={() => nav.push('connectAccount')}
            style={styles.homeBlock}
          />
        )}

        {app.expiringItems.length > 0 ? (
          <AlertBanner
            emoji="🐝"
            title="Use It Soon 🐝"
            subtitle={`${app.expiringItems.length} pantry item${app.expiringItems.length === 1 ? '' : 's'} expiring in the next 5 days`}
            onPress={() => nav.push('pantry')}
            style={styles.homeBlock}
          />
        ) : null}

        <Text style={styles.homeQuestion}>What would you like to do first?</Text>

        <View style={styles.actionStack}>
          <GradientActionRow
            icon="doc"
            gradient="benefits"
            title="Start Government Assistance Applications"
            subtitle="Get help preparing applications for benefits you may qualify for."
            onPress={() => nav.push('government')}
          />
          <GradientActionRow
            icon="fork"
            gradient="meals"
            title="Create this week's meal plan"
            onPress={() => router.push('/meals/questionnaire')}
          />
        </View>

        <View style={styles.actionPair}>
          <GradientActionCard
            icon="fridge"
            gradient="pantry"
            title="Cook what I have"
            onPress={() => nav.push('pantry')}
          />
          <GradientActionCard
            icon="map"
            gradient="resources"
            title="Find Resources near me"
            onPress={() => app.setSelectedTab(3)}
          />
        </View>

        <Text style={styles.homeSectionTitle}>Weekly Best Deals</Text>
        <ComingSoonCard
          icon="cart"
          title="Coming Soon"
          subtitle="Curated EBT-friendly deals near you — launching soon!"
          onPress={() => nav.push('deals')}
          showChevron
          style={styles.homeBlock}
        />

        <SectionHeader title="Education Hub" onPress={() => nav.push('educationHub')} />
        <ComingSoonCard
          emoji="🎓"
          title="Educational Video Content"
          subtitle="Coming soon — money tips, cooking guides & more"
          onPress={() => nav.push('educationHub')}
          showChevron
          style={styles.homeBlock}
        />
      </ScrollView>

      <FloatingPillRow>
        {app.cart.length > 0 ? (
          <FloatingPill
            icon="cart"
            tone="light"
            align="left"
            label={`${app.cart.length} item cart · Clear`}
            onPress={app.clearCart}
          />
        ) : null}
        <FloatingPill icon="plus" label="Add to Pantry" onPress={() => nav.push('pantry')} />
      </FloatingPillRow>
    </View>
  );
}

type ChatMessage = {
  id: string;
  text: string;
  isUser: boolean;
};

function PennyScreen({ nav }: { nav: Navigation }) {
  const app = useAppState();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [messageText, setMessageText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [sendError, setSendError] = useState('');

  async function sendMessage(text: string) {
    const trimmed = text.trim();
    if (!trimmed || isTyping) return;

    setMessages((current) => [...current, { id: `u-${current.length}`, text: trimmed, isUser: true }]);
    setMessageText('');
    setSendError('');
    setIsTyping(true);

    try {
      // Everything Penny says comes from the backend. The app holds no model,
      // no prompt and no provider key.
      const result = await pennyService.send({ conversationId: null, text: trimmed });
      setMessages((current) => [
        ...current,
        { id: result.message.id, text: result.message.text, isUser: false },
      ]);
    } catch (error) {
      setSendError(describeError(error).message);
    } finally {
      setIsTyping(false);
    }
  }

  const hasConversation = messages.length > 0;

  return (
    <View style={styles.tabScreen}>
      <View style={styles.centeredHeader}>
        <View style={styles.headerSpacer} />
        <Text style={styles.centeredHeaderTitle}>Penny AI</Text>
        <AvatarButton imageUri={app.profile.profileImageUri} onPress={() => nav.push('account')} />
      </View>

      <ScrollView
        contentContainerStyle={hasConversation ? styles.pennyThread : styles.pennyIntro}
        showsVerticalScrollIndicator={false}>
        {hasConversation ? (
          <>
            {messages.map((message) => (
              <View
                key={message.id}
                style={[styles.bubble, message.isUser ? styles.bubbleUser : styles.bubblePenny]}>
                <Text style={message.isUser ? styles.bubbleUserText : styles.bubblePennyText}>
                  {message.text}
                </Text>
              </View>
            ))}
            {isTyping ? (
              <View style={[styles.bubble, styles.bubblePenny]}>
                <Text style={styles.bubblePennyText}>Penny is thinking…</Text>
              </View>
            ) : null}
          </>
        ) : (
          <>
            <View style={styles.pennyAvatarWrap}>
              <PennyImage source={pennySource} size={132} />
              <View style={styles.pennyOnlineDot} />
            </View>
            <Text style={styles.pennyGreeting}>Hi, I&apos;m Penny</Text>
            <Text style={styles.pennyPrompt}>How can I help you today?</Text>

            <View style={styles.pennySuggestions}>
              {PENNY_SUGGESTIONS.map((suggestion) => (
                <Pressable
                  key={suggestion}
                  accessibilityRole="button"
                  accessibilityLabel={suggestion}
                  onPress={() => void sendMessage(suggestion)}
                  style={({ pressed }) => [styles.suggestionCard, pressed && styles.pressed]}>
                  <Text style={styles.suggestionText}>{suggestion}</Text>
                </Pressable>
              ))}
            </View>
          </>
        )}

        {sendError ? <Text style={styles.pennyError}>{sendError}</Text> : null}
      </ScrollView>

      <Text style={styles.pennyDisclaimer}>{PENNY_DISCLAIMER}</Text>

      <View style={styles.pennyComposer}>
        <TextInput
          value={messageText}
          onChangeText={setMessageText}
          placeholder="Ask Penny"
          placeholderTextColor="#9AA0A6"
          style={styles.pennyInput}
          returnKeyType="send"
          onSubmitEditing={() => void sendMessage(messageText)}
          accessibilityLabel="Ask Penny"
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Send message"
          onPress={() => void sendMessage(messageText)}
          disabled={messageText.trim().length === 0 || isTyping}
          style={({ pressed }) => [styles.pennySend, pressed && styles.pressed]}>
          <HiveIcon name="next" size={18} color={HiveColors.green} />
        </Pressable>
      </View>
    </View>
  );
}

function ResourcesScreen({ nav }: { nav: Navigation }) {
  const app = useAppState();
  const [selectedCategory, setSelectedCategory] = useState('All');
  const categories = ['All', 'Food', 'Housing', 'Healthcare', 'Utility', 'Job'];
  const filteredResources =
    selectedCategory === 'All'
      ? nearbyResources
      : nearbyResources.filter((resource) =>
          resource.tag.toLowerCase().includes(selectedCategory.toLowerCase())
        );

  return (
    <View style={styles.tabScreen}>
      <View style={styles.centeredHeader}>
        <View style={styles.headerSpacer} />
        <Text style={styles.centeredHeaderTitle}>Resources</Text>
        <AvatarButton imageUri={app.profile.profileImageUri} onPress={() => nav.push('account')} />
      </View>

      <ScrollView contentContainerStyle={styles.resourceContent} showsVerticalScrollIndicator={false}>
        <Text style={styles.pageSectionTitle}>Government Assistance</Text>
        <View style={styles.sectionInset}>
          <GradientActionRow
            icon="doc"
            gradient="benefits"
            title="Start Your Benefits Application"
            subtitle="Penny pre-fills SNAP, Medicaid, WIC & more — you review before submitting"
            onPress={() => nav.push('government')}
          />
        </View>

        <View style={styles.pennyNote}>
          <Text style={styles.pennyNoteEmoji}>🐝</Text>
          <Text style={styles.pennyNoteText}>
            We&apos;ll guide you through your application step by step. Before anything is printed or
            sent, you&apos;ll have the chance to review every detail and make sure it&apos;s ready to go
            to the right government office.
          </Text>
        </View>

        {/* Category filtering is newer than the reference build; kept, restyled. */}
        <HorizontalScroller>
          {categories.map((category) => (
            <Chip
              key={category}
              label={category}
              selected={selectedCategory === category}
              onPress={() => setSelectedCategory(category)}
            />
          ))}
        </HorizontalScroller>

        <SectionHeader title="Resources Near You" onPress={() => nav.push('resourceSearch')} />
        {filteredResources.length > 0 ? (
          filteredResources.map((resource) => (
            <ResourceRow
              key={resource.id}
              resource={resource}
              onPress={() => nav.push('resourceDetails', { resource })}
            />
          ))
        ) : (
          <EmptyState title="No resources match this filter." icon="map" />
        )}

        <Text style={styles.homeSectionTitle}>More Coming Soon</Text>
        <View style={styles.comingSoonList}>
          <ComingSoonRow
            icon="play"
            title="How-To Video Guides"
            subtitle="Step-by-step guides for SNAP, housing & more"
            onPress={() => nav.push('resourcesHub')}
          />
          <ComingSoonRow
            icon="cart"
            title="Deals & Discounts"
            subtitle="Curated EBT-friendly deals near you"
            onPress={() => nav.push('deals')}
          />
          <ComingSoonRow
            icon="shield"
            title="Emergency Help"
            subtitle="Urgent housing, food, and crisis resources"
            onPress={() => nav.push('resourceSearch')}
          />
        </View>
      </ScrollView>
    </View>
  );
}

function FinanceScreen({ nav }: { nav: Navigation }) {
  const app = useAppState();

  return (
    <View style={styles.tabScreen}>
      <View style={styles.centeredHeader}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Notifications"
          onPress={() => nav.push('notifications')}
          style={styles.headerIconButton}>
          <HiveIcon name="bell" size={20} color={HiveColors.text} />
        </Pressable>
        <Text style={styles.centeredHeaderTitle}>Finances</Text>
        <AvatarButton imageUri={app.profile.profileImageUri} onPress={() => nav.push('account')} />
      </View>

      <ScrollView contentContainerStyle={styles.financeContent} showsVerticalScrollIndicator={false}>
        <ComingSoonHub
          image={pennySource}
          title="Finance Hub"
          subtitle="Coming Soon to Help The Hive"
          body="We're building powerful money tools designed specifically for families like yours — EBT tracking, spending insights, bill reminders, and more."
          features={[
            { icon: 'card', label: 'EBT Balance Tracking' },
            { icon: 'chart', label: 'Spending Reports' },
            { icon: 'bell', label: 'Bill Reminders' },
            { icon: 'finance', label: 'Budget Goals' },
            { icon: 'heart', label: 'Rx Savings' },
            { icon: 'shield', label: 'Insurance Offers' },
          ]}
          footnote="Penny will notify you the moment this launches"
        />
      </ScrollView>
    </View>
  );
}

function PantryScreen({ nav }: { nav: Navigation }) {
  const app = useAppState();
  const [filter, setFilter] = useState<'active' | 'used' | 'expired'>('active');
  const items = filter === 'active' ? app.activePantryItems : filter === 'used' ? app.usedItems : app.expiredItems;

  return (
    <ScrollScreen>
      <AppHeader title="My Pantry" onBack={nav.back} onAvatar={() => nav.push('account')} profileImageUri={app.profile.profileImageUri} />
      <View style={styles.pantrySummary}>
        <StatBadge value={`${app.wasteStats.totalAdded}`} label="ITEMS ADDED" />
        <StatBadge value={`${app.wasteStats.totalUsed}`} label="USED" />
        <StatBadge value={`$${app.wasteStats.estimatedWasteValue.toFixed(2)}`} label="WASTE SAVED" />
      </View>
      <View style={styles.filterRow}>
        {(['active', 'used', 'expired'] as const).map((item) => (
          <Chip key={item} label={capitalize(item)} selected={filter === item} onPress={() => setFilter(item)} />
        ))}
      </View>
      <View style={styles.listStack}>
        {items.length > 0 ? (
          items.map((item) => (
            <Card key={item.id} style={styles.pantryItemCard}>
              <View style={rowStyles.row}>
                <View style={styles.rowIconTint}>
                  <HiveIcon name={locationIcon(item.location) as HiveIconName} size={18} color={HiveColors.green} />
                </View>
                <View style={styles.flexOne}>
                  <Text style={styles.cardTitle}>{item.name}</Text>
                  <Text style={styles.miniMuted}>
                    {item.quantity} - {item.location} - Expires {formatDate(item.expirationDate)}
                  </Text>
                </View>
              </View>
              {filter === 'active' ? (
                <View style={styles.cardActionRow}>
                  <AppButton title="Used" variant="secondary" onPress={() => app.updatePantryItemStatus(item.id, 'used')} style={styles.flexOne} />
                  <AppButton title="Delete" variant="plain" onPress={() => app.deletePantryItem(item.id)} style={styles.flexOne} />
                </View>
              ) : null}
            </Card>
          ))
        ) : (
          <EmptyState title="No pantry items here yet." subtitle="Add items manually or from the scan prototype." />
        )}
      </View>
      <View style={styles.sideMargin}>
        <AppButton title="Add Pantry Item" icon="plus" onPress={() => nav.push('addPantry')} />
      </View>
    </ScrollScreen>
  );
}

function AddPantryScreen({ nav }: { nav: Navigation }) {
  const app = useAppState();
  const [name, setName] = useState('');
  const [quantity, setQuantity] = useState('');
  const [location, setLocation] = useState<StorageLocation>('Pantry');
  const [category, setCategory] = useState('Other');
  const [days, setDays] = useState('7');

  function save() {
    app.addPantryItem(
      makePantryItem({
        name,
        quantity,
        location,
        category,
        expirationDate: daysFromNow(Number.parseInt(days, 10) || 7),
      })
    );
    nav.back();
  }

  return (
    <ScrollScreen keyboard>
      <AppHeader title="Add Pantry Item" onBack={nav.back} />
      <View style={styles.formScreen}>
        <AppTextField label="Item name" value={name} onChangeText={setName} placeholder="Milk" />
        <AppTextField label="Quantity" value={quantity} onChangeText={setQuantity} placeholder="1 gallon" />
        <AppTextField label="Category" value={category} onChangeText={setCategory} placeholder="Dairy" />
        <AppTextField label="Expires in days" value={days} onChangeText={setDays} placeholder="7" keyboardType="number-pad" />
        <Text style={styles.fieldGroupLabel}>Storage location</Text>
        <View style={styles.filterRow}>
          {storageLocations.map((option) => (
            <Chip key={option} label={option} selected={location === option} onPress={() => setLocation(option)} />
          ))}
        </View>
        <AppButton title="Save Item" disabled={!name || !quantity} onPress={save} />
      </View>
    </ScrollScreen>
  );
}

function AccountScreen({ nav }: { nav: Navigation }) {
  const app = useAppState();
  const auth = useAuth();
  const [signOutError, setSignOutError] = useState('');
  const name = app.displayName;

  async function signOut() {
    setSignOutError('');
    try {
      try {
        await unregisterStoredPushToken();
      } catch {
        // Signing out must not be blocked by best-effort push-token cleanup.
      }
      await auth.signOut();
      nav.reset('welcome');
    } catch (error) {
      setSignOutError(error instanceof Error ? error.message : 'Unable to sign out.');
    }
  }

  return (
    <ScrollScreen>
      <AppHeader title="My Account" onBack={nav.back} right={<Pressable onPress={() => nav.push('settings')} style={styles.iconButtonPlain}><HiveIcon name="gear" size={18} /></Pressable>} />
      <View style={styles.accountHeader}>
        <AvatarButton imageUri={app.profile.profileImageUri} onPress={() => nav.push('editProfile')} size={58} />
        <View style={styles.flexOne}>
          <Text style={styles.accountName}>{name}</Text>
          <Text style={styles.miniMuted}>{auth.user?.email ?? ''}</Text>
          <Pressable onPress={() => nav.push('editProfile')}>
            <Text style={styles.greenLink}>Edit Profile</Text>
          </Pressable>
        </View>
      </View>
      <View style={styles.accountStats}>
        <StatBadge value="June 12, 2011" label="MEMBER SINCE" />
        <StatBadge value="$847.30" label="TOTAL SAVED" />
        <StatBadge value="142" label="MEALS PLANNED" />
      </View>
      <AccountSection title="ACCOUNT" />
      <InfoRow icon="user" title="Edit Profile" onPress={() => nav.push('editProfile')} />
      <InfoRow icon="chat" title="Public Handle" subtitle={app.profile.handle ? `@${app.profile.handle}` : 'Choose a handle'} onPress={() => nav.push('editHandle')} />
      <InfoRow icon="send" title="Login Email" subtitle={auth.user?.email ?? ''} onPress={() => nav.push('changeEmail')} />
      <InfoRow icon="card" title="Connected EBT Card" badge="Plaid - Beta" onPress={() => nav.push('connectAccount')} />
      <AccountSection title="PREFERENCES" />
      <InfoRow icon="bell" title="Notification Settings" onPress={() => nav.push('notifications')} />
      <InfoRow icon="finance" title="Budget Settings" onPress={() => nav.push('budgetSettings')} />
      <AccountSection title="SUPPORT" />
      <InfoRow icon="chat" title="Send Feedback" onPress={() => nav.push('feedback')} />
      <InfoRow icon="resources" title="About Help The Hive" onPress={() => Linking.openURL('https://helpthehive.com')} />
      <View style={styles.formScreen}>
        {app.profileSyncError ? (
          <>
            <Text style={styles.authError}>{app.profileSyncError}</Text>
            <AppButton title="Retry Profile Sync" variant="plain" onPress={() => void app.hydrateViewer()} />
          </>
        ) : null}
        {signOutError ? <Text style={styles.authError}>{signOutError}</Text> : null}
        <AppButton
          title="Sign Out"
          variant="secondary"
          onPress={() => void signOut()}
        />
        <AppButton title="Delete Account" variant="danger" onPress={() => nav.push('deleteAccount')} />
      </View>
    </ScrollScreen>
  );
}

function DeleteAccountScreen({ nav }: { nav: Navigation }) {
  const auth = useAuth();
  const [password, setPassword] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  async function deleteAccount() {
    setIsDeleting(true);
    setErrorMessage('');
    try {
      await auth.confirmPassword(password);
      try {
        await unregisterStoredPushToken();
      } catch {
        // App-owned data deletion also removes any remaining push tokens.
      }
      await deleteViewerData();
      await auth.deleteAccount(password);
      nav.reset('welcome');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to delete your account.');
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <ScrollScreen keyboard>
      <AppHeader title="Delete Account" onBack={nav.back} />
      <View style={styles.formScreen}>
        <Text style={uiText.subtitle}>Permanently delete your account?</Text>
        <Text style={uiText.muted}>
          This removes your Help The Hive profile, preferences, pantry data, push tokens, and login. This action cannot be undone.
        </Text>
        <AppTextField
          label="Confirm your password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          placeholder="Password"
        />
        {errorMessage ? <Text style={styles.authError}>{errorMessage}</Text> : null}
        <AppButton
          title={isDeleting ? 'Deleting account…' : 'Permanently Delete Account'}
          variant="danger"
          disabled={!password || isDeleting}
          onPress={() => void deleteAccount()}
        />
        <AppButton title="Cancel" variant="plain" disabled={isDeleting} onPress={nav.back} />
      </View>
    </ScrollScreen>
  );
}

function handleAvailabilityMessage(availability: HandleAvailability | null) {
  if (!availability) return '';
  switch (availability.reason) {
    case 'AVAILABLE': return `@${availability.handle} is available.`;
    case 'CURRENT': return `@${availability.handle} is your current handle.`;
    case 'INVALID_FORMAT': return 'Use 3–30 characters, start with a letter, and use only letters, numbers, or underscores.';
    case 'RESERVED': return 'That handle is reserved.';
    case 'UNAVAILABLE': return 'That handle is already taken.';
    case 'COOLDOWN': return availability.retryAfter
      ? `You can change your handle again after ${new Date(availability.retryAfter).toLocaleDateString()}.`
      : 'Handles can only be changed once every 30 days.';
  }
}

function EditHandleScreen({ nav }: { nav: Navigation }) {
  const app = useAppState();
  const [handle, setHandle] = useState(app.profile.handle ?? '');
  const [availability, setAvailability] = useState<HandleAvailability | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const candidate = handle.trim().toLowerCase();
    if (!candidate) return;
    const timer = setTimeout(() => {
      setIsChecking(true);
      void app.checkHandleAvailability(candidate).then(
        setAvailability,
        (reason: unknown) => setError(reason instanceof Error ? reason.message : 'Unable to check this handle.')
      ).finally(() => setIsChecking(false));
    }, 350);
    return () => clearTimeout(timer);
  }, [app, handle]);

  async function save() {
    setIsSaving(true);
    setError('');
    try {
      await app.saveHandle(handle);
      nav.back();
    } catch (reason) {
      if (reason instanceof HandleUpdateError && reason.code === 'COOLDOWN' && reason.retryAfter) {
        setError(`You can change your handle again after ${new Date(reason.retryAfter).toLocaleDateString()}.`);
      } else {
        setError(reason instanceof Error ? reason.message : 'Unable to update your handle.');
      }
    } finally {
      setIsSaving(false);
    }
  }

  const canSave = Boolean(availability?.available && availability.reason === 'AVAILABLE' && !isSaving);
  return (
    <ScrollScreen keyboard>
      <AppHeader title="Public Handle" onBack={nav.back} />
      <View style={styles.formScreen}>
        <Text style={uiText.subtitle}>Choose how people find you</Text>
        <Text style={uiText.muted}>Handles are public and may be used in future sharing links. Previous handles remain reserved to protect old links.</Text>
        <AppTextField
          label="Handle"
          value={handle}
          onChangeText={(value) => {
            setHandle(value.toLowerCase());
            setAvailability(null);
            setError('');
          }}
          placeholder="dadcooks33"
          autoCapitalize="none"
          autoCorrect={false}
          spellCheck={false}
        />
        <Text style={availability?.available ? styles.greenLink : styles.helperText}>
          {isChecking ? 'Checking availability…' : handleAvailabilityMessage(availability)}
        </Text>
        {error ? <Text style={styles.authError}>{error}</Text> : null}
        <AppButton title={isSaving ? 'Saving…' : 'Save Handle'} disabled={!canSave} onPress={() => void save()} />
      </View>
    </ScrollScreen>
  );
}

function EditProfileScreen({ nav }: { nav: Navigation }) {
  const app = useAppState();
  const [firstName, setFirstName] = useState(app.profile.firstName);
  const [lastName, setLastName] = useState(app.profile.lastName);
  const [phone, setPhone] = useState(app.profile.phone);
  const [zip, setZip] = useState(app.profile.zip);
  const [householdSize, setHouseholdSize] = useState(String(app.profile.householdSize));
  const [imageUri, setImageUri] = useState(app.profile.profileImageUri);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  async function pickImage() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
    });
    if (!result.canceled && result.assets[0]) {
      setImageUri(result.assets[0].uri);
    }
  }

  async function save() {
    const parsedHouseholdSize = Number.parseInt(householdSize, 10);
    if (!firstName.trim() || !lastName.trim() || !Number.isInteger(parsedHouseholdSize) || parsedHouseholdSize < 1) {
      setSaveError('Enter your first and last name and a valid household size.');
      return;
    }
    setIsSaving(true);
    setSaveError('');
    try {
      await app.saveProfile({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        phone: phone.trim(),
        zip: zip.trim(),
        householdSize: parsedHouseholdSize,
      });
      app.setLocalProfileImage(imageUri);
      nav.back();
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Unable to save your profile.');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <ScrollScreen keyboard>
      <AppHeader title="Edit Profile" onBack={nav.back} />
      <View style={styles.formScreen}>
        <View style={styles.centeredCompact}>
          <AvatarButton imageUri={imageUri} onPress={pickImage} size={90} />
          <AppButton title="Choose Photo" variant="plain" onPress={pickImage} />
        </View>
        <AppTextField label="First name" value={firstName} onChangeText={setFirstName} />
        <AppTextField label="Last name" value={lastName} onChangeText={setLastName} />
        <AppTextField label="Phone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
        <AppTextField label="ZIP code" value={zip} onChangeText={setZip} keyboardType="number-pad" />
        <AppTextField label="Household size" value={householdSize} onChangeText={setHouseholdSize} keyboardType="number-pad" />
        <Text style={styles.helperText}>Profile photos are stored on this device until cloud uploads are available.</Text>
        {saveError ? <Text style={styles.authError}>{saveError}</Text> : null}
        <AppButton title={isSaving ? 'Saving…' : 'Save Changes'} disabled={isSaving} onPress={() => void save()} />
      </View>
    </ScrollScreen>
  );
}

function ChangeEmailScreen({ nav }: { nav: Navigation }) {
  const auth = useAuth();
  const [newEmail, setNewEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const [isError, setIsError] = useState(false);

  async function submit() {
    setIsSubmitting(true);
    setMessage('');
    setIsError(false);
    try {
      await auth.changeEmail(newEmail);
      setMessage('Check your new inbox and open the verification link to finish changing your login email.');
      setNewEmail('');
    } catch (error) {
      setIsError(true);
      setMessage(error instanceof Error ? error.message : 'Unable to change your login email.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <ScrollScreen keyboard>
      <AppHeader title="Login Email" onBack={nav.back} />
      <View style={styles.formScreen}>
        <Text style={uiText.subtitle}>Change your login email</Text>
        <Text style={uiText.muted}>Current email: {auth.user?.email ?? ''}</Text>
        <AppTextField label="New email" value={newEmail} onChangeText={setNewEmail} placeholder="you@example.com" keyboardType="email-address" />
        {message ? <Text style={isError ? styles.authError : uiText.muted}>{message}</Text> : null}
        <AppButton
          title={isSubmitting ? 'Sending confirmation…' : 'Change Login Email'}
          disabled={!newEmail.includes('@') || newEmail.trim().toLowerCase() === auth.user?.email.toLowerCase() || isSubmitting}
          onPress={() => void submit()}
        />
      </View>
    </ScrollScreen>
  );
}

function SettingsScreen({ nav }: { nav: Navigation }) {
  return (
    <ScrollScreen>
      <AppHeader title="App Settings" onBack={nav.back} />
      <InfoRow icon="bell" title="Notifications" subtitle="Meal, pantry, and resource reminders" onPress={() => nav.push('notifications')} />
      <InfoRow icon="finance" title="Budget Settings" subtitle="Weekly grocery budget and finance topics" onPress={() => nav.push('budgetSettings')} />
      <InfoRow icon="map" title="Location" subtitle="Used for nearby resources" />
      <InfoRow icon="shield" title="Privacy" subtitle="Local prototype data only" />
    </ScrollScreen>
  );
}

function NotificationsScreen({ nav }: { nav: Navigation }) {
  const app = useAppState();
  const [enabled, setEnabled] = useState(app.preferences.notificationsEnabled);
  const [pantry, setPantry] = useState(app.preferences.expiringPantryNotificationsEnabled);
  const [meals, setMeals] = useState(app.preferences.weeklyMealPlanNotificationsEnabled);
  const [resources, setResources] = useState(app.preferences.resourceReminderNotificationsEnabled);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');
  const [saveError, setSaveError] = useState('');

  async function save() {
    setIsSaving(true);
    setSaveMessage('');
    setSaveError('');
    try {
      await app.savePreferences({
        notificationsEnabled: enabled,
        expiringPantryNotificationsEnabled: pantry,
        weeklyMealPlanNotificationsEnabled: meals,
        resourceReminderNotificationsEnabled: resources,
      });
      if (enabled) {
        const result = await requestAndRegisterPushToken();
        if (result.status !== 'registered') {
          setSaveMessage(result.message);
          return;
        }
      } else {
        try {
          await unregisterStoredPushToken();
        } catch (error) {
          setSaveMessage(`Notification preferences were saved, but this device could not be unregistered. ${error instanceof Error ? error.message : ''}`.trim());
          return;
        }
      }
      nav.back();
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Unable to save notification preferences.');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <ScrollScreen>
      <AppHeader title="Notifications" onBack={nav.back} />
      <View style={styles.formScreen}>
        <CheckboxRow title="Enable notifications" subtitle="Master switch" selected={enabled} onPress={() => setEnabled(!enabled)} />
        <CheckboxRow title="Expiring pantry items" selected={pantry} onPress={() => setPantry(!pantry)} />
        <CheckboxRow title="Weekly meal planning" selected={meals} onPress={() => setMeals(!meals)} />
        <CheckboxRow title="Resource reminders" selected={resources} onPress={() => setResources(!resources)} />
        {saveMessage ? <Text style={uiText.muted}>{saveMessage}</Text> : null}
        {saveError ? <Text style={styles.authError}>{saveError}</Text> : null}
        <AppButton title={isSaving ? 'Saving…' : 'Save Changes'} disabled={isSaving} onPress={() => void save()} />
      </View>
    </ScrollScreen>
  );
}

function BudgetSettingsScreen({ nav }: { nav: Navigation }) {
  const app = useAppState();
  const [budget, setBudget] = useState(app.preferences.weeklyBudget || '$75-100');
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  async function save() {
    setIsSaving(true);
    setSaveError('');
    try {
      await app.savePreferences({ weeklyBudget: budget });
      nav.back();
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Unable to save your budget.');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <ScrollScreen>
      <AppHeader title="Budget Settings" onBack={nav.back} />
      <View style={styles.formScreen}>
        <Text style={uiText.subtitle}>Weekly grocery budget</Text>
        {['Below $50', '$75-100', '$100-$150', '$150-$200'].map((option) => (
          <SelectionRow key={option} title={option} selected={budget === option} onPress={() => setBudget(option)} />
        ))}
        {saveError ? <Text style={styles.authError}>{saveError}</Text> : null}
        <AppButton title={isSaving ? 'Saving…' : 'Save Budget'} disabled={isSaving} onPress={() => void save()} />
      </View>
    </ScrollScreen>
  );
}

function FeedbackScreen({ nav }: { nav: Navigation }) {
  const [message, setMessage] = useState('');

  return (
    <ScrollScreen keyboard>
      <AppHeader title="Send Feedback" onBack={nav.back} />
      <View style={styles.formScreen}>
        <Text style={uiText.subtitle}>Help shape Penny</Text>
        <Text style={uiText.muted}>This prototype stores no backend ticket. Use this to verify the feedback screen flow.</Text>
        <AppTextField label="Feedback" value={message} onChangeText={setMessage} placeholder="What should we improve?" multiline />
        <AppButton title="Send Feedback" disabled={!message.trim()} onPress={nav.back} />
      </View>
    </ScrollScreen>
  );
}

function DealsScreen({ nav }: { nav: Navigation }) {
  const app = useAppState();
  return (
    <ScrollScreen>
      <AppHeader title="Deals & Promotions" onBack={nav.back} />
      <View style={styles.gridList}>
        {sampleDeals.map((deal) => (
          <DealCard key={deal.id} deal={deal} inCart={app.isInCart(deal.id)} onAdd={() => app.addToCart(deal)} wide />
        ))}
      </View>
    </ScrollScreen>
  );
}

function RecipeScreen({ nav, recipe }: { nav: Navigation; recipe?: MealRecipe }) {
  const chosen = recipe ?? mealsByDow[0][0].recipe;

  return (
    <ScrollScreen>
      <AppHeader title="Recipe Video" onBack={nav.back} />
      <View style={styles.videoHero}>
        <HiveIcon name="play" size={42} color={HiveColors.white} />
      </View>
      <View style={styles.formScreen}>
        <View style={rowStyles.spread}>
          <Text style={uiText.subtitle}>{chosen.name}</Text>
          <Chip label={chosen.tag} tone="warning" />
        </View>
        <Text style={uiText.muted}>{chosen.time} - {chosen.servings} - {chosen.cost}</Text>
        <Text style={styles.fieldGroupLabel}>Ingredients</Text>
        {chosen.ingredients.map((ingredient) => <Bullet key={ingredient} text={ingredient} />)}
        <Text style={styles.fieldGroupLabel}>Steps</Text>
        {chosen.steps.map((step, index) => <Bullet key={step} text={`${index + 1}. ${step}`} />)}
      </View>
    </ScrollScreen>
  );
}

function VideoHubScreen({ nav, title, videos }: { nav: Navigation; title: string; videos: VideoItem[] }) {
  return (
    <ScrollScreen>
      <AppHeader title={title} onBack={nav.back} />
      <View style={styles.gridList}>
        {videos.map((video) => <VideoCard key={video.id} video={video} onPress={() => nav.push('video', { video })} wide />)}
      </View>
    </ScrollScreen>
  );
}

function VideoDetailScreen({ nav, video }: { nav: Navigation; video?: VideoItem }) {
  const chosen = video ?? allVideos[0];
  return (
    <ScrollScreen>
      <AppHeader title="How-To Video" onBack={nav.back} />
      <View style={styles.videoHero}>
        <HiveIcon name="play" size={42} color={HiveColors.white} />
      </View>
      <View style={styles.formScreen}>
        <View style={rowStyles.spread}>
          <Text style={uiText.subtitle}>{chosen.title}</Text>
          <Chip label={chosen.duration} />
        </View>
        <Text style={uiText.muted}>{chosen.description}</Text>
        <View style={styles.chipRow}>
          {chosen.tags.map((tag) => <Chip key={tag} label={tag} tone="neutral" />)}
        </View>
        <AppButton title="Save Video" variant="secondary" onPress={nav.back} />
      </View>
    </ScrollScreen>
  );
}

function ResourceSearchScreen({ nav }: { nav: Navigation }) {
  const [query, setQuery] = useState('');
  const results = nearbyResources.filter((resource) => resource.name.toLowerCase().includes(query.toLowerCase()) || resource.tag.toLowerCase().includes(query.toLowerCase()));

  return (
    <ScrollScreen keyboard>
      <AppHeader title="Find Resources" onBack={nav.back} />
      <View style={styles.formScreen}>
        <AppTextField label="Search" value={query} onChangeText={setQuery} placeholder="Food, housing, healthcare" />
      </View>
      {(query ? results : nearbyResources).map((resource) => (
        <ResourceRow key={resource.id} resource={resource} onPress={() => nav.push('resourceDetails', { resource })} />
      ))}
    </ScrollScreen>
  );
}

function ResourceDetailsScreen({ nav, resource }: { nav: Navigation; resource?: ResourceItem }) {
  const chosen = resource ?? nearbyResources[0];

  return (
    <ScrollScreen>
      <AppHeader title="Resource Details" onBack={nav.back} />
      <View style={styles.formScreen}>
        <Chip label={chosen.tag} tone="green" />
        <Text style={uiText.subtitle}>{chosen.name}</Text>
        <Text style={uiText.muted}>{chosen.description}</Text>
        <InfoRow icon="map" title={chosen.address} subtitle={chosen.distance} />
        <InfoRow icon="bell" title={chosen.hours} />
        <InfoRow icon="chat" title={chosen.phone} />
        <InfoRow icon="resources" title={chosen.website} onPress={() => Linking.openURL(`https://${chosen.website}`)} />
        <AppButton title="Call Resource" onPress={() => Linking.openURL(`tel:${chosen.phone}`)} />
      </View>
    </ScrollScreen>
  );
}

function GovernmentScreen({ nav }: { nav: Navigation }) {
  const app = useAppState();

  return (
    <ScrollScreen>
      <AppHeader title="Government Assistance" onBack={nav.back} />
      <View style={styles.formScreen}>
        <Card style={styles.benefitsBanner}>
          <Text style={styles.infoTitleStrong}>Benefits profile</Text>
          <Text style={styles.infoSubtitleText}>
            {app.governmentProfile.completed ? 'Profile ready for review before any application.' : 'Complete a profile to prefill application drafts.'}
          </Text>
          <AppButton title={app.governmentProfile.completed ? 'Update Profile' : 'Start Questionnaire'} onPress={() => nav.push('benefitsQuestionnaire')} />
        </Card>
      </View>
      <View style={styles.listStack}>
        {benefitPrograms.map((program) => (
          <Card key={program.id} onPress={() => nav.push('programApplication', { program })}>
            <View style={rowStyles.spread}>
              <View style={styles.flexOne}>
                <Text style={styles.cardTitle}>{program.name}</Text>
                <Text style={styles.miniMuted}>{program.agency}</Text>
                <Text style={styles.cardBody}>{program.description}</Text>
              </View>
              <HiveIcon name="next" size={14} color={HiveColors.textSecondary} />
            </View>
          </Card>
        ))}
      </View>
    </ScrollScreen>
  );
}

function BenefitsQuestionnaireScreen({ nav }: { nav: Navigation }) {
  const app = useAppState();
  const [firstName, setFirstName] = useState(app.formName.firstName);
  const [lastName, setLastName] = useState(app.formName.lastName);
  const [stateName, setStateName] = useState(app.governmentProfile.state || 'California');
  const [householdSize, setHouseholdSize] = useState(String(app.governmentProfile.householdSize || app.profile.householdSize));
  const [employmentStatus, setEmploymentStatus] = useState(app.governmentProfile.employmentStatus || 'Working part-time');
  const [monthlyIncome, setMonthlyIncome] = useState(app.governmentProfile.monthlyIncome || '');
  const [housingStatus, setHousingStatus] = useState(app.governmentProfile.housingStatus || 'Renting');
  const [monthlyRent, setMonthlyRent] = useState(app.governmentProfile.monthlyRent || '');

  function save() {
    app.updateGovernmentProfile({
      completed: true,
      firstName: firstName.trim() === app.profile.firstName ? '' : firstName.trim(),
      lastName: lastName.trim() === app.profile.lastName ? '' : lastName.trim(),
      state: stateName,
      householdSize: Number.parseInt(householdSize, 10) || 1,
      employmentStatus,
      monthlyIncome,
      housingStatus,
      monthlyRent,
    });
    nav.back();
  }

  return (
    <ScrollScreen keyboard>
      <AppHeader title="Benefits Questionnaire" onBack={nav.back} />
      <View style={styles.formScreen}>
        <AppTextField label="First name" value={firstName} onChangeText={setFirstName} />
        <AppTextField label="Last name" value={lastName} onChangeText={setLastName} />
        <AppTextField label="State" value={stateName} onChangeText={setStateName} />
        <AppTextField label="Household size" value={householdSize} onChangeText={setHouseholdSize} keyboardType="number-pad" />
        <AppTextField label="Employment status" value={employmentStatus} onChangeText={setEmploymentStatus} />
        <AppTextField label="Monthly income" value={monthlyIncome} onChangeText={setMonthlyIncome} keyboardType="decimal-pad" />
        <AppTextField label="Housing status" value={housingStatus} onChangeText={setHousingStatus} />
        <AppTextField label="Monthly rent" value={monthlyRent} onChangeText={setMonthlyRent} keyboardType="decimal-pad" />
        <AppButton title="Save Benefits Profile" onPress={save} />
      </View>
    </ScrollScreen>
  );
}

function ProgramApplicationScreen({ nav, program }: { nav: Navigation; program?: BenefitProgram }) {
  const app = useAppState();
  const chosen = program ?? benefitPrograms[0];

  return (
    <ScrollScreen>
      <AppHeader title={`${chosen.name} Application`} onBack={nav.back} />
      <View style={styles.formScreen}>
        <Text style={uiText.subtitle}>{chosen.name}</Text>
        <Text style={uiText.muted}>{chosen.estimate}</Text>
        <Text style={styles.fieldGroupLabel}>Application checklist</Text>
        {chosen.requirements.map((requirement) => <Bullet key={requirement} text={requirement} />)}
        <Text style={styles.fieldGroupLabel}>Prefilled profile</Text>
        <Card>
          <Text style={styles.cardBody}>Name: {app.formName.firstName} {app.formName.lastName}</Text>
          <Text style={styles.cardBody}>Household size: {app.governmentProfile.householdSize || app.profile.householdSize}</Text>
          <Text style={styles.cardBody}>State: {app.governmentProfile.state || 'Not set'}</Text>
        </Card>
        <AppButton title="Review Draft Application" onPress={nav.back} />
      </View>
    </ScrollScreen>
  );
}

function SpendingReportScreen({ nav }: { nav: Navigation }) {
  return (
    <ScrollScreen>
      <AppHeader title="Spending Report" onBack={nav.back} />
      <View style={styles.formScreen}>
        <DonutPlaceholder large />
        {spendingCategories.map((category) => (
          <Card key={category.name}>
            <View style={rowStyles.spread}>
              <View style={rowStyles.row}>
                <View style={[styles.legendDot, { backgroundColor: category.color }]} />
                <Text style={styles.cardTitle}>{category.name}</Text>
              </View>
              <Text style={styles.cardTitle}>{category.amount}</Text>
            </View>
          </Card>
        ))}
        <AppButton title="View Transactions" onPress={() => nav.push('transactions')} />
      </View>
    </ScrollScreen>
  );
}

function TransactionsScreen({ nav }: { nav: Navigation }) {
  const [filter, setFilter] = useState<'All' | 'EBT' | 'Card'>('All');
  const filtered = filter === 'All' ? transactions : transactions.filter((transaction) => transaction.type === filter);

  return (
    <ScrollScreen>
      <AppHeader title="Transactions" onBack={nav.back} />
      <View style={styles.filterRow}>
        {(['All', 'EBT', 'Card'] as const).map((option) => (
          <Chip key={option} label={option} selected={filter === option} onPress={() => setFilter(option)} />
        ))}
      </View>
      <View style={styles.listStack}>
        {filtered.map((transaction) => (
          <Card key={transaction.id}>
            <View style={rowStyles.spread}>
              <View>
                <Text style={styles.cardTitle}>{transaction.store}</Text>
                <Text style={styles.miniMuted}>{transaction.section} - {transaction.category} - {transaction.type}</Text>
              </View>
              <Text style={styles.transactionAmount}>{transaction.amount}</Text>
            </View>
          </Card>
        ))}
      </View>
    </ScrollScreen>
  );
}

function ConnectAccountScreen({ nav }: { nav: Navigation }) {
  const app = useAppState();

  return (
    <Screen>
      <AppHeader title="Connect Account" onBack={nav.back} />
      <View style={styles.permissionScreen}>
        <View style={styles.bigIconCircle}>
          <HiveIcon name="card" size={38} color={HiveColors.green} />
        </View>
        <Text style={styles.permissionTitle}>Connect your EBT card</Text>
        <Text style={styles.permissionSubtitle}>This prototype toggles local connected state. No bank or EBT provider is contacted.</Text>
        <View style={styles.fullWidth}>
          <AppButton title={app.ebtConnected ? 'Disconnect EBT' : 'Connect EBT'} onPress={() => {
            app.setEbtConnected(!app.ebtConnected);
            nav.back();
          }} />
          <AppButton title="Maybe Later" variant="plain" onPress={nav.back} />
        </View>
      </View>
    </Screen>
  );
}

function SocialButton({
  title,
  source,
  disabled = false,
  onPress,
}: {
  title: string;
  source: number;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.socialButton, (pressed || disabled) && styles.pressed]}
    >
      <AppLogo source={source} size={22} />
      <Text style={styles.socialButtonText}>{title}</Text>
    </Pressable>
  );
}

function TextLinkLine({ label, action, onPress }: { label: string; action: string; onPress: () => void }) {
  return (
    <View style={styles.textLinkLine}>
      <Text style={styles.linkLabel}>{label}</Text>
      <Pressable onPress={onPress}>
        <Text style={styles.textLinkAction}>{action}</Text>
      </Pressable>
    </View>
  );
}

function HorizontalScroller({ children }: { children: ReactNode }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.horizontalScroller}>
      {children}
    </ScrollView>
  );
}

function DealCard({
  deal,
  onAdd,
  inCart,
  wide = false,
}: {
  deal: Deal;
  onAdd: () => void;
  inCart: boolean;
  wide?: boolean;
}) {
  return (
    <Card style={[styles.dealCard, wide && styles.dealCardWide]}>
      <View style={[styles.dealArt, { backgroundColor: deal.color }]}>
        <HiveIcon name="cart" size={28} color={HiveColors.white} />
      </View>
      <Text style={styles.dealTitle}>{deal.title}</Text>
      <Text style={styles.miniMuted}>{deal.store}</Text>
      <View style={rowStyles.row}>
        <Text style={styles.dealPrice}>{deal.price}</Text>
        <Text style={styles.dealOriginal}>{deal.originalPrice}</Text>
      </View>
      <Text style={styles.dealTag}>{deal.tag}</Text>
      <AppButton title={inCart ? 'Added' : 'Add'} variant={inCart ? 'secondary' : 'primary'} onPress={onAdd} style={styles.smallCardButton} />
    </Card>
  );
}

function VideoCard({ video, onPress, wide = false }: { video: VideoItem; onPress: () => void; wide?: boolean }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.videoCard, wide && styles.videoCardWide, pressed && styles.pressed]}>
      <View style={styles.videoThumb}>
        <HiveIcon name="play" size={24} color={HiveColors.white} />
      </View>
      <Text style={styles.videoTitle} numberOfLines={2}>{video.title}</Text>
      <View style={rowStyles.spread}>
        <Text style={styles.miniMuted}>{video.duration}</Text>
        <Chip label={video.category} tone="neutral" />
      </View>
    </Pressable>
  );
}

function ResourceRow({ resource, onPress }: { resource: ResourceItem; onPress: () => void }) {
  return (
    <View style={styles.resourceCard}>
      <View style={styles.resourceTag}>
        <Text style={styles.resourceTagText}>{resource.tag}</Text>
      </View>
      <Text style={styles.resourceName}>{resource.name}</Text>
      <View style={styles.resourceMetaRow}>
        <HiveIcon name="map" size={12} color={HiveColors.textSecondary} />
        <Text style={styles.miniMuted}>
          {resource.distance} · {resource.hours}
        </Text>
      </View>
      <Text style={styles.cardBody}>{resource.description}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`How to apply at ${resource.name}`}
        onPress={onPress}
        style={({ pressed }) => [styles.applyButton, pressed && styles.pressed]}>
        <Text style={styles.applyButtonText}>How to Apply</Text>
      </Pressable>
    </View>
  );
}

function DonutPlaceholder({ large = false }: { large?: boolean }) {
  return (
    <View style={[styles.donut, large && styles.donutLarge]}>
      <View style={[styles.donutInner, large && styles.donutInnerLarge]}>
        <Text style={styles.donutAmount}>$2,442.90</Text>
        <Text style={styles.donutLabel}>TOTAL SPENT</Text>
      </View>
    </View>
  );
}

/**
 * Penny paywall sheet. Deferred by product decision — kept intact so it can be
 * wired to a message limit once monetisation is agreed, rather than rebuilt.
 */
export function PaywallContent({ onClose }: { onClose: () => void }) {
  return (
    <View style={styles.sheetStack}>
      <PennyImage source={pennySource} size={78} />
      <Text style={uiText.subtitle}>You have used your free chats</Text>
      <Text style={[uiText.muted, styles.centerText]}>
        Upgrade to Penny Premium for unlimited AI conversations, ad-free experience, and priority resource matching.
      </Text>
      <Card style={styles.fullWidth}>
        {['Unlimited AI chats', 'Ad-free experience', 'Priority resource matching', 'Supports greener AI infrastructure'].map((benefit) => (
          <View key={benefit} style={styles.benefitRow}>
            <HiveIcon name="check" size={14} color={HiveColors.green} />
            <Text style={styles.cardBody}>{benefit}</Text>
          </View>
        ))}
      </Card>
      <AppButton title="Upgrade to Premium" onPress={onClose} style={styles.fullWidth} />
      <AppButton title="Maybe later" variant="plain" onPress={onClose} />
    </View>
  );
}

function AccountSection({ title }: { title: string }) {
  return <Text style={styles.accountSection}>{title}</Text>;
}

function Bullet({ text }: { text: string }) {
  return (
    <View style={styles.bulletRow}>
      <View style={styles.bullet} />
      <Text style={styles.cardBody}>{text}</Text>
    </View>
  );
}

function capitalize(value: string) {
  return value.slice(0, 1).toUpperCase() + value.slice(1);
}

const styles = StyleSheet.create({
  flexOne: {
    flex: 1,
  },
  flexSpacer: {
    flex: 1,
    minHeight: 24,
  },
  fullWidth: {
    width: '100%',
  },
  pressed: {
    opacity: 0.72,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  centeredCompact: {
    alignItems: 'center',
    gap: 8,
  },
  loadingText: {
    color: HiveColors.textSecondary,
    fontSize: 14,
    fontWeight: '600',
  },
  authShell: {
    flex: 1,
    paddingHorizontal: 24,
    paddingBottom: 52,
  },
  authCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 32,
  },
  welcomeTitle: {
    color: '#1F471F',
    fontSize: 34,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: 0,
  },
  authActions: {
    gap: 14,
  },
  formScreen: {
    gap: 16,
    paddingHorizontal: 24,
    paddingVertical: 24,
  },
  formStack: {
    gap: 14,
  },
  authTitle: {
    color: HiveColors.text,
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: 0,
  },
  authSubtitle: {
    color: HiveColors.textSecondary,
    fontSize: 15,
    lineHeight: 21,
  },
  authError: {
    color: HiveColors.danger,
    fontSize: 13,
    lineHeight: 18,
  },
  alignEnd: {
    alignSelf: 'flex-end',
  },
  greenLink: {
    color: HiveColors.green,
    fontSize: 14,
    fontWeight: '700',
  },
  socialButton: {
    minHeight: 56,
    borderRadius: Radii.lg,
    borderWidth: 1.5,
    borderColor: HiveColors.border,
    backgroundColor: HiveColors.white,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  socialButtonText: {
    color: HiveColors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  textLinkLine: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 4,
  },
  linkLabel: {
    color: HiveColors.textSecondary,
    fontSize: 15,
  },
  textLinkAction: {
    color: HiveColors.green,
    fontSize: 15,
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
  otpRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  otpBox: {
    flex: 1,
    aspectRatio: 0.82,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: HiveColors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  otpBoxActive: {
    borderColor: HiveColors.green,
  },
  otpDigit: {
    color: HiveColors.text,
    fontSize: 22,
    fontWeight: '800',
  },
  centerText: {
    textAlign: 'center',
  },
  onboardingContent: {
    flexGrow: 1,
  },
  onboardingTop: {
    gap: 14,
    paddingHorizontal: 24,
    paddingTop: 10,
    paddingBottom: 20,
  },
  onboardingBody: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingBottom: 24,
    gap: 12,
  },
  smallBackButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepLabel: {
    color: HiveColors.textSecondary,
    fontSize: 12,
    fontWeight: '800',
  },
  stepTitle: {
    color: HiveColors.text,
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: 0,
  },
  stepSubtitle: {
    color: HiveColors.textSecondary,
    fontSize: 15,
    lineHeight: 21,
    marginBottom: 4,
  },
  helperText: {
    color: HiveColors.textSecondary,
    fontSize: 13,
    textAlign: 'center',
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  photoPicker: {
    width: 150,
    height: 150,
    borderRadius: 75,
    alignSelf: 'center',
    backgroundColor: HiveColors.card,
    borderWidth: 2,
    borderColor: HiveColors.border,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginVertical: 24,
  },
  permissionScreen: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 42,
    gap: 14,
  },
  bigIconCircle: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: HiveColors.greenLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  permissionTitle: {
    color: HiveColors.text,
    fontSize: 26,
    fontWeight: '800',
    textAlign: 'center',
  },
  permissionSubtitle: {
    color: HiveColors.textSecondary,
    fontSize: 16,
    lineHeight: 22,
    textAlign: 'center',
  },
  tabShell: {
    flex: 1,
    backgroundColor: HiveColors.white,
  },
  tabContent: {
    flex: 1,
  },
  tabScreen: {
    flex: 1,
    backgroundColor: HiveColors.white,
  },
  bottomTabs: {
    minHeight: Platform.OS === 'ios' ? 76 : 66,
    paddingTop: 7,
    paddingHorizontal: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: HiveColors.border,
    flexDirection: 'row',
    backgroundColor: HiveColors.white,
  },
  tabButton: {
    flex: 1,
    alignItems: 'center',
    gap: 3,
  },
  tabLabel: {
    color: HiveColors.textSecondary,
    fontSize: 11,
    fontWeight: '600',
  },
  tabLabelSelected: {
    color: HiveColors.green,
    fontWeight: '800',
  },
  tourContent: {
    alignItems: 'center',
    gap: 14,
  },
  homeContent: {
    paddingBottom: FLOATING_TAB_BAR_HEIGHT + 110,
  },
  // Reference spacing: 20pt gutters, 16-22pt between blocks (HomeView.swift).
  homeBlock: {
    marginHorizontal: 20,
    marginBottom: 18,
  },
  // Centred screen title with the avatar trailing, as the reference tabs use.
  centeredHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 8,
  },
  headerSpacer: { width: 38 },
  centeredHeaderTitle: {
    flex: 1,
    textAlign: 'center',
    color: HiveColors.text,
    fontSize: 20,
    fontWeight: '700',
  },
  pageSectionTitle: {
    color: HiveColors.text,
    fontSize: 24,
    fontWeight: '700',
    paddingHorizontal: 20,
    paddingTop: 10,
    marginBottom: 12,
  },
  sectionInset: { marginHorizontal: 20, marginBottom: 16 },
  comingSoonList: { gap: 8, marginHorizontal: 20, marginBottom: 20 },
  headerIconButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: HiveColors.card,
  },
  financeContent: { paddingBottom: FLOATING_TAB_BAR_HEIGHT + 60 },
  pennyIntro: { alignItems: 'center', paddingHorizontal: 20, paddingTop: 28 },
  pennyThread: { paddingHorizontal: 20, paddingTop: 16, gap: 10 },
  pennyAvatarWrap: { position: 'relative', marginBottom: 14 },
  pennyOnlineDot: {
    position: 'absolute',
    right: 4,
    bottom: 6,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: HiveColors.green,
    borderWidth: 2,
    borderColor: HiveColors.white,
  },
  pennyGreeting: { color: HiveColors.text, fontSize: 32, fontWeight: '700' },
  pennyPrompt: { color: HiveColors.textSecondary, fontSize: 18, marginTop: 4 },
  pennySuggestions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 28,
    alignSelf: 'stretch',
  },
  // Dark cards, as the reference uses — high contrast against the white screen.
  suggestionCard: {
    flexBasis: '47%',
    flexGrow: 1,
    minHeight: 96,
    padding: 16,
    borderRadius: 16,
    backgroundColor: '#232629',
  },
  suggestionText: { color: HiveColors.white, fontSize: 15, fontWeight: '500', lineHeight: 21 },
  bubble: { maxWidth: '84%', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 16 },
  bubbleUser: { alignSelf: 'flex-end', backgroundColor: HiveColors.green },
  bubblePenny: { alignSelf: 'flex-start', backgroundColor: HiveColors.card },
  bubbleUserText: { color: HiveColors.white, fontSize: 15, lineHeight: 21 },
  bubblePennyText: { color: HiveColors.text, fontSize: 15, lineHeight: 21 },
  pennyError: { color: HiveColors.danger, fontSize: 13, textAlign: 'center', marginTop: 14 },
  pennyDisclaimer: {
    color: HiveColors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
    paddingHorizontal: 24,
    paddingBottom: 10,
  },
  pennyComposer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 16,
    marginBottom: FLOATING_TAB_BAR_HEIGHT + 46,
    paddingLeft: 18,
    paddingRight: 8,
    paddingVertical: 6,
    borderRadius: 28,
    backgroundColor: HiveColors.card,
  },
  pennyInput: { flex: 1, fontSize: 16, color: HiveColors.text, paddingVertical: 10 },
  pennySend: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: HiveColors.greenLight,
  },
  pennyNote: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  pennyNoteEmoji: { fontSize: 20 },
  pennyNoteText: { flex: 1, color: HiveColors.textSecondary, fontSize: 14, lineHeight: 20 },
  resourceCard: {
    marginHorizontal: 20,
    marginBottom: 14,
    padding: 16,
    borderRadius: Radii.lg,
    borderWidth: 1,
    borderColor: HiveColors.border,
    backgroundColor: HiveColors.white,
    gap: 8,
    alignItems: 'flex-start',
  },
  resourceTag: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: Radii.sm,
    backgroundColor: HiveColors.greenLight,
  },
  resourceTagText: { color: HiveColors.green, fontSize: 13, fontWeight: '700' },
  resourceMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  applyButton: {
    marginTop: 4,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: HiveColors.green,
  },
  applyButtonText: { color: HiveColors.white, fontSize: 15, fontWeight: '600' },
  homeSectionTitle: {
    color: HiveColors.text,
    fontSize: 17,
    fontWeight: '700',
    paddingHorizontal: 20,
    marginBottom: 10,
  },
  actionPair: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 20,
    marginTop: 10,
    marginBottom: 28,
  },
  homeHeader: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  homeGreeting: {
    color: HiveColors.text,
    fontSize: 24,
    fontWeight: '800',
  },
  homeSubGreeting: {
    color: HiveColors.textSecondary,
    fontSize: 14,
    marginTop: 2,
  },
  ebtConnected: {
    marginHorizontal: 20,
    marginBottom: 22,
    padding: 20,
    borderRadius: 18,
    gap: 4,
  },
  ebtMeta: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
  },
  ebtLight: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 13,
    fontWeight: '500',
  },
  ebtBalance: {
    color: HiveColors.white,
    fontSize: 38,
    fontWeight: '700',
  },
  ebtDetailsButton: {
    alignSelf: 'flex-end',
    marginTop: 10,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  ebtDetailsText: {
    color: HiveColors.white,
    fontSize: 13,
    fontWeight: '700',
  },
  warningCard: {
    marginHorizontal: 20,
    marginBottom: 16,
    backgroundColor: HiveColors.warningBg,
    borderWidth: 1,
    borderColor: '#F7C76D',
  },
  warningIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(240,138,20,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  warningTitle: {
    color: HiveColors.warningText,
    fontSize: 15,
    fontWeight: '800',
  },
  warningText: {
    color: HiveColors.warningText,
    fontSize: 13,
    marginTop: 2,
  },
  homeQuestion: {
    color: HiveColors.text,
    fontSize: 16,
    fontWeight: '800',
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  actionStack: {
    gap: 10,
    paddingHorizontal: 20,
    marginBottom: 4,
  },
  quickAction: {
    minHeight: 72,
    borderRadius: 16,
    backgroundColor: HiveColors.white,
    borderWidth: 1,
    borderColor: HiveColors.border,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 12,
  },
  quickIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickTitle: {
    color: HiveColors.text,
    fontSize: 15,
    fontWeight: '800',
  },
  quickSubtitle: {
    color: HiveColors.textSecondary,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 2,
  },
  horizontalScroller: {
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 4,
  },
  dealCard: {
    width: 158,
    gap: 6,
  },
  dealCardWide: {
    width: '100%',
  },
  dealArt: {
    height: 72,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dealTitle: {
    color: HiveColors.text,
    fontSize: 14,
    fontWeight: '800',
  },
  dealPrice: {
    color: HiveColors.text,
    fontSize: 15,
    fontWeight: '800',
    marginRight: 8,
  },
  dealOriginal: {
    color: HiveColors.textSecondary,
    fontSize: 12,
    textDecorationLine: 'line-through',
  },
  dealTag: {
    color: HiveColors.green,
    fontSize: 12,
    fontWeight: '700',
  },
  smallCardButton: {
    minHeight: 38,
    marginTop: 4,
  },
  videoCard: {
    width: 184,
    gap: 8,
    borderRadius: Radii.lg,
    backgroundColor: HiveColors.card,
    padding: 12,
  },
  videoCardWide: {
    width: '100%',
  },
  videoThumb: {
    height: 92,
    borderRadius: 12,
    backgroundColor: '#252529',
    alignItems: 'center',
    justifyContent: 'center',
  },
  videoTitle: {
    color: HiveColors.text,
    fontSize: 14,
    fontWeight: '800',
    minHeight: 36,
  },
  miniMuted: {
    color: HiveColors.textSecondary,
    fontSize: 12,
  },
  homePills: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 20,
    paddingTop: 18,
  },
  homePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 20,
    backgroundColor: HiveColors.white,
    borderWidth: 1,
    borderColor: HiveColors.border,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  homePillText: {
    color: HiveColors.text,
    fontSize: 12,
    fontWeight: '700',
  },
  weekHeader: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: HiveColors.border,
    gap: 10,
  },
  monthLabel: {
    color: HiveColors.text,
    fontSize: 15,
    fontWeight: '800',
  },
  weekRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  dayPill: {
    width: 42,
    minHeight: 58,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  dayPillSelected: {
    backgroundColor: HiveColors.green,
  },
  dayLetter: {
    color: HiveColors.textSecondary,
    fontSize: 11,
    fontWeight: '700',
  },
  dayNumber: {
    color: HiveColors.text,
    fontSize: 16,
    fontWeight: '800',
  },
  dayTextSelected: {
    color: HiveColors.white,
  },
  mealContent: {
    paddingBottom: 170,
  },
  selectedDayLabel: {
    color: HiveColors.text,
    fontSize: 18,
    fontWeight: '800',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  mealCard: {
    marginHorizontal: 20,
    marginBottom: 10,
    padding: 14,
    borderRadius: Radii.lg,
    borderWidth: 1,
    borderColor: HiveColors.border,
    backgroundColor: HiveColors.white,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  mealIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mealType: {
    color: HiveColors.textSecondary,
    fontSize: 12,
    fontWeight: '700',
  },
  mealName: {
    color: HiveColors.text,
    fontSize: 15,
    fontWeight: '800',
    marginTop: 2,
  },
  sideMargin: {
    marginHorizontal: 20,
  },
  mealBottomBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: HiveColors.border,
    backgroundColor: HiveColors.white,
    padding: 16,
    gap: 8,
  },
  cartPill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 18,
    backgroundColor: HiveColors.greenLight,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  cartPillText: {
    color: HiveColors.green,
    fontSize: 12,
    fontWeight: '700',
  },
  bottomButtonRow: {
    flexDirection: 'row',
    gap: 10,
  },
  pennyWelcome: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  onlineDot: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: HiveColors.green,
    borderWidth: 2,
    borderColor: HiveColors.white,
  },
  pennyTitle: {
    color: HiveColors.text,
    fontSize: 28,
    fontWeight: '800',
  },
  pennySubtitle: {
    color: HiveColors.textSecondary,
    fontSize: 16,
    marginTop: 4,
    marginBottom: 30,
  },
  suggestionGrid: {
    width: '100%',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  chatContent: {
    padding: 16,
    gap: 12,
  },
  chatBubble: {
    maxWidth: '82%',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  userBubble: {
    alignSelf: 'flex-end',
    backgroundColor: HiveColors.green,
  },
  pennyBubble: {
    alignSelf: 'flex-start',
    backgroundColor: HiveColors.card,
  },
  chatText: {
    color: HiveColors.text,
    fontSize: 15,
    lineHeight: 20,
  },
  userChatText: {
    color: HiveColors.white,
  },
  disclaimer: {
    color: HiveColors.textSecondary,
    fontSize: 11,
    lineHeight: 15,
    textAlign: 'center',
    paddingHorizontal: 32,
    paddingBottom: 10,
  },
  chatInputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  sendButton: {
    width: 44,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetStack: {
    alignItems: 'center',
    gap: 14,
  },
  benefitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  resourceContent: {
    paddingTop: 16,
    paddingBottom: 100,
  },
  benefitsBanner: {
    marginHorizontal: 20,
    backgroundColor: HiveColors.white,
    borderWidth: 1,
    borderColor: HiveColors.border,
  },
  infoIconLarge: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: HiveColors.greenLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  infoTitleStrong: {
    color: HiveColors.text,
    fontSize: 15,
    fontWeight: '800',
  },
  infoSubtitleText: {
    color: HiveColors.textSecondary,
    fontSize: 12,
    marginTop: 2,
  },
  shortButton: {
    minHeight: 38,
    paddingHorizontal: 14,
  },
  twoColumn: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  columnCard: {
    flex: 1,
    gap: 8,
  },
  resourceRow: {
    marginHorizontal: 20,
    marginBottom: 10,
    padding: 14,
    borderRadius: Radii.lg,
    backgroundColor: HiveColors.white,
    borderWidth: 1,
    borderColor: HiveColors.border,
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
  },
  resourceName: {
    color: HiveColors.text,
    fontSize: 15,
    fontWeight: '800',
    marginTop: 8,
    marginBottom: 3,
  },
  cardBody: {
    color: HiveColors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
  },
  spendingCard: {
    margin: 20,
    backgroundColor: HiveColors.white,
    borderWidth: 1,
    borderColor: HiveColors.border,
    gap: 16,
  },
  cardTitle: {
    color: HiveColors.text,
    fontSize: 15,
    fontWeight: '800',
  },
  spendingBody: {
    flexDirection: 'row',
    gap: 18,
    alignItems: 'center',
  },
  donut: {
    width: 112,
    height: 112,
    borderRadius: 56,
    borderWidth: 22,
    borderTopColor: HiveColors.greenDark,
    borderRightColor: HiveColors.green,
    borderBottomColor: '#9CD39D',
    borderLeftColor: HiveColors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  donutLarge: {
    width: 180,
    height: 180,
    borderRadius: 90,
    borderWidth: 30,
    alignSelf: 'center',
  },
  donutInner: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: HiveColors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  donutInnerLarge: {
    width: 120,
    height: 120,
    borderRadius: 60,
  },
  donutAmount: {
    color: HiveColors.text,
    fontSize: 12,
    fontWeight: '800',
    textAlign: 'center',
  },
  donutLabel: {
    color: HiveColors.textSecondary,
    fontSize: 8,
    fontWeight: '700',
  },
  spendingLegend: {
    flex: 1,
    gap: 6,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  legendName: {
    flex: 1,
    color: HiveColors.text,
    fontSize: 12,
  },
  legendAmount: {
    color: HiveColors.text,
    fontSize: 12,
    fontWeight: '700',
  },
  inlineAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  prescriptionCard: {
    width: 176,
    gap: 6,
  },
  offerLogo: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  offerInitial: {
    color: HiveColors.white,
    fontSize: 14,
    fontWeight: '800',
  },
  offerButton: {
    minHeight: 36,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  offerButtonText: {
    color: HiveColors.white,
    fontSize: 13,
    fontWeight: '800',
  },
  iconButtonPlain: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pantrySummary: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 18,
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  listStack: {
    gap: 10,
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  gridList: {
    gap: 12,
    padding: 20,
  },
  pantryItemCard: {
    gap: 12,
    backgroundColor: HiveColors.white,
    borderWidth: 1,
    borderColor: HiveColors.border,
  },
  rowIconTint: {
    width: 38,
    height: 38,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: HiveColors.greenLight,
    marginRight: 12,
  },
  cardActionRow: {
    flexDirection: 'row',
    gap: 10,
  },
  fieldGroupLabel: {
    color: HiveColors.text,
    fontSize: 14,
    fontWeight: '800',
    marginTop: 8,
  },
  accountHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 16,
  },
  accountName: {
    color: HiveColors.text,
    fontSize: 18,
    fontWeight: '800',
  },
  accountStats: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 20,
    paddingBottom: 18,
  },
  accountSection: {
    color: HiveColors.textSecondary,
    fontSize: 12,
    fontWeight: '800',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 4,
  },
  videoHero: {
    height: 220,
    backgroundColor: '#252529',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  bullet: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: HiveColors.green,
    marginTop: 7,
  },
  transactionAmount: {
    color: HiveColors.text,
    fontSize: 15,
    fontWeight: '800',
  },
});
