// Signup onboarding flow (Sign Up / Login / Onboarding v2).
//
// Step order: 7 questionnaire steps (budget -> finance help -> resources ->
// primary goal -> household size -> household income -> profile photo), then
// the native push permission prompt, the location explainer + native prompt
// (ZIP fallback when denied), the email consent, the phone-call consent, and
// the all-set screen.
//
// Copy comes from the screenshot designs. Each questionnaire step saves its
// answers (saveQuestionnaire) and a step marker (saveOnboardingStep) as it
// completes, so an interrupted onboarding resumes at
// `onboardingState.currentStep` via `resumeIndexForStepKey`.
//
// The expo-router (onboarding) group is not part of the app shell's flow;
// AppRoot renders the standalone OnboardingScreen below.

import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { useState, type ReactNode } from 'react';
import { Image, Linking, PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';
import { PRIVACY_URL, TERMS_URL } from '@/constants/legal';
import {
  AppButton,
  AppTextField,
  CheckboxRow,
  HiveIcon,
  type HiveIconName,
  Screen,
  ScrollScreen,
  SelectionRow,
} from '@/components/hive-ui';
import { HiveColors } from '@/constants/theme';
import { sharedStyles } from '@/features/app/app-shared';
import { requestAndRegisterPushToken } from '@/features/notifications/notification-service';
import { useAppState, type AppPreferences } from '@/state/app-state';
import { type Navigation } from '@/features/app/navigation-types';
import {
  BUDGET_MAX,
  BUDGET_MIN,
  BUDGET_STEP,
  DEFAULT_BUDGET_DOLLARS,
  HOUSEHOLD_SIZE_OPTIONS,
  INCOME_BRACKET_OPTIONS,
  PRIMARY_GOAL_APPLY_BENEFITS,
  PRIMARY_GOAL_BUDGET_MEALS,
  formatBudgetDollars,
  parseBudgetDollars,
  resumeIndexForStepKey,
} from './onboarding-model';
import {
  saveLocationFallback,
  saveOnboardingStep,
  saveQuestionnaire,
  updateCommunicationConsents,
} from './onboarding-repository';
import { updateProfile as updateProfileRemote } from '@/features/profile/profile-repository';

const financeTopics: { title: string; subtitle: string; icon: HiveIconName }[] = [
  { title: 'How to Open a Roth IRA', subtitle: 'Learn the basics of tax-free retirement savings', icon: 'chart' },
  { title: 'How to Save for Kids College', subtitle: '529 plans, education savings, and strategies', icon: 'resources' },
  { title: 'How to Save for Retirement', subtitle: 'Build a plan for long-term financial security', icon: 'calendar' },
  { title: 'Budgeting & Money Management', subtitle: 'Track spending, reduce debt, and save more', icon: 'card' },
  { title: 'Building an Emergency Fund', subtitle: 'How to prepare for unexpected expenses', icon: 'shield' },
];

const resourceOptions: { title: string; subtitle: string; icon: HiveIconName }[] = [
  { title: 'Food Assistance', subtitle: 'Food pantries, free meals, and grocery programs', icon: 'fork' },
  { title: 'Housing Help', subtitle: 'Housing assistance programs', icon: 'home' },
  { title: 'Healthcare', subtitle: 'How to apply to medicaid and other programs.', icon: 'heart' },
  { title: 'Utility Assistance', subtitle: 'Help with electric, gas, water, and phone bills', icon: 'bolt' },
  { title: 'Job', subtitle: 'Career programs, resume help, and places hiring.', icon: 'job' },
  { title: 'Childcare', subtitle: 'Daycare assistance and after-school programs', icon: 'child' },
];

const primaryGoals: { code: string; title: string }[] = [
  { code: PRIMARY_GOAL_APPLY_BENEFITS, title: 'Apply for Benefits' },
  { code: PRIMARY_GOAL_BUDGET_MEALS, title: 'Create budget-friendly meals for myself or my family' },
];

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
      </View>
      <View style={styles.pills} accessibilityLabel={`Step ${current} of ${total}`}>
        {Array.from({ length: total }).map((_, index) => (
          <View key={index} style={[styles.pill, index < current && styles.pillDone]} />
        ))}
      </View>
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
  // The HiveIcon set has no clock glyph, so the badge is text-only rather
  // than inventing an icon.
  return (
    <View style={styles.comingSoonBadge} accessibilityLabel="Coming soon">
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

  const [pan] = useState(() =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (event) => setFromX(event.nativeEvent.locationX),
      onPanResponderMove: (event) => setFromX(event.nativeEvent.locationX),
    }),
  );

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

