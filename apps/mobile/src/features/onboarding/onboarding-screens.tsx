// Signup onboarding flow (September 2026 redesign, from Marcos's Xcode flow).
//
// Six questionnaire steps — resources, household size, intent, household
// income, finance topics, profile photo — then the all-set screen, then the
// push permission prompt, then the location explainer (ZIP fallback when
// denied). Steps 1-4 require a selection; steps 5-6 are optional.
//
// Each step saves server-side as it completes (saveQuestionnaire for the
// answers, saveOnboardingStep for the step marker), so an interrupted
// onboarding resumes via resumeIndexForStepKey. Answers are pre-filled from
// any saved questionnaire. No social sign-in anywhere (Marcos, 2026-09-13).

import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, Text, TextInput, View } from 'react-native';

import { useAuth } from '@/auth/auth-context';
import {
  AppButton,
  CheckboxRow,
  HiveIcon,
  PennyImage,
  Screen,
  ScrollScreen,
  SelectionRow,
  TextLink,
  uiText,
} from '@/components/hive-ui';
import { HiveColors } from '@/constants/theme';
import { requestAndRegisterPushToken } from '@/features/notifications/notification-service';
import { useAppState } from '@/state/app-state';
import { StyleSheet } from 'react-native';
import { sharedStyles } from '@/features/app/app-shared';
import { type Navigation } from '@/features/app/navigation-types';
import {
  HOUSEHOLD_SIZE_OPTIONS,
  INCOME_BRACKET_OPTIONS,
  PRIMARY_GOAL_APPLY_BENEFITS,
  PRIMARY_GOAL_BUDGET_MEALS,
  QUESTIONNAIRE_STEP_COUNT,
  STEP_ALL_SET,
  STEP_COUNT,
  STEP_FINANCE_TOPICS,
  STEP_HOUSEHOLD_SIZE,
  STEP_INCOME,
  STEP_INTENT,
  STEP_LOCATION,
  STEP_PROFILE_PHOTO,
  STEP_PUSH_PERMISSION,
  STEP_RESOURCES,
  resumeIndexForStepKey,
} from '@/features/onboarding/onboarding-model';
import {
  saveLocationFallback,
  saveOnboardingStep,
  saveQuestionnaire,
  type QuestionnaireUpdate,
} from '@/features/onboarding/onboarding-repository';

const pennyWaveSource = require('@/assets/images/hive/penny-wave.png');

type StepComponentProps = {
  initial: QuestionnaireUpdate;
  onNext: (patch: QuestionnaireUpdate, stepKey: string) => Promise<void> | void;
  onBack: () => void;
  busy: boolean;
};

function ComingSoonBadge() {
  return (
    <View style={styles.comingSoonBadge}>
      <Text style={styles.comingSoonText}>Coming Soon</Text>
    </View>
  );
}

function StepError({ message }: { message: string }) {
  if (!message) {
    return null;
  }
  return <Text style={sharedStyles.authError}>{message}</Text>;
}

/** Full-width progress bar with the "STEP X OF 6" label, per the designs. */
function OnboardingTopBar({
  current,
  total,
  onBack,
}: {
  current: number;
  total: number;
  onBack?: () => void;
}) {
  const auth = useAuth();
  const progress = Math.min(1, Math.max(0, current / total));
  return (
    <View style={styles.topBar}>
      <View style={styles.topBarRow}>
        {onBack ? (
          <Pressable onPress={onBack} hitSlop={12} accessibilityRole="button" accessibilityLabel="Back">
            <HiveIcon name="back" size={20} color={HiveColors.text} />
          </Pressable>
        ) : (
          <View style={styles.topBarSpacer} />
        )}
        <Text style={styles.topBarLabel}>
          STEP {current} OF {total}
        </Text>
        {/* Escape hatch: a signed-in user with a stale session can get stuck
            here with no way back to login (e.g. QA testing fresh sign-up). */}
        <Pressable
          onPress={() => void auth.signOut()}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Sign out"
        >
          <Text style={styles.topBarSignOut}>Sign out</Text>
        </Pressable>
      </View>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { flex: progress }]} />
        <View style={{ flex: 1 - progress }} />
      </View>
    </View>
  );
}

