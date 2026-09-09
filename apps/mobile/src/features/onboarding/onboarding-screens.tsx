// The onboarding flow and its permission steps.
//
// Extracted verbatim from app-root.tsx; markup unchanged.

import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { type ReactNode, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { AppButton, AvatarButton, CheckboxRow, Chip, HiveIcon, type HiveIconName, ProgressBar, Screen, ScrollScreen, SelectionRow, rowStyles } from '@/components/hive-ui';
import { HiveColors } from '@/constants/theme';
import { refreshPushTokenIfPermitted, requestNotificationPermission } from '@/features/notifications/notification-service';
import { useAppState, type AppPreferences } from '@/state/app-state';
import { StyleSheet } from 'react-native';
import { sharedStyles } from '@/features/app/app-shared';
import { type Navigation } from '@/features/app/navigation-types';

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

export function OnboardingScreen({ nav }: { nav: Navigation }) {
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
        <Text style={sharedStyles.helperText}>You can always change this later in settings.</Text>
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
        <View style={sharedStyles.chipRow}>
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
          {!profileImageUri ? <Text style={sharedStyles.helperText}>Tap to choose</Text> : null}
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

export function OnboardingShell({
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

export function PermissionStep({
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
      <View style={sharedStyles.permissionScreen}>
        <View style={sharedStyles.bigIconCircle}>
          <HiveIcon name={icon} size={38} color={HiveColors.green} />
        </View>
        <Text style={sharedStyles.permissionTitle}>{title}</Text>
        <Text style={sharedStyles.permissionSubtitle}>{subtitle}</Text>
        <View style={styles.flexSpacer} />
        <View style={sharedStyles.fullWidth}>
          <AppButton title={primaryLabel} onPress={onPrimary} />
          <AppButton title={secondaryLabel} variant="plain" onPress={onSecondary} />
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flexSpacer: {
    flex: 1,
    minHeight: 24,
  },
  onboardingBody: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingBottom: 24,
    gap: 12,
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
  stepSubtitle: {
    color: HiveColors.textSecondary,
    fontSize: 15,
    lineHeight: 21,
    marginBottom: 4,
  },
  stepTitle: {
    color: HiveColors.text,
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: 0,
  },
});