function StepError({ message }: { message: string }) {
  if (!message) {
    return null;
  }
  return <Text style={sharedStyles.authError}>{message}</Text>;
}

// ---------------------------------------------------------------------------
// Step 1 — grocery budget
// ---------------------------------------------------------------------------

export function BudgetStep({
  value,
  onChange,
  onNext,
  busy,
  error,
}: {
  value: number;
  onChange: (dollars: number) => void;
  onNext: () => void;
  busy: boolean;
  error: string;
}) {
  return (
    <OnboardingStepScreen current={1} total={7}>
      <Text style={styles.stepTitle}>What&apos;s your weekly grocery budget?</Text>
      <Text style={styles.stepSubtitle}>This helps us plan meals that fit around your budget.</Text>
      <View style={styles.amountCard}>
        <Text style={styles.amountText}>{formatBudgetDisplay(value)}</Text>
        <Text style={styles.amountLabel}>per week</Text>
      </View>
      <BudgetSlider value={value} onChange={onChange} />
      <View style={styles.buttonSpacer} />
      <StepError message={error} />
      <AppButton title={busy ? 'Saving…' : 'Continue'} onPress={onNext} disabled={busy} />
    </OnboardingStepScreen>
  );
}

// ---------------------------------------------------------------------------
// Step 2 — finance help (coming soon)
// ---------------------------------------------------------------------------

export function FinanceHelpStep({
  selected,
  onToggle,
  onNext,
  onBack,
  busy,
  error,
}: {
  selected: string[];
  onToggle: (topic: string) => void;
  onNext: () => void;
  onBack: () => void;
  busy: boolean;
  error: string;
}) {
  return (
    <OnboardingStepScreen current={2} total={7} onBack={onBack}>
      <Text style={styles.stepTitle}>What financial help do you want to learn?</Text>
      <ComingSoonBadge />
      <Text style={styles.stepSubtitle}>
        This feature is launching soon! Tell us what you&apos;re interested in and we&apos;ll personalize your
        experience when it&apos;s ready.
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
      <StepError message={error} />
      <AppButton title={busy ? 'Saving…' : 'Next'} onPress={onNext} disabled={busy || selected.length === 0} />
    </OnboardingStepScreen>
  );
}

// ---------------------------------------------------------------------------
// Step 3 — resources
// ---------------------------------------------------------------------------

export function ResourcesStep({
  selected,
  onToggle,
  onNext,
  onBack,
  busy,
  error,
}: {
  selected: string[];
  onToggle: (resource: string) => void;
  onNext: () => void;
  onBack: () => void;
  busy: boolean;
  error: string;
}) {
  return (
    <OnboardingStepScreen current={3} total={7} onBack={onBack}>
      <Text style={styles.stepTitle}>What resources do you need?</Text>
      <Text style={styles.stepSubtitle}>Select all that apply. We&apos;ll match you with resources near you.</Text>
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
      <StepError message={error} />
      <AppButton title={busy ? 'Saving…' : 'Next'} onPress={onNext} disabled={busy || selected.length === 0} />
    </OnboardingStepScreen>
  );
}

// ---------------------------------------------------------------------------
// Step 4 — primary goal (single-select)
// ---------------------------------------------------------------------------

export function PrimaryGoalStep({
  selected,
  onSelect,
  onNext,
  onBack,
  busy,
  error,
}: {
  selected: string | null;
  onSelect: (code: string) => void;
  onNext: () => void;
  onBack: () => void;
  busy: boolean;
  error: string;
}) {
  return (
    <OnboardingStepScreen current={4} total={7} onBack={onBack}>
      <Text style={styles.stepTitle}>What brings you to Help The Hive today?</Text>
      <Text style={styles.stepSubtitle}>This helps Penny personalize your experience.</Text>
      {primaryGoals.map((goal) => (
        <SelectionRow
          key={goal.code}
          title={goal.title}
          selected={selected === goal.code}
          onPress={() => onSelect(goal.code)}
        />
      ))}
      <Text style={styles.footnote}>You can do both anytime — this just helps us get you started.</Text>
      <StepError message={error} />
      <AppButton title={busy ? 'Saving…' : 'Next'} onPress={onNext} disabled={busy || !selected} />
    </OnboardingStepScreen>
  );
}