/** Step container: light card background, top progress bar, scrollable body. */
function OnboardingStepScreen({
  stepNumber,
  onBack,
  children,
}: {
  stepNumber: number;
  onBack?: () => void;
  children: React.ReactNode;
}) {
  return (
    <ScrollScreen contentStyle={styles.stepScreenContent}>
      <OnboardingTopBar current={stepNumber} total={QUESTIONNAIRE_STEP_COUNT} onBack={onBack} />
      <View style={styles.stepBody}>{children}</View>
    </ScrollScreen>
  );
}

function StepTitle({ children }: { children: React.ReactNode }) {
  return <Text style={styles.stepTitle}>{children}</Text>;
}

function StepSubtitle({ children }: { children: React.ReactNode }) {
  return <Text style={styles.stepSubtitle}>{children}</Text>;
}

function StepFootnote({ children }: { children: React.ReactNode }) {
  return <Text style={styles.stepFootnote}>{children}</Text>;
}

function NextButton({
  title = 'Next',
  disabled,
  busy,
  onPress,
}: {
  title?: string;
  disabled?: boolean;
  busy?: boolean;
  onPress: () => void;
}) {
  return (
    <AppButton
      title={busy ? 'Saving…' : title}
      disabled={disabled || busy}
      onPress={onPress}
      style={styles.nextButton}
    />
  );
}

const financeTopics: Array<{ title: string; subtitle: string }> = [
  { title: 'Budgeting Basics', subtitle: 'Learn how to create and stick to a budget' },
  { title: 'Saving Strategies', subtitle: 'Tips to build your emergency fund' },
  { title: 'Debt Management', subtitle: 'Get out of debt faster' },
  { title: 'Investing 101', subtitle: 'Start growing your money' },
  { title: 'Credit Scores', subtitle: 'Understand and improve your credit' },
];

function FinanceHelpStep({ initial, onNext, onBack, busy }: StepComponentProps) {
  const [selectedFinanceTopics, setSelectedFinanceTopics] = useState<string[]>(initial.financeTopics ?? []);
  const [errorMessage, setErrorMessage] = useState('');

  function toggle(topic: string) {
    setSelectedFinanceTopics((current) =>
      current.includes(topic) ? current.filter((item) => item !== topic) : [...current, topic],
    );
  }

  async function next() {
    setErrorMessage('');
    try {
      await onNext({ financeTopics: selectedFinanceTopics }, 'questionnaire:5');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to save your choices.');
    }
  }

  return (
    <OnboardingStepScreen stepNumber={5} onBack={onBack}>
      <StepTitle>What financial help do you want to learn?</StepTitle>
      <StepSubtitle>
        This feature is launching soon! Tell us what you&apos;re interested in and we&apos;ll personalize your
        experience when it&apos;s ready.
      </StepSubtitle>
      <View style={styles.optionsList}>
        {financeTopics.map((topic) => (
          <View key={topic.title} style={styles.financeRow}>
            <View style={styles.financeRowMain}>
              <CheckboxRow
                title={topic.title}
                subtitle={topic.subtitle}
                selected={selectedFinanceTopics.includes(topic.title)}
                onPress={() => toggle(topic.title)}
              />
            </View>
            <View style={styles.financeBadgeSlot}>
              <ComingSoonBadge />
            </View>
          </View>
        ))}
      </View>
      <StepFootnote>You can always change this later in settings</StepFootnote>
      <StepError message={errorMessage} />
      <NextButton busy={busy} onPress={() => void next()} />
    </OnboardingStepScreen>
  );
}

