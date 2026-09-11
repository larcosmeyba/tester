// Signup onboarding flow, rebuilt to match the Xcode app's 6-step flow exactly.
//
// Copy, order, controls, and optional/required behavior below come from the
// iOS onboarding screenshots (the source of truth). The expo-router
// (onboarding) group renders one screen component per route; the standalone
// OnboardingScreen at the bottom keeps the legacy app-root 'onboarding' route
// working with the same iOS-accurate content until it is rewired.

import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { useRef, useState, type ReactNode } from 'react';
import { Image, PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  AppButton,
  CheckboxRow,
  Chip,
  HiveIcon,
  type HiveIconName,
  ProgressBar,
  Screen,
  ScrollScreen,
  SelectionRow,
} from '@/components/hive-ui';
import { HiveColors } from '@/constants/theme';
import { sharedStyles } from '@/features/app/app-shared';
import { refreshPushTokenIfPermitted, requestNotificationPermission } from '@/features/notifications/notification-service';
import { useAppState, type AppPreferences } from '@/state/app-state';
import { type Navigation } from '@/features/app/navigation-types';
import { BUDGET_MAX, BUDGET_MIN, BUDGET_STEP, DEFAULT_BUDGET_DOLLARS, formatBudgetDollars } from './onboarding-model';

const financeTopics: { title: string; subtitle: string; icon: HiveIconName }[] = [
  { title: 'How to Open a Roth IRA', subtitle: 'Learn the basics of tax-free retirement savings', icon: 'chart' },
  { title: 'How to Save for Kids College', subtitle: '529 plans, education savings, and strategies', icon: 'resources' },
  { title: 'How to Save for Retirement', subtitle: 'Build a plan for long-term financial security', icon: 'calendar' },
  { title: 'Budgeting & Money Management', subtitle: 'Track spending, reduce debt, and save more', icon: 'card' },
  { title: 'Building an Emergency Fund', subtitle: 'How to prepare for unexpected expenses', icon: 'shield' },
];

const resourceOptions: { title: string; subtitle: string; icon: HiveIconName }[] = [
  { title: 'Food Assistance', subtitle: 'Food pantries, free meals, and grocery programs', icon: 'fork' },
  { title: 'Healthcare', subtitle: 'How to apply to medicaid and other programs.', icon: 'heart' },
  { title: 'Utility Assistance', subtitle: 'Help with electric, gas, water, and phone bills', icon: 'bolt' },
  { title: 'Housing Help', subtitle: 'Housing assistance programs', icon: 'home' },
  { title: 'Childcare', subtitle: 'Daycare assistance and after-school programs', icon: 'child' },
  { title: 'Job', subtitle: 'Career programs, resume help, and places hiring.', icon: 'job' },
];

const benefitPrograms = ['SNAP', 'WIC', 'Medicaid', 'LIHEAP'];

export function formatBudgetDisplay(dollars: number): string {
  return formatBudgetDollars(dollars);
}

export async function pickProfileImage(): Promise<string | undefined> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 0.85,
  });
  if (!result.canceled && result.assets[0]) {
    return result.assets[0].uri;
  }
  return undefined;
}

export function OnboardingTopBar({ current, total, onBack }: { current: number; total: number; onBack?: () => void }) {
  return (
    <View style={styles.topBar}>
      <View style={styles.topRow}>
        {onBack ? (
          <Pressable onPress={onBack} style={styles.backButton} accessibilityRole="button" accessibilityLabel="Go back">
            <HiveIcon name="back" size={18} color={HiveColors.text} />
          </Pressable>
        ) : (
          <View style={styles.backButton} />
        )}
        <Text style={styles.stepLabel}>
          STEP {current} OF {total}
        </Text>
        <View style={styles.backButton} />
      </View>
      <ProgressBar current={current} total={total} />
    </View>
  );
}

export function OnboardingStepScreen({
  current,
  total,
  onBack,
  children,
}: {
  current: number;
  total: number;
  onBack?: () => void;
  children: ReactNode;
}) {
  return (
    <ScrollScreen contentStyle={styles.content}>
      <OnboardingTopBar current={current} total={total} onBack={onBack} />
      <View style={styles.body}>{children}</View>
    </ScrollScreen>
  );
}