// ---------------------------------------------------------------------------
// Step 5 — household size (single-select tiles)
// ---------------------------------------------------------------------------

export function HouseholdSizeStep({
  selected,
  onSelect,
  onNext,
  onBack,
  busy,
  error,
}: {
  selected: string | null;
  onSelect: (size: string) => void;
  onNext: () => void;
  onBack: () => void;
  busy: boolean;
  error: string;
}) {
  return (
    <OnboardingStepScreen current={5} total={7} onBack={onBack}>
      <Text style={styles.stepTitle}>How many people are in your household?</Text>
      <Text style={styles.stepSubtitle}>Include yourself and everyone who lives and shares meals with you.</Text>
      <View style={styles.tileGrid}>
        {HOUSEHOLD_SIZE_OPTIONS.map((option) => {
          const isSelected = selected === option;
          return (
            <Pressable
              key={option}
              onPress={() => onSelect(option)}
              style={[styles.tile, isSelected && styles.tileSelected]}
              accessibilityRole="radio"
              accessibilityState={{ selected: isSelected }}>
              <Text style={[styles.tileText, isSelected && styles.tileTextSelected]}>{option}</Text>
            </Pressable>
          );
        })}
      </View>
      <Text style={styles.footnote}>This helps us match you with benefits and portion meals correctly.</Text>
      <StepError message={error} />
      <AppButton title={busy ? 'Saving…' : 'Next'} onPress={onNext} disabled={busy || !selected} />
    </OnboardingStepScreen>
  );
}

// ---------------------------------------------------------------------------
// Step 6 — household monthly income (single-select radios)
// ---------------------------------------------------------------------------

export function IncomeStep({
  selected,
  onSelect,
  onNext,
  onBack,
  busy,
  error,
}: {
  selected: string | null;
  onSelect: (bracket: string) => void;
  onNext: () => void;
  onBack: () => void;
  busy: boolean;
  error: string;
}) {
  return (
    <OnboardingStepScreen current={6} total={7} onBack={onBack}>
      <Text style={styles.stepTitle}>What is your household&apos;s approximate monthly income before taxes?</Text>
      <Text style={styles.stepSubtitle}>
        Together with household size, this helps us find benefits you may qualify for.
      </Text>
      {INCOME_BRACKET_OPTIONS.map((bracket) => (
        <SelectionRow
          key={bracket}
          title={bracket}
          selected={selected === bracket}
          onPress={() => onSelect(bracket)}
        />
      ))}
      <Text style={styles.footnote}>Your answer stays private and is never shared without your review.</Text>
      <StepError message={error} />
      <AppButton title={busy ? 'Saving…' : 'Next'} onPress={onNext} disabled={busy || !selected} />
    </OnboardingStepScreen>
  );
}

// ---------------------------------------------------------------------------
// Step 7 — profile photo (optional)
// ---------------------------------------------------------------------------