const resourceOptions: Array<{ title: string; subtitle: string; icon: 'fork' | 'home' | 'heart' | 'bolt' | 'job' | 'child' }> = [
  { title: 'Food Assistance', subtitle: 'Food pantries, free meals, and grocery programs', icon: 'fork' },
  { title: 'Housing Help', subtitle: 'Housing assistance programs', icon: 'home' },
  { title: 'Healthcare', subtitle: 'How to apply to Medicaid and other programs.', icon: 'heart' },
  { title: 'Utility Assistance', subtitle: 'Help with electric, gas, water, and phone bills', icon: 'bolt' },
  { title: 'Job Help', subtitle: 'Career programs, resume help, and places hiring.', icon: 'job' },
  { title: 'Childcare', subtitle: 'Daycare assistance and after-school programs', icon: 'child' },
];

function ResourcesStep({ initial, onNext, busy }: StepComponentProps) {
  const [selectedResources, setSelectedResources] = useState<string[]>(initial.resources ?? []);
  const [errorMessage, setErrorMessage] = useState('');

  function toggle(title: string) {
    setSelectedResources((current) =>
      current.includes(title) ? current.filter((item) => item !== title) : [...current, title],
    );
  }

  async function next() {
    setErrorMessage('');
    try {
      await onNext({ resources: selectedResources }, 'questionnaire:1');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to save your choices.');
    }
  }

  return (
    <OnboardingStepScreen stepNumber={1}>
      <StepTitle>What resources do you need?</StepTitle>
      <StepSubtitle>Select all that apply. We&apos;ll match you with resources near you.</StepSubtitle>
      <View style={styles.optionsList}>
        {resourceOptions.map((option) => (
          <CheckboxRow
            key={option.title}
            title={option.title}
            subtitle={option.subtitle}
            icon={option.icon}
            selected={selectedResources.includes(option.title)}
            onPress={() => toggle(option.title)}
          />
        ))}
      </View>
      <StepFootnote>You can always change this later in settings</StepFootnote>
      <StepError message={errorMessage} />
      <NextButton disabled={selectedResources.length === 0} busy={busy} onPress={() => void next()} />
    </OnboardingStepScreen>
  );
}

function HouseholdSizeStep({ initial, onNext, onBack, busy }: StepComponentProps) {
  const [householdSize, setHouseholdSize] = useState(initial.householdSize ?? '');
  const [errorMessage, setErrorMessage] = useState('');

  async function next() {
    if (!householdSize) {
      return;
    }
    setErrorMessage('');
    try {
      await onNext({ householdSize }, 'questionnaire:2');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to save your choice.');
    }
  }

  return (
    <OnboardingStepScreen stepNumber={2} onBack={onBack}>
      <StepTitle>How many people are in your household?</StepTitle>
      <StepSubtitle>Include yourself and everyone who lives and shares meals with you.</StepSubtitle>
      <View style={styles.tileGrid}>
        {HOUSEHOLD_SIZE_OPTIONS.map((option) => {
          const selected = householdSize === option;
          return (
            <Pressable
              key={option}
              onPress={() => setHouseholdSize(option)}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              style={[styles.tile, selected && styles.tileSelected]}>
              <Text style={[styles.tileText, selected && styles.tileTextSelected]}>{option}</Text>
            </Pressable>
          );
        })}
      </View>
      <StepFootnote>This helps us match you with benefits and portion meals correctly.</StepFootnote>
      <StepError message={errorMessage} />
      <NextButton disabled={!householdSize} busy={busy} onPress={() => void next()} />
    </OnboardingStepScreen>
  );
}

const intentOptions = [
  { code: PRIMARY_GOAL_APPLY_BENEFITS, title: 'Apply for Benefits' },
  { code: PRIMARY_GOAL_BUDGET_MEALS, title: 'Plan budget-friendly meals' },
];