export function ComingSoonBadge() {
  return (
    <View style={styles.comingSoonBadge} accessibilityLabel="Coming soon">
      {/* No clock glyph in the HiveIcon set; the clock emoji matches the iOS badge. */}
      <Text style={styles.comingSoonIcon}>🕒</Text>
      <Text style={styles.comingSoonText}>Coming Soon</Text>
    </View>
  );
}

const SLIDER_TICKS = 11;

export function BudgetSlider({ value, onChange }: { value: number; onChange: (dollars: number) => void }) {
  const [trackWidth, setTrackWidth] = useState(0);

  const setFromX = (x: number) => {
    if (trackWidth <= 0) {
      return;
    }
    const fraction = Math.min(1, Math.max(0, x / trackWidth));
    const raw = BUDGET_MIN + fraction * (BUDGET_MAX - BUDGET_MIN);
    onChange(Math.round(raw / BUDGET_STEP) * BUDGET_STEP);
  };

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (event) => setFromX(event.nativeEvent.locationX),
      onPanResponderMove: (event) => setFromX(event.nativeEvent.locationX),
    }),
  ).current;

  const fraction = (value - BUDGET_MIN) / (BUDGET_MAX - BUDGET_MIN);
  const thumbOffset = { left: `${Math.min(100, Math.max(0, fraction * 100))}%` } as const;

  return (
    <View style={styles.sliderBlock}>
      <View
        style={styles.sliderTrack}
        onLayout={(event) => setTrackWidth(event.nativeEvent.layout.width)}
        {...pan.panHandlers}
        accessibilityRole="adjustable"
        accessibilityLabel="Weekly grocery budget"
        accessibilityValue={{ text: `${formatBudgetDisplay(value)} per week` }}>
        <View style={[styles.sliderFill, { width: `${fraction * 100}%` }]} />
        {Array.from({ length: SLIDER_TICKS }).map((_, index) => (
          <View
            key={index}
            style={[styles.sliderTick, { left: `${(index / (SLIDER_TICKS - 1)) * 100}%` }]}
            pointerEvents="none"
          />
        ))}
        <View style={[styles.sliderThumb, thumbOffset]} pointerEvents="none" />
      </View>
      <View style={styles.sliderLabels}>
        <Text style={styles.sliderLabel}>$25</Text>
        <Text style={styles.sliderLabel}>$300+</Text>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Step 1 — grocery budget
// ---------------------------------------------------------------------------

export function BudgetStep({
  value,
  onChange,
  onNext,
}: {
  value: number;
  onChange: (dollars: number) => void;
  onNext: () => void;
}) {
  return (
    <OnboardingStepScreen current={1} total={6}>
      <Text style={styles.stepTitle}>What's your weekly grocery budget?</Text>
      <Text style={styles.stepSubtitle}>This helps us plan meals that fit around your budget.</Text>
      <View style={styles.amountCard}>
        <Text style={styles.amountText}>{formatBudgetDisplay(value)}</Text>
        <Text style={styles.amountLabel}>per week</Text>
      </View>
      <BudgetSlider value={value} onChange={onChange} />
      <View style={styles.buttonSpacer} />
      <AppButton title="Continue" onPress={onNext} />
    </OnboardingStepScreen>
  );
}

// ---------------------------------------------------------------------------
// Step 2 — bank / EBT connection (coming soon)
// ---------------------------------------------------------------------------

export function ConnectEbtStep({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  return (
    <OnboardingStepScreen current={2} total={6} onBack={onBack}>
      <Text style={styles.stepTitle}>Connect your bank or EBT Card</Text>
      <ComingSoonBadge />
      <Text style={styles.stepSubtitle}>
        We're building EBT card and bank integration to help you track your balance and spending automatically. This feature
        is launching soon!
      </Text>
      <View style={styles.disabledCard}>
        <View style={styles.disabledRow}>
          <View style={styles.disabledIcon}>
            <HiveIcon name="card" size={22} color={HiveColors.textSecondary} />
          </View>
          <View style={styles.flexOne}>
            <Text style={styles.disabledTitle}>EBT Card Connection</Text>
            <Text style={styles.disabledSubtitle}>Track balance, deposits & spending</Text>
          </View>
        </View>
        <View style={styles.disabledRow}>
          <View style={styles.disabledIcon}>
            {/* No bank-building glyph in the HiveIcon set; card glyph is the closest available. */}
            <HiveIcon name="finance" size={22} color={HiveColors.textSecondary} />
          </View>
          <View style={styles.flexOne}>
            <Text style={styles.disabledTitle}>Bank Account Link</Text>
            <Text style={styles.disabledSubtitle}>Powered by Plaid — securely encrypted</Text>
          </View>
        </View>
      </View>
      <Text style={styles.centerNote}>We'll notify you when this feature is ready.</Text>
      <View style={styles.buttonSpacer} />
      <AppButton title="Continue" onPress={onNext} />
    </OnboardingStepScreen>
  );
}

// ---------------------------------------------------------------------------
// Step 3 — finance topics (coming soon)
// ---------------------------------------------------------------------------

export function FinanceTopicsStep({
  selected,
  onToggle,
  onNext,
  onBack,
}: {
  selected: string[];
  onToggle: (topic: string) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  return (
    <OnboardingStepScreen current={3} total={6} onBack={onBack}>
      <Text style={styles.stepTitle}>What financial help do you want to learn?</Text>
      <ComingSoonBadge />
      <Text style={styles.stepSubtitle}>
        This feature is launching soon! Tell us what you're interested in and we'll personalize your experience when it's
        ready.
      </Text>
      {financeTopics.map((topic) => (
        <CheckboxRow
          key={topic.title}
          title={topic.title}
          subtitle={topic.subtitle}
          icon={topic.icon}
          selected={selected.includes(topic.title)}
          onPress={() => onToggle(topic.title)}
        />
      ))}
      <Text style={styles.footnote}>You can always change this later in settings</Text>
      <AppButton title="Next" onPress={onNext} />
    </OnboardingStepScreen>
  );
}

// ---------------------------------------------------------------------------
// Step 1 — resources
// ---------------------------------------------------------------------------

export function ResourcesStep({
  selected,
  onToggle,
  onNext,
  onBack,
}: {
  selected: string[];
  onToggle: (resource: string) => void;
  onNext: () => void;
  onBack?: () => void;
}) {
  return (
    <OnboardingStepScreen current={1} total={3} onBack={onBack}>
      <Text style={styles.stepTitle}>What kind of help do you need?</Text>
      <Text style={styles.stepSubtitle}>
        Select all that apply — food, healthcare, bills, and more. We&apos;ll match you with help near you.
      </Text>
      {resourceOptions.map((resource) => (
        <CheckboxRow
          key={resource.title}
          title={resource.title}
          subtitle={resource.subtitle}
          icon={resource.icon}
          selected={selected.includes(resource.title)}
          onPress={() => onToggle(resource.title)}
        />
      ))}
      <Text style={styles.footnote}>You can always change this later in settings</Text>
      <AppButton title="Next" onPress={onNext} />
    </OnboardingStepScreen>
  );
}

// ---------------------------------------------------------------------------
// Step 2 — benefits help
// ---------------------------------------------------------------------------

export function BenefitsStep({
  value,
  onChange,
  onNext,
  onBack,
}: {
  value: boolean | null;
  onChange: (value: boolean) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  return (
    <OnboardingStepScreen current={2} total={3} onBack={onBack}>
      <Text style={styles.stepTitle}>Would you like help applying for benefits?</Text>
      <Text style={styles.stepSubtitle}>
        Penny prepares your paperwork for food, healthcare, and energy assistance — you just review and sign.
      </Text>
      <View style={sharedStyles.chipRow}>
        {benefitPrograms.map((program) => (
          <Chip key={program} label={program} tone="green" />
        ))}
      </View>
      <SelectionRow
        title="Yes, I'd like help with applications"
        selected={value === true}
        onPress={() => onChange(true)}
      />
      <SelectionRow title="I'll explore this on my own" selected={value === false} onPress={() => onChange(false)} />
      <Text style={styles.footnote}>You can always find these programs on the Home tab.</Text>
      <AppButton title="Next" onPress={onNext} />
    </OnboardingStepScreen>
  );
}

// ---------------------------------------------------------------------------
// Step 3 — profile photo
// ---------------------------------------------------------------------------

export function ProfilePhotoStep({
  imageUri,
  onPick,
  onNext,
  onBack,
}: {
  imageUri?: string;
  onPick: () => void;
  onNext: () => void;
  onBack: () => void;
}) {
  return (
    <OnboardingStepScreen current={3} total={3} onBack={onBack}>
      <Text style={styles.stepTitle}>Upload a Profile Picture</Text>
      <Text style={styles.stepSubtitle}>Add a photo so Penny can greet you personally.</Text>
      <Pressable
        onPress={onPick}
        style={styles.photoPicker}
        accessibilityRole="button"
        accessibilityLabel="Choose profile photo">
        {imageUri ? (
          <Image source={{ uri: imageUri }} style={styles.photoImage} />
        ) : (
          <>
            <HiveIcon name="camera" size={38} color={HiveColors.green} />
            <Text style={styles.photoHint}>Tap to choose</Text>
          </>
        )}
      </Pressable>
      <View style={styles.buttonSpacer} />
      <AppButton title="Continue" onPress={onNext} />
      <AppButton title="Skip for now" variant="plain" onPress={onNext} />
    </OnboardingStepScreen>
  );
}

// ---------------------------------------------------------------------------
// All-set screen (after step 6, before permissions)
// ---------------------------------------------------------------------------

export function AllSetStep({ onNext }: { onNext: () => void }) {
  return (
    <Screen>
      <View style={sharedStyles.permissionScreen}>
        <View style={sharedStyles.bigIconCircle}>
          <HiveIcon name="check" size={44} color={HiveColors.green} />
        </View>
        <Text style={sharedStyles.permissionTitle}>You're all set!</Text>
        <Text style={sharedStyles.permissionSubtitle}>Penny has everything needed to personalize your experience.</Text>
        <View style={styles.flexSpacer} />
        <View style={sharedStyles.fullWidth}>
          <AppButton title="Continue" onPress={onNext} />
        </View>
      </View>
    </Screen>
  );
}

// ---------------------------------------------------------------------------
// Permission prompts (notifications -> location)
// ---------------------------------------------------------------------------

export function PermissionPrompt({
  icon,
  iconCircleColor,
  title,
  subtitle,
  primaryLabel,
  secondaryLabel,
  onPrimary,
  onSecondary,
  busy = false,
}: {
  icon: HiveIconName;
  iconCircleColor: string;
  title: string;
  subtitle: string;
  primaryLabel: string;
  secondaryLabel: string;
  onPrimary: () => void;
  onSecondary: () => void;
  busy?: boolean;
}) {
  return (
    <Screen>
      <View style={sharedStyles.permissionScreen}>
        <View style={[sharedStyles.bigIconCircle, { backgroundColor: iconCircleColor }]}>
          <HiveIcon name={icon} size={38} color={HiveColors.green} />
        </View>
        <Text style={sharedStyles.permissionTitle}>{title}</Text>
        <Text style={sharedStyles.permissionSubtitle}>{subtitle}</Text>
        <View style={styles.flexSpacer} />
        <View style={sharedStyles.fullWidth}>
          <AppButton title={busy ? 'Saving…' : primaryLabel} onPress={onPrimary} disabled={busy} />
          <AppButton title={secondaryLabel} variant="plain" onPress={onSecondary} disabled={busy} />
        </View>
      </View>
    </Screen>
  );
}

export function NotificationsPermissionStep({
  onPrimary,
  onSecondary,
  busy,
}: {
  onPrimary: () => void;
  onSecondary: () => void;
  busy: boolean;
}) {
  return (
    <PermissionPrompt
      icon="bell"
      iconCircleColor={HiveColors.cream}
      title="Stay in the loop"
      subtitle="Get renewal reminders and alerts about benefits you may qualify for."
      primaryLabel="Turn on notifications"
      secondaryLabel="Maybe later"
      onPrimary={onPrimary}
      onSecondary={onSecondary}
      busy={busy}
    />
  );
}

export function LocationPermissionStep({
  message,
  onPrimary,
  onSecondary,
  busy,
}: {
  message: string;
  onPrimary: () => void;
  onSecondary: () => void;
  busy: boolean;
}) {
  return (
    <PermissionPrompt
      // No navigation-arrow glyph in the HiveIcon set; 'send' is the closest available.
      icon="send"
      iconCircleColor={HiveColors.greenLight}
      title="Find help near you"
      subtitle={message || 'Allow location access so we can show food banks, SNAP offices, and resources close to you.'}
      primaryLabel="Allow location"
      secondaryLabel="Not now"
      onPrimary={onPrimary}
      onSecondary={onSecondary}
      busy={busy}
    />
  );
}

// ---------------------------------------------------------------------------
// Standalone OnboardingScreen — legacy app-root 'onboarding' route.
//
// Same iOS-accurate content as the route group above, with internal step state
// and the legacy Navigation API, until that route is rewired to the group.
// ---------------------------------------------------------------------------

export function OnboardingScreen({ nav }: { nav: Navigation }) {
  const app = useAppState();
  const [step, setStep] = useState(0);
  const [budgetDollars] = useState(DEFAULT_BUDGET_DOLLARS);
  const [selectedFinanceTopics] = useState<string[]>(app.preferences.preferredFinanceTopics);
  const [selectedResources, setSelectedResources] = useState<string[]>(app.preferences.preferredResources);
  const [wantsGovAssistance, setWantsGovAssistance] = useState<boolean | null>(app.preferences.wantsGovAssistance);
  const [profileImageUri, setProfileImageUri] = useState(app.profile.profileImageUri);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [isFinishing, setIsFinishing] = useState(false);
  const [finishError, setFinishError] = useState('');

  function toggleList(value: string, list: string[], setList: (items: string[]) => void) {
    setList(list.includes(value) ? list.filter((item) => item !== value) : [...list, value]);
  }

  async function pickImage() {
    const uri = await pickProfileImage();
    if (uri) {
      setProfileImageUri(uri);
    }
  }

  async function requestNotifications() {
    try {
      const granted = await requestNotificationPermission();
      setNotificationsEnabled(granted);
      setStatusMessage(
        granted ? 'Notification permission enabled.' : 'Notifications skipped. You can enable them later.',
      );
    } catch {
      setNotificationsEnabled(false);
      setStatusMessage('Push notifications are unavailable in Expo Go. You can enable them in a development build.');
    }
    setStep(4);
  }

  async function requestLocationAndFinish() {
    const result = await Location.requestForegroundPermissionsAsync();
    setStatusMessage(result.granted ? 'Location permission enabled.' : 'Location skipped. You can enable it later.');
    await finish();
  }

  async function finish() {
    if (isFinishing) {
      return;
    }
    setIsFinishing(true);
    setFinishError('');
    try {
      const preferences: AppPreferences = {
        weeklyBudget: formatBudgetDollars(budgetDollars),
        preferredFinanceTopics: selectedFinanceTopics,
        preferredResources: selectedResources,
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
      nav.reset('main');
    } catch (error) {
      setFinishError(error instanceof Error ? error.message : 'Unable to save onboarding.');
    } finally {
      setIsFinishing(false);
    }
  }

  const back = () => setStep((current) => Math.max(0, current - 1));

  // Benefits-first: resources -> benefits -> profile photo, then all-set and
  // the permission prompts. The shelved budget/EBT/finance-topic steps keep
  // their components and saved defaults, but are no longer asked.
  if (step === 0) {
    return (
      <ResourcesStep
        selected={selectedResources}
        onToggle={(resource) => toggleList(resource, selectedResources, setSelectedResources)}
        onNext={() => setStep(1)}
      />
    );
  }
  if (step === 1) {
    return (
      <BenefitsStep
        value={wantsGovAssistance}
        onChange={setWantsGovAssistance}
        onNext={() => setStep(2)}
        onBack={back}
      />
    );
  }
  if (step === 2) {
    return <ProfilePhotoStep imageUri={profileImageUri} onPick={() => void pickImage()} onNext={() => setStep(3)} onBack={back} />;
  }
  if (step === 3) {
    return <AllSetStep onNext={() => setStep(4)} />;
  }
  if (step === 4) {
    return (
      <NotificationsPermissionStep
        onPrimary={() => void requestNotifications()}
        onSecondary={() => setStep(5)}
        busy={isFinishing}
      />
    );
  }
  return (
    <LocationPermissionStep
      message={finishError || statusMessage}
      onPrimary={() => void requestLocationAndFinish()}
      onSecondary={() => void finish()}
      busy={isFinishing}
    />
  );
}

const styles = StyleSheet.create({
  amountCard: {
    backgroundColor: HiveColors.greenLight,
    borderRadius: 24,
    paddingVertical: 36,
    alignItems: 'center',
    gap: 4,
    marginTop: 8,
  },
  amountLabel: {
    color: HiveColors.textSecondary,
    fontSize: 16,
  },
  amountText: {
    color: HiveColors.green,
    fontSize: 56,
    fontWeight: '800',
  },
  backButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingBottom: 24,
    gap: 14,
  },
  buttonSpacer: {
    height: 8,
  },
  centerNote: {
    color: HiveColors.textSecondary,
    fontSize: 15,
    textAlign: 'center',
    marginTop: 4,
  },
  comingSoonBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: HiveColors.cream,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    gap: 6,
  },
  comingSoonIcon: {
    fontSize: 14,
  },
  comingSoonText: {
    color: HiveColors.orange,
    fontSize: 13,
    fontWeight: '800',
  },
  content: {
    flexGrow: 1,
  },
  disabledCard: {
    backgroundColor: HiveColors.white,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: HiveColors.border,
    padding: 8,
    opacity: 0.5,
  },
  disabledIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: HiveColors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabledRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 12,
  },
  disabledSubtitle: {
    color: HiveColors.textSecondary,
    fontSize: 13,
    marginTop: 2,
  },
  disabledTitle: {
    color: HiveColors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  flexOne: {
    flex: 1,
  },
  flexSpacer: {
    flex: 1,
    minHeight: 24,
  },
  footnote: {
    color: HiveColors.textSecondary,
    fontSize: 14,
    marginTop: 6,
  },
  photoHint: {
    color: HiveColors.textSecondary,
    fontSize: 14,
  },
  photoImage: {
    width: 146,
    height: 146,
    borderRadius: 73,
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
    overflow: 'hidden',
  },
  sliderBlock: {
    marginTop: 12,
  },
  sliderFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: HiveColors.green,
    borderRadius: 999,
  },
  sliderLabel: {
    color: HiveColors.textSecondary,
    fontSize: 14,
  },
  sliderLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 18,
  },
  sliderThumb: {
    position: 'absolute',
    top: -11,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: HiveColors.white,
    marginLeft: -14,
    shadowColor: HiveColors.text,
    shadowOpacity: 0.18,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  sliderTick: {
    position: 'absolute',
    top: 13,
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: HiveColors.placeholder,
    marginLeft: -2,
    opacity: 0.6,
  },
  sliderTrack: {
    height: 6,
    borderRadius: 999,
    backgroundColor: HiveColors.border,
  },
  stepLabel: {
    color: HiveColors.green,
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  stepSubtitle: {
    color: HiveColors.textSecondary,
    fontSize: 15,
    lineHeight: 21,
  },
  stepTitle: {
    color: HiveColors.text,
    fontSize: 28,
    fontWeight: '800',
  },
  topBar: {
    gap: 12,
    paddingHorizontal: 24,
    paddingTop: 10,
    paddingBottom: 18,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
});