export function ProfilePhotoStep({
  imageUri,
  onPick,
  onNext,
  onBack,
  busy,
  error,
}: {
  imageUri?: string;
  onPick: () => void;
  onNext: () => void;
  onBack: () => void;
  busy: boolean;
  error: string;
}) {
  return (
    <OnboardingStepScreen current={7} total={7} onBack={onBack}>
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
      <StepError message={error} />
      <AppButton title={busy ? 'Saving…' : 'Continue'} onPress={onNext} disabled={busy} />
      <AppButton title="Skip for now" variant="plain" onPress={onNext} disabled={busy} />
    </OnboardingStepScreen>
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

export function PushPermissionStep({
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
      subtitle="Get reminders for your meal plan and budget — plus new benefits you may qualify for."
      primaryLabel="Turn on notifications"
      secondaryLabel="Maybe later"
      onPrimary={onPrimary}
      onSecondary={onSecondary}
      busy={busy}
    />
  );
}

export function LocationExplainerStep({
  onPrimary,
  onSecondary,
  busy,
  error,
}: {
  onPrimary: () => void;
  onSecondary: () => void;
  busy: boolean;
  error: string;
}) {
  return (
    <Screen>
      <View style={sharedStyles.permissionScreen}>
        <View style={[sharedStyles.bigIconCircle, { backgroundColor: HiveColors.greenLight }]}>
          <HiveIcon name="send" size={38} color={HiveColors.green} />
        </View>
        <Text style={sharedStyles.permissionTitle}>Find help near you</Text>
        <Text style={sharedStyles.permissionSubtitle}>
          Share your location so we can show nearby benefits and resources — food banks, local assistance programs —
          and nearby store pricing for your grocery list.
        </Text>
        {error ? <Text style={sharedStyles.authError}>{error}</Text> : null}
        <View style={styles.flexSpacer} />
        <View style={sharedStyles.fullWidth}>
          <AppButton title={busy ? 'Saving…' : 'Allow location'} onPress={onPrimary} disabled={busy} />
          <AppButton title="Not now" variant="plain" onPress={onSecondary} disabled={busy} />
        </View>
      </View>
    </Screen>
  );
}

export function LocationZipStep({
  zip,
  onChangeZip,
  onSave,
  onSkip,
  busy,
  error,
}: {
  zip: string;
  onChangeZip: (zip: string) => void;
  onSave: () => void;
  onSkip: () => void;
  busy: boolean;
  error: string;
}) {
  return (
    <ScrollScreen keyboard>
      <View style={sharedStyles.permissionScreen}>
        <View style={[sharedStyles.bigIconCircle, { backgroundColor: HiveColors.greenLight }]}>
          <HiveIcon name="send" size={38} color={HiveColors.green} />
        </View>
        <Text style={sharedStyles.permissionTitle}>Enter your ZIP code</Text>
        <Text style={sharedStyles.permissionSubtitle}>
          No problem — enter your ZIP code instead and we&apos;ll still match you with resources near you.
        </Text>
        <View style={sharedStyles.fullWidth}>
          <AppTextField label="ZIP code" value={zip} onChangeText={onChangeZip} placeholder="90210" keyboardType="number-pad" />
        </View>
        {error ? <Text style={sharedStyles.authError}>{error}</Text> : null}
        <View style={styles.flexSpacer} />
        <View style={sharedStyles.fullWidth}>
          <AppButton
            title={busy ? 'Saving…' : 'Save'}
            onPress={onSave}
            disabled={busy || zip.trim().length < 5}
          />
          <AppButton title="Skip" variant="plain" onPress={onSkip} disabled={busy} />
        </View>
      </View>
    </ScrollScreen>
  );
}

// ---------------------------------------------------------------------------
// Communication consents
// ---------------------------------------------------------------------------

function ConsentScreen({
  icon,
  title,
  body,
  primaryLabel,
  onPrimary,
  onSecondary,
  busy,
  error,
}: {
  icon: HiveIconName;
  title: string;
  body: string;
  primaryLabel: string;
  onPrimary: () => void;
  onSecondary: () => void;
  busy: boolean;
  error: string;
}) {
  return (
    <Screen>
      <View style={sharedStyles.permissionScreen}>
        <View style={[sharedStyles.bigIconCircle, { backgroundColor: HiveColors.cream }]}>
          <HiveIcon name={icon} size={38} color={HiveColors.green} />
        </View>
        <Text style={sharedStyles.permissionTitle}>{title}</Text>
        <Text style={sharedStyles.permissionSubtitle}>{body}</Text>
        {error ? <Text style={sharedStyles.authError}>{error}</Text> : null}
        <View style={styles.flexSpacer} />
        <View style={sharedStyles.fullWidth}>
          <AppButton title={busy ? 'Saving…' : primaryLabel} onPress={onPrimary} disabled={busy} />
          <AppButton title="No thanks" variant="plain" onPress={onSecondary} disabled={busy} />
        </View>
        <Text style={styles.footnote}>You can always change this later in settings</Text>
      </View>
    </Screen>
  );
}

export function EmailConsentStep({
  onPrimary,
  onSecondary,
  busy,
  error,
}: {
  onPrimary: () => void;
  onSecondary: () => void;
  busy: boolean;
  error: string;
}) {
  return (
    <ConsentScreen
      icon="send"
      title="Stay in the loop by email"
      body="Get app updates, reminders, newsletters, helpful information, and marketing communications from Help The Hive by email. We'll never spam you, and you can unsubscribe anytime."
      primaryLabel="Yes, email me"
      onPrimary={onPrimary}
      onSecondary={onSecondary}
      busy={busy}
      error={error}
    />
  );
}

export function PhoneConsentStep({
  onPrimary,
  onSecondary,
  busy,
  error,
}: {
  onPrimary: () => void;
  onSecondary: () => void;
  busy: boolean;
  error: string;
}) {
  return (
    <ConsentScreen
      icon="chat"
      title="Can we call you?"
      body="Sometimes a quick call is the fastest way to help — for example, if your benefits application needs attention. We'll only call when appropriate."
      primaryLabel="Yes, you can call me"
      onPrimary={onPrimary}
      onSecondary={onSecondary}
      busy={busy}
      error={error}
    />
  );
}

// ---------------------------------------------------------------------------
// All-set screen
// ---------------------------------------------------------------------------

export function AllSetStep({ onNext, busy, error }: { onNext: () => void; busy: boolean; error: string }) {
  return (
    <Screen>
      <View style={sharedStyles.permissionScreen}>
        <View style={[sharedStyles.bigIconCircle, { backgroundColor: HiveColors.greenLight }]}>
          <HiveIcon name="check" size={44} color={HiveColors.green} />
        </View>
        <Text style={styles.allSetTitle}>You&apos;re all set!</Text>
        {error ? <Text style={sharedStyles.authError}>{error}</Text> : null}
        <View style={styles.flexSpacer} />
        <View style={sharedStyles.fullWidth}>
          <AppButton title={busy ? 'Saving…' : 'Continue'} onPress={onNext} disabled={busy} />
        </View>
      </View>
    </Screen>
  );
}

// ---------------------------------------------------------------------------
// Consent gate — shown first for new accounts created via social sign-in,
// which skip the Sign Up screen where email signups accept the legal terms.
// ---------------------------------------------------------------------------

function ConsentRow({
  checked,
  onToggle,
  children,
}: {
  checked: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <Pressable onPress={onToggle} style={styles.consentRow} accessibilityRole="checkbox" accessibilityState={{ checked }}>
      <View style={[styles.consentBox, checked && styles.consentBoxChecked]}>
        {checked ? <HiveIcon name="check" size={12} color={HiveColors.white} /> : null}
      </View>
      <Text style={styles.consentText}>{children}</Text>
    </Pressable>
  );
}

export function ConsentStep({
  onComplete,
  busy,
  error,
}: {
  onComplete: (emailOptIn: boolean) => void;
  busy: boolean;
  error?: string;
}) {
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [emailOptIn, setEmailOptIn] = useState(false);
  return (
    <Screen>
      <View style={sharedStyles.permissionScreen}>
        <Text style={sharedStyles.permissionTitle}>One quick thing</Text>
        <Text style={sharedStyles.permissionSubtitle}>Please review and accept our legal terms to continue.</Text>
        <View style={styles.consentBlock}>
          <ConsentRow checked={termsAccepted} onToggle={() => setTermsAccepted((v) => !v)}>
            I agree to Help The Hive&apos;s{' '}
            <Text style={styles.consentLink} onPress={() => void Linking.openURL(TERMS_URL)}>
              Terms &amp; Conditions
            </Text>{' '}
            and{' '}
            <Text style={styles.consentLink} onPress={() => void Linking.openURL(PRIVACY_URL)}>
              Privacy Policy
            </Text>
            .
          </ConsentRow>
          <ConsentRow checked={emailOptIn} onToggle={() => setEmailOptIn((v) => !v)}>
            I&apos;d like to receive Help The Hive app updates, reminders, newsletters, helpful information, and marketing communications by email.
          </ConsentRow>
        </View>
        <View style={styles.flexSpacer} />
        {error ? <Text style={sharedStyles.authError}>{error}</Text> : null}
        <View style={sharedStyles.fullWidth}>
          <AppButton
            title={busy ? 'Saving…' : 'Continue'}
            onPress={() => onComplete(emailOptIn)}
            disabled={!termsAccepted || busy}
          />
        </View>
      </View>
    </Screen>
  );
}

// ---------------------------------------------------------------------------
// Standalone OnboardingScreen — the app-root 'onboarding' route.
//
// Only accounts that have not completed onboarding reach it (app-root routes
// by viewer.onboardingState.hasCompletedOnboarding). The draft seeds from the
// viewer's saved questionnaire answers so an interrupted onboarding resumes
// with its answers intact; each step saves before advancing.
// ---------------------------------------------------------------------------

function toggleInList(value: string, list: string[]): string[] {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

export function OnboardingScreen({ nav, initialStepKey }: { nav: Navigation; initialStepKey?: string | null }) {
  const app = useAppState();
  const answers = app.questionnaireAnswers;
  const [step, setStep] = useState(() => resumeIndexForStepKey(initialStepKey));
  const [budgetDollars, setBudgetDollars] = useState(() =>
    parseBudgetDollars(answers?.weeklyBudget ?? app.preferences.weeklyBudget),
  );
  const [selectedFinanceTopics, setSelectedFinanceTopics] = useState<string[]>(
    () => answers?.financeTopics ?? app.preferences.preferredFinanceTopics,
  );
  const [selectedResources, setSelectedResources] = useState<string[]>(
    () => answers?.resources ?? app.preferences.preferredResources,
  );
  const [primaryGoal, setPrimaryGoal] = useState<string | null>(() => answers?.primaryGoal ?? null);
  const [householdSize, setHouseholdSize] = useState<string | null>(() => answers?.householdSize ?? null);
  const [incomeBracket, setIncomeBracket] = useState<string | null>(() => answers?.incomeBracket ?? null);
  const [profileImageUri, setProfileImageUri] = useState(app.profile.profileImageUri);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [locationPermissionStatus, setLocationPermissionStatus] = useState<'unset' | 'granted' | 'denied'>('unset');
  const [zip, setZip] = useState('');
  const [showZipFallback, setShowZipFallback] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [isRecordingConsent, setIsRecordingConsent] = useState(false);

  // Social signups skip the Sign Up screen, so they accept the terms here
  // before the questionnaire begins. (Email-signup consent is recorded on the
  // verify screen and retried by hydrateViewer at the first login.)
  const needsConsentStep = app.isNewSocialAccount && !app.pendingSignupProfile?.termsVersion;
  if (needsConsentStep && !app.signupConsentRecorded) {
    return (
      <ConsentStep
        busy={isRecordingConsent}
        error={saveError}
        onComplete={(emailOptIn) => {
          setIsRecordingConsent(true);
          setSaveError('');
          void app
            .recordSignupConsent({ emailMarketingOptIn: emailOptIn })
            .then(() => app.markSocialSignupComplete())
            .catch(() => setSaveError('Unable to save your consent. Please try again.'))
            .finally(() => setIsRecordingConsent(false));
        }}
      />
    );
  }

  /** Saves one step's data plus its step marker, then advances on success. */
  async function persistStep(stepKey: string, save: () => Promise<unknown>) {
    if (isSaving) {
      return;
    }
    setIsSaving(true);
    setSaveError('');
    try {
      await save();
      await saveOnboardingStep(stepKey);
      setStep((current) => current + 1);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Unable to save. Please try again.');
    } finally {
      setIsSaving(false);
    }
  }

  async function pickImage() {
    const uri = await pickProfileImage();
    if (uri) {
      setProfileImageUri(uri);
    }
  }

  // --- questionnaire steps -------------------------------------------------

  async function saveBudgetStep() {
    await persistStep('questionnaire:1', () =>
      saveQuestionnaire({ weeklyBudget: formatBudgetDollars(budgetDollars) }),
    );
  }

  async function saveFinanceStep() {
    await persistStep('questionnaire:2', () => saveQuestionnaire({ financeTopics: selectedFinanceTopics }));
  }

  async function saveResourcesStep() {
    await persistStep('questionnaire:3', () => saveQuestionnaire({ resources: selectedResources }));
  }

  async function savePrimaryGoalStep() {
    if (!primaryGoal) {
      return;
    }
    await persistStep('questionnaire:4', () => saveQuestionnaire({ primaryGoal }));
  }

  async function saveHouseholdSizeStep() {
    if (!householdSize) {
      return;
    }
    await persistStep('questionnaire:5', () => saveQuestionnaire({ householdSize }));
  }

  async function saveIncomeStep() {
    if (!incomeBracket) {
      return;
    }
    await persistStep('questionnaire:6', () => saveQuestionnaire({ incomeBracket }));
  }

  async function savePhotoStep() {
    await persistStep('questionnaire:7', async () => {
      if (profileImageUri && profileImageUri !== app.profile.profileImageUri) {
        await updateProfileRemote({ profileImageUri });
      }
    });
  }

  // --- push permission (real native OS prompt) ------------------------------

  async function requestPush(grantedFlow: boolean) {
    if (isSaving) {
      return;
    }
    setIsSaving(true);
    setSaveError('');
    try {
      if (grantedFlow) {
        const result = await requestAndRegisterPushToken();
        setNotificationsEnabled(result.status === 'registered');
        if (result.status !== 'registered') {
          setSaveError(result.message);
        }
      }
      await saveOnboardingStep('permissions:push');
      setStep((current) => current + 1);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Unable to save. Please try again.');
    } finally {
      setIsSaving(false);
    }
  }

  // --- location: explainer -> native prompt -> ZIP fallback -----------------

  async function requestLocation() {
    if (isSaving) {
      return;
    }
    setIsSaving(true);
    setSaveError('');
    try {
      const result = await Location.requestForegroundPermissionsAsync();
      const granted = result.granted;
      setLocationPermissionStatus(granted ? 'granted' : 'denied');
      await saveOnboardingStep('permissions:location');
      if (granted) {
        setStep((current) => current + 1);
      } else {
        setShowZipFallback(true);
      }
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Unable to request location. Please try again.');
    } finally {
      setIsSaving(false);
    }
  }

  async function skipLocation() {
    await persistStep('permissions:location', async () => {
      setLocationPermissionStatus('unset');
    });
  }

  async function saveZip() {
    if (zip.trim().length < 5 || isSaving) {
      return;
    }
    setIsSaving(true);
    setSaveError('');
    try {
      await saveLocationFallback(zip.trim());
      setShowZipFallback(false);
      setStep((current) => current + 1);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Unable to save your ZIP code. Please try again.');
    } finally {
      setIsSaving(false);
    }
  }

  // --- communication consents -----------------------------------------------

  async function saveEmailConsent(consented: boolean) {
    await persistStep('consent:email', () => updateCommunicationConsents({ emailConsent: consented }));
  }

  async function savePhoneConsent(consented: boolean) {
    await persistStep('consent:phone', () => updateCommunicationConsents({ phoneCallConsent: consented }));
  }

  // --- all-set -> complete ---------------------------------------------------

  async function finish() {
    if (isSaving) {
      return;
    }
    setIsSaving(true);
    setSaveError('');
    try {
      await saveOnboardingStep('all-set');
      const preferences: AppPreferences = {
        weeklyBudget: formatBudgetDollars(budgetDollars),
        preferredFinanceTopics: selectedFinanceTopics,
        preferredResources: selectedResources,
        wantsGovAssistance: primaryGoal === PRIMARY_GOAL_APPLY_BENEFITS,
        selectedBenefitPrograms: [],
        emailMarketingOptIn: app.preferences.emailMarketingOptIn,
        locationPermissionStatus,
        notificationsEnabled,
        expiringPantryNotificationsEnabled: app.preferences.expiringPantryNotificationsEnabled,
        weeklyMealPlanNotificationsEnabled: app.preferences.weeklyMealPlanNotificationsEnabled,
        resourceReminderNotificationsEnabled: app.preferences.resourceReminderNotificationsEnabled,
      };
      await app.completeOnboarding(preferences, profileImageUri);
      nav.reset('main');
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Unable to finish onboarding. Please try again.');
    } finally {
      setIsSaving(false);
    }
  }

  const back = () => {
    setSaveError('');
    setStep((current) => Math.max(0, current - 1));
  };

  if (step === 0) {
    return (
      <BudgetStep value={budgetDollars} onChange={setBudgetDollars} onNext={() => void saveBudgetStep()} busy={isSaving} error={saveError} />
    );
  }
  if (step === 1) {
    return (
      <FinanceHelpStep
        selected={selectedFinanceTopics}
        onToggle={(topic) => setSelectedFinanceTopics((current) => toggleInList(topic, current))}
        onNext={() => void saveFinanceStep()}
        onBack={back}
        busy={isSaving}
        error={saveError}
      />
    );
  }
  if (step === 2) {
    return (
      <ResourcesStep
        selected={selectedResources}
        onToggle={(resource) => setSelectedResources((current) => toggleInList(resource, current))}
        onNext={() => void saveResourcesStep()}
        onBack={back}
        busy={isSaving}
        error={saveError}
      />
    );
  }
  if (step === 3) {
    return (
      <PrimaryGoalStep
        selected={primaryGoal}
        onSelect={setPrimaryGoal}
        onNext={() => void savePrimaryGoalStep()}
        onBack={back}
        busy={isSaving}
        error={saveError}
      />
    );
  }
  if (step === 4) {
    return (
      <HouseholdSizeStep
        selected={householdSize}
        onSelect={setHouseholdSize}
        onNext={() => void saveHouseholdSizeStep()}
        onBack={back}
        busy={isSaving}
        error={saveError}
      />
    );
  }
  if (step === 5) {
    return (
      <IncomeStep
        selected={incomeBracket}
        onSelect={setIncomeBracket}
        onNext={() => void saveIncomeStep()}
        onBack={back}
        busy={isSaving}
        error={saveError}
      />
    );
  }
  if (step === 6) {
    return (
      <ProfilePhotoStep
        imageUri={profileImageUri}
        onPick={() => void pickImage()}
        onNext={() => void savePhotoStep()}
        onBack={back}
        busy={isSaving}
        error={saveError}
      />
    );
  }
  if (step === 7) {
    return (
      <PushPermissionStep
        onPrimary={() => void requestPush(true)}
        onSecondary={() => void requestPush(false)}
        busy={isSaving}
      />
    );
  }
  if (step === 8) {
    if (showZipFallback) {
      return (
        <LocationZipStep
          zip={zip}
          onChangeZip={setZip}
          onSave={() => void saveZip()}
          onSkip={() => {
            setShowZipFallback(false);
            setStep((current) => current + 1);
          }}
          busy={isSaving}
          error={saveError}
        />
      );
    }
    return (
      <LocationExplainerStep
        onPrimary={() => void requestLocation()}
        onSecondary={() => void skipLocation()}
        busy={isSaving}
        error={saveError}
      />
    );
  }
  if (step === 9) {
    return (
      <EmailConsentStep
        onPrimary={() => void saveEmailConsent(true)}
        onSecondary={() => void saveEmailConsent(false)}
        busy={isSaving}
        error={saveError}
      />
    );
  }
  if (step === 10) {
    return (
      <PhoneConsentStep
        onPrimary={() => void savePhoneConsent(true)}
        onSecondary={() => void savePhoneConsent(false)}
        busy={isSaving}
        error={saveError}
      />
    );
  }
  return <AllSetStep onNext={() => void finish()} busy={isSaving} error={saveError} />;
}

const styles = StyleSheet.create({
  allSetTitle: {
    color: HiveColors.text,
    fontSize: 28,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: -0.3,
  },
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
  comingSoonBadge: {
    alignSelf: 'flex-start',
    backgroundColor: HiveColors.cream,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  comingSoonText: {
    color: HiveColors.orange,
    fontSize: 13,
    fontWeight: '800',
  },
  consentBlock: {
    gap: 14,
    marginTop: 8,
    width: '100%',
  },
  consentRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  consentBox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: HiveColors.border,
    backgroundColor: HiveColors.card,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  consentBoxChecked: {
    backgroundColor: HiveColors.green,
    borderColor: HiveColors.green,
  },
  consentText: {
    flex: 1,
    color: HiveColors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
  },
  consentLink: {
    color: HiveColors.greenDark,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
  content: {
    flexGrow: 1,
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
  pill: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: HiveColors.border,
  },
  pills: {
    flexDirection: 'row',
    gap: 6,
    justifyContent: 'flex-end',
  },
  pillDone: {
    backgroundColor: HiveColors.green,
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
  tile: {
    flexBasis: '22%',
    flexGrow: 1,
    minHeight: 64,
    borderRadius: 16,
    backgroundColor: HiveColors.card,
    borderWidth: 1.5,
    borderColor: HiveColors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 10,
  },
  tileSelected: {
    borderColor: HiveColors.green,
    backgroundColor: HiveColors.greenLight,
  },
  tileText: {
    color: HiveColors.text,
    fontSize: 20,
    fontWeight: '700',
  },
  tileTextSelected: {
    color: HiveColors.greenDark,
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