function IntentStep({ initial, onNext, onBack, busy }: StepComponentProps) {
  const [primaryGoal, setPrimaryGoal] = useState(initial.primaryGoal ?? '');
  const [errorMessage, setErrorMessage] = useState('');

  async function next() {
    if (!primaryGoal) {
      return;
    }
    setErrorMessage('');
    try {
      await onNext({ primaryGoal }, 'questionnaire:3');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to save your choice.');
    }
  }

  return (
    <OnboardingStepScreen stepNumber={3} onBack={onBack}>
      <StepTitle>What brings you to Help The Hive today?</StepTitle>
      <StepSubtitle>This helps Penny personalize your experience.</StepSubtitle>
      <View style={styles.optionsList}>
        {intentOptions.map((option) => (
          <SelectionRow
            key={option.code}
            title={option.title}
            selected={primaryGoal === option.code}
            onPress={() => setPrimaryGoal(option.code)}
          />
        ))}
      </View>
      <StepFootnote>You can do both anytime — this just helps us get you started.</StepFootnote>
      <StepError message={errorMessage} />
      <NextButton disabled={!primaryGoal} busy={busy} onPress={() => void next()} />
    </OnboardingStepScreen>
  );
}

function IncomeStep({ initial, onNext, onBack, busy }: StepComponentProps) {
  const [incomeBracket, setIncomeBracket] = useState(initial.incomeBracket ?? '');
  const [errorMessage, setErrorMessage] = useState('');

  async function next() {
    if (!incomeBracket) {
      return;
    }
    setErrorMessage('');
    try {
      await onNext({ incomeBracket }, 'questionnaire:4');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to save your choice.');
    }
  }

  return (
    <OnboardingStepScreen stepNumber={4} onBack={onBack}>
      <StepTitle>What is your household&apos;s approximate monthly income before taxes?</StepTitle>
      <StepSubtitle>Together with household size, this helps us find benefits you may qualify for.</StepSubtitle>
      <View style={styles.optionsList}>
        {INCOME_BRACKET_OPTIONS.map((option) => (
          <SelectionRow
            key={option}
            title={option}
            selected={incomeBracket === option}
            onPress={() => setIncomeBracket(option)}
          />
        ))}
      </View>
      <StepFootnote>Your answer stays private and is never shared without your review.</StepFootnote>
      <StepError message={errorMessage} />
      <NextButton disabled={!incomeBracket} busy={busy} onPress={() => void next()} />
    </OnboardingStepScreen>
  );
}

function ProfilePhotoStep({ onNext, onBack, busy }: StepComponentProps) {
  const app = useAppState();
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState('');

  async function choosePhoto() {
    setErrorMessage('');
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setErrorMessage('Photo access is needed to choose a picture. You can skip this step.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });
    if (!result.canceled && result.assets[0]?.uri) {
      setPhotoUri(result.assets[0].uri);
    }
  }

  async function next() {
    setErrorMessage('');
    try {
      if (photoUri) {
        await app.saveProfile({ profileImageUri: photoUri });
      }
      await onNext({}, 'questionnaire:6');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to save your photo.');
    }
  }

  async function skip() {
    setErrorMessage('');
    try {
      await onNext({}, 'questionnaire:6');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to continue.');
    }
  }

  return (
    <OnboardingStepScreen stepNumber={6} onBack={onBack}>
      <View style={styles.photoHeader}>
        <PennyImage source={pennyWaveSource} size={96} />
        <StepTitle>Upload a Profile Picture</StepTitle>
        <StepSubtitle>Add a photo so Penny can greet you personally.</StepSubtitle>
      </View>
      <Pressable
        onPress={() => void choosePhoto()}
        accessibilityRole="button"
        accessibilityLabel={photoUri ? 'Change profile photo' : 'Choose a profile photo'}
        style={styles.photoCircle}>
        {photoUri ? (
          <Image source={{ uri: photoUri }} style={styles.photoImage} />
        ) : (
          <View style={styles.photoPlaceholder}>
            <HiveIcon name="camera" size={28} color={HiveColors.textSecondary} />
            <Text style={styles.photoPlaceholderText}>Tap to choose</Text>
          </View>
        )}
      </Pressable>
      <StepError message={errorMessage} />
      <NextButton title={photoUri ? 'Save & Continue' : 'Continue'} busy={busy} onPress={() => void next()} />
      <TextLink label="" linkText="Skip for now" onPress={() => void skip()} />
    </OnboardingStepScreen>
  );
}

function AllSetStep({ onNext, busy }: { onNext: () => Promise<void> | void; busy: boolean }) {
  const [errorMessage, setErrorMessage] = useState('');

  async function next() {
    setErrorMessage('');
    try {
      await onNext();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to continue.');
    }
  }

  return (
    <Screen>
      <View style={styles.allSetScreen}>
        <View style={styles.allSetCenter}>
          <View style={styles.allSetCheckCircle}>
            <HiveIcon name="check" size={36} color={HiveColors.green} />
          </View>
          <PennyImage source={pennyWaveSource} size={120} />
          <Text style={styles.allSetTitle}>You&apos;re all set!</Text>
        </View>
        <View style={styles.allSetFooter}>
          <StepError message={errorMessage} />
          <AppButton title={busy ? 'Saving…' : 'Continue'} disabled={busy} onPress={() => void next()} />
        </View>
      </View>
    </Screen>
  );
}

function PermissionStep({
  penny,
  title,
  subtitle,
  primaryLabel,
  secondaryLabel,
  onPrimary,
  onSecondary,
  busy,
}: {
  penny?: boolean;
  title: string;
  subtitle: string;
  primaryLabel: string;
  secondaryLabel: string;
  onPrimary: () => Promise<void> | void;
  onSecondary: () => Promise<void> | void;
  busy: boolean;
}) {
  const [errorMessage, setErrorMessage] = useState('');

  async function run(fn: () => Promise<void> | void) {
    setErrorMessage('');
    try {
      await fn();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Something went wrong.');
    }
  }

  return (
    <Screen>
      <View style={styles.permissionScreen}>
        <View style={styles.permissionCenter}>
          {penny ? <PennyImage source={pennyWaveSource} size={120} /> : null}
          <Text style={styles.permissionTitle}>{title}</Text>
          <Text style={styles.permissionSubtitle}>{subtitle}</Text>
        </View>
        <View style={styles.permissionFooter}>
          <StepError message={errorMessage} />
          <AppButton
            title={busy ? 'Please wait…' : primaryLabel}
            disabled={busy}
            onPress={() => void run(onPrimary)}
          />
          <AppButton title={secondaryLabel} variant="secondary" disabled={busy} onPress={() => void run(onSecondary)} />
        </View>
      </View>
    </Screen>
  );
}

function LocationZipStep({
  onNext,
  onBack,
  busy,
}: {
  onNext: () => Promise<void> | void;
  onBack: () => void;
  busy: boolean;
}) {
  const [zip, setZip] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const valid = /^\d{5}$/.test(zip.trim());

  async function next() {
    setErrorMessage('');
    if (!valid) {
      setErrorMessage('Enter a 5-digit ZIP code.');
      return;
    }
    try {
      await saveLocationFallback(zip.trim());
      await onNext();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to save your ZIP code.');
    }
  }

  return (
    <ScrollScreen keyboard>
      <View style={styles.permissionScreen}>
        <View style={styles.permissionCenter}>
          <PennyImage source={pennyWaveSource} size={120} />
          <Text style={styles.permissionTitle}>Find help near you</Text>
          <Text style={styles.permissionSubtitle}>
            No problem — enter your ZIP code and we&apos;ll still show resources close to you.
          </Text>
          <TextInput
            value={zip}
            onChangeText={(value) => setZip(value.replace(/\D/g, '').slice(0, 5))}
            placeholder="ZIP code"
            placeholderTextColor={HiveColors.textSecondary}
            keyboardType="number-pad"
            maxLength={5}
            style={styles.zipInput}
            accessibilityLabel="ZIP code"
          />
          <StepError message={errorMessage} />
        </View>
        <View style={styles.permissionFooter}>
          <AppButton title={busy ? 'Saving…' : 'Continue'} disabled={busy || !valid} onPress={() => void next()} />
          <AppButton title="Back" variant="secondary" disabled={busy} onPress={onBack} />
        </View>
      </View>
    </ScrollScreen>
  );
}

export function OnboardingScreen({ nav, initialStepKey }: { nav: Navigation; initialStepKey?: string | null }) {
  const app = useAppState();
  const auth = useAuth();
  const serverAnswers = app.questionnaireAnswers;
  const [step, setStep] = useState(() => resumeIndexForStepKey(initialStepKey, serverAnswers));
  const [busy, setBusy] = useState(false);
  const [fatalError, setFatalError] = useState('');
  const [showZipFallback, setShowZipFallback] = useState(false);
  // Local answers mirror the server saves within this session, so Back
  // navigation shows what was just chosen without waiting on a re-hydrate.
  const [localAnswers, setLocalAnswers] = useState<QuestionnaireUpdate>(() => ({
    financeTopics: serverAnswers?.financeTopics ?? [],
    resources: serverAnswers?.resources ?? [],
    primaryGoal: serverAnswers?.primaryGoal ?? undefined,
    householdSize: serverAnswers?.householdSize ?? undefined,
    incomeBracket: serverAnswers?.incomeBracket ?? undefined,
  }));

  const initial: QuestionnaireUpdate = localAnswers;

  function fail(error: unknown) {
    const message = error instanceof Error ? error.message : 'Something went wrong. Please try again.';
    setFatalError(message);
    setBusy(false);
  }

  async function persistStep(patch: QuestionnaireUpdate, stepKey: string) {
    setBusy(true);
    try {
      if (Object.keys(patch).length > 0) {
        await saveQuestionnaire(patch);
        setLocalAnswers((current) => ({ ...current, ...patch }));
      }
      await saveOnboardingStep(stepKey);
      setBusy(false);
      setStep((current) => current + 1);
    } catch (error) {
      fail(error);
      throw error;
    }
  }

  function back() {
    setFatalError('');
    setStep((current) => Math.max(STEP_RESOURCES, current - 1));
  }

  async function finish() {
    // Questionnaire answers already live server-side (saved per step). Fold
    // the intent + preferences into the profile/preferences rows and mark
    // onboarding complete — the benefits draft pre-fills from the saved
    // questionnaire answers.
    setBusy(true);
    try {
      const householdSize = localAnswers.householdSize;
      const parsedHouseholdSize = householdSize ? Number.parseInt(householdSize.replace('+', ''), 10) : undefined;
      if (parsedHouseholdSize && !Number.isNaN(parsedHouseholdSize)) {
        await app.saveProfile({ householdSize: parsedHouseholdSize });
      }
      await app.savePreferences({
        preferredFinanceTopics: localAnswers.financeTopics ?? [],
        preferredResources: localAnswers.resources ?? [],
        wantsGovAssistance: (localAnswers.primaryGoal ?? '') === PRIMARY_GOAL_APPLY_BENEFITS,
      });
      await app.completeOnboarding(
        {
          ...app.preferences,
          preferredFinanceTopics: localAnswers.financeTopics ?? [],
          preferredResources: localAnswers.resources ?? [],
          wantsGovAssistance: (localAnswers.primaryGoal ?? '') === PRIMARY_GOAL_APPLY_BENEFITS,
        },
        app.profile.profileImageUri ?? undefined,
      );
      await saveOnboardingStep('permissions:location');
      setBusy(false);
      nav.reset('main');
    } catch (error) {
      fail(error);
    }
  }

  async function requestPush() {
    setBusy(true);
    try {
      await requestAndRegisterPushToken();
      await saveOnboardingStep('permissions:push');
      setBusy(false);
      setStep((current) => current + 1);
    } catch (error) {
      fail(error);
    }
  }

  async function skipPush() {
    setBusy(true);
    try {
      await saveOnboardingStep('permissions:push');
      setBusy(false);
      setStep((current) => current + 1);
    } catch (error) {
      fail(error);
    }
  }

  async function requestLocation() {
    setBusy(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      await app.savePreferences({
        locationPermissionStatus: status === Location.PermissionStatus.GRANTED ? 'granted' : 'denied',
      });
      if (status === Location.PermissionStatus.GRANTED) {
        await finish();
      } else {
        setBusy(false);
        setShowZipFallback(true);
      }
    } catch (error) {
      fail(error);
    }
  }

  async function skipLocation() {
    setShowZipFallback(true);
  }

  if (fatalError) {
    return (
      <Screen>
        <View style={styles.fatalScreen}>
          <Text style={uiText.title}>Something went wrong</Text>
          <Text style={uiText.muted}>{fatalError}</Text>
          <AppButton title="Try again" onPress={() => setFatalError('')} />
          <AppButton title="Back to login" variant="secondary" onPress={() => void auth.signOut().then(() => nav.reset('login'))} />
        </View>
      </Screen>
    );
  }

  if (showZipFallback) {
    return <LocationZipStep onNext={() => void finish()} onBack={() => setShowZipFallback(false)} busy={busy} />;
  }

  const stepProps = { initial, busy, onBack: back, onNext: persistStep };

  switch (step) {
    case STEP_RESOURCES:
      return <ResourcesStep {...stepProps} />;
    case STEP_HOUSEHOLD_SIZE:
      return <HouseholdSizeStep {...stepProps} />;
    case STEP_INTENT:
      return <IntentStep {...stepProps} />;
    case STEP_INCOME:
      return <IncomeStep {...stepProps} />;
    case STEP_FINANCE_TOPICS:
      return <FinanceHelpStep {...stepProps} />;
    case STEP_PROFILE_PHOTO:
      return <ProfilePhotoStep {...stepProps} />;
    case STEP_ALL_SET:
      return (
        <AllSetStep
          busy={busy}
          onNext={async () => {
            setBusy(true);
            try {
              await saveOnboardingStep('all-set');
              setBusy(false);
              setStep((current) => current + 1);
            } catch (error) {
              fail(error);
            }
          }}
        />
      );
    case STEP_PUSH_PERMISSION:
      return (
        <PermissionStep
          penny
          title="Stay in the loop"
          subtitle="Get reminders for your meal plan and budget — plus new benefits you may qualify for."
          primaryLabel="Turn on notifications"
          secondaryLabel="Maybe later"
          onPrimary={() => void requestPush()}
          onSecondary={() => void skipPush()}
          busy={busy}
        />
      );
    case STEP_LOCATION:
      return (
        <PermissionStep
          penny
          title="Find help near you"
          subtitle="Allow location access so we can show food banks, SNAP offices, and resources close to you."
          primaryLabel="Allow location"
          secondaryLabel="Not now"
          onPrimary={() => void requestLocation()}
          onSecondary={() => void skipLocation()}
          busy={busy}
        />
      );
    default:
      // STEP_COUNT or beyond: onboarding is done — finish honestly rather
      // than rendering a blank screen.
      void finish();
      return (
        <Screen>
          <View style={styles.fatalScreen}>
            <ActivityIndicator size="large" color={HiveColors.green} />
          </View>
        </Screen>
      );
  }
}

const styles = StyleSheet.create({
  stepScreenContent: {
    backgroundColor: HiveColors.card,
  },
  stepBody: {
    paddingHorizontal: 24,
    paddingBottom: 32,
    gap: 12,
  },
  topBar: {
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 16,
    gap: 10,
  },
  topBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  topBarLabel: {
    flex: 1,
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    color: HiveColors.textSecondary,
  },
  topBarSpacer: {
    width: 20,
  },
  topBarSignOut: {
    fontSize: 13,
    fontWeight: '600',
    color: HiveColors.textSecondary,
    paddingVertical: 4,
    paddingLeft: 8,
  },
  progressTrack: {
    flexDirection: 'row',
    height: 6,
    borderRadius: 3,
    backgroundColor: HiveColors.border,
    overflow: 'hidden',
  },
  progressFill: {
    backgroundColor: HiveColors.green,
    borderRadius: 3,
  },
  stepTitle: {
    fontSize: 26,
    fontWeight: '700',
    color: HiveColors.text,
    marginBottom: 4,
  },
  stepSubtitle: {
    fontSize: 15,
    color: HiveColors.textSecondary,
    marginBottom: 12,
    lineHeight: 21,
  },
  stepFootnote: {
    fontSize: 13,
    color: HiveColors.textSecondary,
    textAlign: 'center',
    marginTop: 4,
  },
  optionsList: {
    gap: 12,
  },
  nextButton: {
    marginTop: 12,
  },
  comingSoonBadge: {
    backgroundColor: HiveColors.greenLight,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  comingSoonText: {
    fontSize: 11,
    fontWeight: '700',
    color: HiveColors.green,
  },
  financeRow: {
    position: 'relative',
  },
  financeRowMain: {
    paddingRight: 96,
  },
  financeBadgeSlot: {
    position: 'absolute',
    right: 12,
    top: 12,
  },
  tileGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  tile: {
    width: '22%',
    aspectRatio: 1,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: HiveColors.border,
    backgroundColor: HiveColors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileSelected: {
    borderColor: HiveColors.green,
    backgroundColor: HiveColors.greenLight,
  },
  tileText: {
    fontSize: 17,
    fontWeight: '700',
    color: HiveColors.text,
  },
  tileTextSelected: {
    color: HiveColors.green,
  },
  photoHeader: {
    alignItems: 'center',
    gap: 4,
    marginBottom: 8,
  },
  photoCircle: {
    width: 148,
    height: 148,
    borderRadius: 74,
    alignSelf: 'center',
    marginVertical: 12,
    overflow: 'hidden',
  },
  photoImage: {
    width: '100%',
    height: '100%',
  },
  photoPlaceholder: {
    flex: 1,
    borderRadius: 74,
    borderWidth: 1.5,
    borderColor: HiveColors.border,
    borderStyle: 'dashed',
    backgroundColor: HiveColors.white,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  photoPlaceholderText: {
    fontSize: 13,
    color: HiveColors.textSecondary,
    fontWeight: '600',
  },
  allSetScreen: {
    flex: 1,
    paddingHorizontal: 24,
    paddingBottom: 32,
  },
  allSetCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 18,
  },
  allSetCheckCircle: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: HiveColors.greenLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  allSetTitle: {
    fontSize: 26,
    fontWeight: '700',
    color: HiveColors.text,
  },
  allSetFooter: {
    gap: 12,
  },
  permissionScreen: {
    flex: 1,
    paddingHorizontal: 24,
    paddingBottom: 32,
    paddingTop: 24,
  },
  permissionCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  permissionTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: HiveColors.text,
    textAlign: 'center',
  },
  permissionSubtitle: {
    fontSize: 15,
    color: HiveColors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  permissionFooter: {
    gap: 12,
  },
  zipInput: {
    width: '100%',
    borderWidth: 1.5,
    borderColor: HiveColors.border,
    borderRadius: 14,
    backgroundColor: HiveColors.white,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 17,
    color: HiveColors.text,
    textAlign: 'center',
    marginTop: 8,
  },
  fatalScreen: {
    flex: 1,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
});
