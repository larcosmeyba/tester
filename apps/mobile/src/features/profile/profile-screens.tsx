// Account and settings screens.
//
// Swift-matched rebuild of Marcos's MyAccountView sandbox: profile header with
// real-data-only stats, ACCOUNT / PREFERENCES / PRIVACY & LEGAL / SUPPORT
// sections, quiet Sign Out, red-text Delete Account with a destructive
// two-step confirm, and a "Version X (Build Y)" footer. The screens below
// talk to the real backend through features/profile/profile-repository.

import Constants from 'expo-constants';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { useEffect, useState } from 'react';
import { Alert, Linking, Platform, Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { useAuth } from '@/auth/auth-context';
import { AppButton, AppHeader, AppTextField, AvatarButton, HiveIcon, InfoRow, ScrollScreen, StatBadge, uiText } from '@/components/hive-ui';
import { PRIVACY_URL, TERMS_URL } from '@/constants/legal';
import { requestAndRegisterPushToken, unregisterStoredPushToken } from '@/features/notifications/notification-service';
import { deleteViewerData, HandleUpdateError, type HandleAvailability } from '@/features/profile/profile-repository';
import {
  DELETE_ACCOUNT_ALERT_MESSAGE,
  DELETE_ACCOUNT_ALERT_TITLE,
  DELETE_ACCOUNT_CONFIRM_LABEL,
  formatAppVersion,
} from '@/features/profile/account-helpers';
import { HomeZipSheet } from '@/features/profile/home-zip-sheet';
import { SubscriptionSheet } from '@/features/profile/subscription-sheet';
import { updateBenefitsRenewalPreferences } from '@/features/benefits/benefits-repository';
import { isAnalyticsConfigured } from '@/features/analytics/vexo-client';
import { SensitiveScreen } from '@/features/analytics/sensitive-screen';
import { useAppState } from '@/state/app-state';
import { sharedStyles } from '@/features/app/app-shared';
import { type Navigation } from '@/features/app/navigation-types';
import { HiveColors } from '@/constants/theme';

export function AccountScreen({ nav }: { nav: Navigation }) {
  const app = useAppState();
  const auth = useAuth();
  const [signOutError, setSignOutError] = useState('');
  const [showSubscription, setShowSubscription] = useState(false);
  const [showZipSheet, setShowZipSheet] = useState(false);
  const homeZip = app.profile.zip.trim();

  const expoConfig = Constants.expoConfig;
  const nativeBuild = Platform.OS === 'ios' ? expoConfig?.ios?.buildNumber : expoConfig?.android?.versionCode;
  const versionLabel = formatAppVersion({ version: expoConfig?.version, build: nativeBuild });

  async function signOut() {
    setSignOutError('');
    try {
      try {
        await unregisterStoredPushToken();
      } catch {
        // Signing out must not be blocked by best-effort push-token cleanup.
      }
      await auth.signOut();
      nav.reset('login');
    } catch (error) {
      setSignOutError(error instanceof Error ? error.message : 'Unable to sign out.');
    }
  }

  function confirmDeleteAccount() {
    Alert.alert(DELETE_ACCOUNT_ALERT_TITLE, DELETE_ACCOUNT_ALERT_MESSAGE, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: DELETE_ACCOUNT_CONFIRM_LABEL,
        style: 'destructive',
        // Step two is the existing password-confirmed DeleteAccountScreen,
        // which performs the real backend deletion — this alert is the gate.
        onPress: () => nav.push('deleteAccount'),
      },
    ]);
  }

  return (
    <ScrollScreen>
      <AppHeader title="My Account" right={<Pressable accessibilityRole="button" accessibilityLabel="Settings" onPress={() => nav.push('settings')} style={styles.iconButtonPlain}><HiveIcon name="gear" size={18} /></Pressable>} />
      {/* Profile header — the avatar taps through to Edit Profile. Masked out of session replays (name + email). */}
      <SensitiveScreen style={styles.accountHeader}>
        <AvatarButton imageUri={app.profile.profileImageUri} onPress={() => nav.push('editProfile')} size={58} />
        <View style={sharedStyles.flexOne}>
          <Text style={styles.accountName}>{app.displayName}</Text>
          <Text style={sharedStyles.miniMuted}>{auth.user?.email ?? ''}</Text>
        </View>
      </SensitiveScreen>
      {/*
        Stats row — real values only. MEMBER SINCE comes from the viewer's
        actual account creation date and hides until the viewer hydrates.
        MEALS PLANNED is intentionally absent: no backend aggregate exists
        for a lifetime count, so the old hardcoded number is gone rather
        than shown as a guess.
      */}
      {app.memberSinceLabel ? (
        <View style={styles.accountStats}>
          <StatBadge value={app.memberSinceLabel} label="MEMBER SINCE" />
        </View>
      ) : null}
      <AccountSection title="ACCOUNT" />
      <InfoRow icon="user" title="Edit Profile" onPress={() => nav.push('editProfile')} />
      {/*
        Purchases are scaffolded only — this opens the honest "coming soon"
        sheet, never a paywall.
      */}
      <InfoRow icon="crown" title="Manage Subscription" onPress={() => setShowSubscription(true)} />
      <AccountSection title="PREFERENCES" />
      <InfoRow icon="bell" title="Notification Settings" onPress={() => nav.push('notifications')} />
      <InfoRow icon="dollar" title="Budget Settings" onPress={() => nav.push('budgetSettings')} />
      {/*
        The ZIP lives on the profile — the same store the Resources tab reads
        as its location fallback when permission is denied. "Not set" until
        the user saves one.
      */}
      {/* The ZIP is personal data — masked out of session replays. */}
      <SensitiveScreen>
        <InfoRow
          icon="map"
          title="Home ZIP Code"
          value={homeZip || 'Not set'}
          onPress={() => setShowZipSheet(true)}
        />
      </SensitiveScreen>
      <AccountSection title="PRIVACY & LEGAL" />
      <InfoRow icon="shield" title="Privacy Policy" onPress={() => void Linking.openURL(PRIVACY_URL)} />
      <InfoRow icon="doc" title="Terms of Service" onPress={() => void Linking.openURL(TERMS_URL)} />
      <AccountSection title="SUPPORT" />
      <InfoRow icon="chat" title="Send Feedback" onPress={() => nav.push('feedback')} />
      <InfoRow icon="info" title="About Help The Hive" onPress={() => void Linking.openURL('https://www.helpthehive.com/about')} />
      <View style={styles.accountFooter}>
        {app.profileSyncError ? (
          <>
            <Text style={sharedStyles.authError}>{app.profileSyncError}</Text>
            <AppButton title="Retry Profile Sync" variant="plain" onPress={() => void app.hydrateViewer()} />
          </>
        ) : null}
        {signOutError ? <Text style={sharedStyles.authError}>{signOutError}</Text> : null}
        <AppButton
          title="Sign Out"
          variant="secondary"
          onPress={() => void signOut()}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Delete Account"
          onPress={confirmDeleteAccount}
          style={styles.deleteAccountPress}
        >
          <Text style={styles.deleteAccountText}>Delete Account</Text>
        </Pressable>
        <Text style={styles.versionText}>{versionLabel}</Text>
      </View>
      <SubscriptionSheet visible={showSubscription} onClose={() => setShowSubscription(false)} />
      <HomeZipSheet visible={showZipSheet} onClose={() => setShowZipSheet(false)} />
    </ScrollScreen>
  );
}

export function DeleteAccountScreen({ nav }: { nav: Navigation }) {
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
      // Delete from the auth service FIRST. If this fails, the API data
      // is still intact and the user can retry. (Deleting API data first
      // leaves the email locked in auth with no way to recover.)
      await auth.deleteAccount(password);
      await deleteViewerData();
      nav.reset('login');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to delete your account.');
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <ScrollScreen keyboard>
      <AppHeader title="Delete Account" onBack={nav.back} />
      <View style={sharedStyles.formScreen}>
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
        {errorMessage ? <Text style={sharedStyles.authError}>{errorMessage}</Text> : null}
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

export function EditHandleScreen({ nav }: { nav: Navigation }) {
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
      <View style={sharedStyles.formScreen}>
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
        <Text style={availability?.available ? sharedStyles.greenLink : sharedStyles.helperText}>
          {isChecking ? 'Checking availability…' : handleAvailabilityMessage(availability)}
        </Text>
        {error ? <Text style={sharedStyles.authError}>{error}</Text> : null}
        <AppButton title={isSaving ? 'Saving…' : 'Save Handle'} disabled={!canSave} onPress={() => void save()} />
      </View>
    </ScrollScreen>
  );
}

export function EditProfileScreen({ nav }: { nav: Navigation }) {
  const app = useAppState();
  const auth = useAuth();
  const [firstName, setFirstName] = useState(app.profile.firstName);
  const [lastName, setLastName] = useState(app.profile.lastName);
  const [phone, setPhone] = useState(app.profile.phone);
  const [zip, setZip] = useState(app.profile.zip);
  const [householdSize, setHouseholdSize] = useState(Math.max(1, app.profile.householdSize || 1));
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
    if (!firstName.trim() || !lastName.trim() || householdSize < 1) {
      setSaveError('Enter your first and last name and a valid household size.');
      return;
    }
    setIsSaving(true);
    setSaveError('');
    try {
      // profileImageUri is sent to the backend so the choice persists with
      // the account; display keeps using the device-local URI below.
      await app.saveProfile({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        phone: phone.trim(),
        zip: zip.trim(),
        householdSize,
        profileImageUri: imageUri ?? null,
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
      {/* Name, email, phone, ZIP: masked out of session replays. */}
      <SensitiveScreen style={styles.editProfileBody}>
        {/* Profile photo — tap to choose from the photo library. */}
        <View style={styles.photoWrap}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Change profile photo"
            onPress={pickImage}
            style={styles.photoPress}
          >
            <AvatarButton imageUri={imageUri} onPress={pickImage} size={90} />
            <View style={styles.cameraBadge}>
              <HiveIcon name="camera" size={13} color="#FFFFFF" />
            </View>
          </Pressable>
          {imageUri ? (
            <Pressable accessibilityRole="button" onPress={() => setImageUri(undefined)}>
              <Text style={styles.removePhotoText}>Remove photo</Text>
            </Pressable>
          ) : null}
        </View>
        <ProfileField label="First Name" value={firstName} onChangeText={setFirstName} />
        <ProfileField label="Last Name" value={lastName} onChangeText={setLastName} />
        {/*
          The login email is an auth identity, not a profile field — it changes
          through the Login Email flow, never here, so it renders read-only.
        */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Change login email"
          onPress={() => nav.push('changeEmail')}
        >
          <ProfileField label="Email Address" value={auth.user?.email ?? ''} onChangeText={() => {}} editable={false} />
        </Pressable>
        <ProfileField label="Phone Number" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
        <ProfileField label="ZIP Code" value={zip} onChangeText={setZip} keyboardType="number-pad" />
        <View style={styles.fieldWrap}>
          <Text style={styles.fieldLabel}>Household Size</Text>
          <View style={styles.stepperShell}>
            <Text style={styles.stepperLabel}>{householdSize === 1 ? '1 person' : `${householdSize} people`}</Text>
            <View style={styles.stepperControls}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Decrease household size"
                disabled={householdSize <= 1}
                onPress={() => setHouseholdSize((current) => Math.max(1, current - 1))}
                style={styles.stepperButton}
              >
                <Text style={[styles.stepperGlyph, householdSize <= 1 && styles.stepperGlyphDisabled]}>−</Text>
              </Pressable>
              <Text style={styles.stepperValue}>{householdSize}</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Increase household size"
                disabled={householdSize >= 20}
                onPress={() => setHouseholdSize((current) => Math.min(20, current + 1))}
                style={styles.stepperButton}
              >
                <Text style={[styles.stepperGlyph, householdSize >= 20 && styles.stepperGlyphDisabled]}>+</Text>
              </Pressable>
            </View>
          </View>
        </View>
        <Text style={sharedStyles.helperText}>Profile photos are stored on this device until cloud uploads are available.</Text>
        {saveError ? <Text style={sharedStyles.authError}>{saveError}</Text> : null}
        <AppButton title={isSaving ? 'Saving…' : 'Save Changes'} disabled={isSaving} onPress={() => void save()} />
      </SensitiveScreen>
    </ScrollScreen>
  );
}

/** Swift ProfileField: label above a white, bordered input. */
function ProfileField({
  label,
  value,
  onChangeText,
  keyboardType,
  editable = true,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  keyboardType?: 'default' | 'number-pad' | 'phone-pad' | 'email-address';
  editable?: boolean;
}) {
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={[styles.fieldShell, !editable && styles.fieldShellReadonly]}>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          keyboardType={keyboardType}
          editable={editable}
          placeholderTextColor={HiveColors.placeholder}
          style={styles.fieldInput}
        />
      </View>
    </View>
  );
}

export function ChangeEmailScreen({ nav }: { nav: Navigation }) {
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
      {/* Current + new email: masked out of session replays. */}
      <SensitiveScreen style={sharedStyles.formScreen}>
        <Text style={uiText.subtitle}>Change your login email</Text>
        <Text style={uiText.muted}>Current email: {auth.user?.email ?? ''}</Text>
        <AppTextField label="New email" value={newEmail} onChangeText={setNewEmail} placeholder="you@example.com" keyboardType="email-address" />
        {message ? <Text style={isError ? sharedStyles.authError : uiText.muted}>{message}</Text> : null}
        <AppButton
          title={isSubmitting ? 'Sending confirmation…' : 'Change Login Email'}
          disabled={!newEmail.includes('@') || newEmail.trim().toLowerCase() === auth.user?.email.toLowerCase() || isSubmitting}
          onPress={() => void submit()}
        />
      </SensitiveScreen>
    </ScrollScreen>
  );
}

export function SettingsScreen({ nav }: { nav: Navigation }) {
  const app = useAppState();
  const [showSubscription, setShowSubscription] = useState(false);
  const [locationBusy, setLocationBusy] = useState(false);

  const locationStatus = app.preferences.locationPermissionStatus;
  const locationLabel =
    locationStatus === 'granted' ? 'Allowed' : locationStatus === 'denied' ? 'Denied' : 'Not set';

  async function handleLocationPress() {
    if (locationBusy) return;
    // Once denied, the OS will not show the native prompt again — the user
    // has to flip it back in system settings. Never a fake in-app toggle.
    if (locationStatus === 'denied') {
      await Linking.openSettings();
      return;
    }
    setLocationBusy(true);
    try {
      const result = await Location.requestForegroundPermissionsAsync();
      await app.savePreferences({
        locationPermissionStatus: result.granted ? 'granted' : 'denied',
      });
    } catch {
      // Fail-open: keep showing the last known status.
    } finally {
      setLocationBusy(false);
    }
  }

  return (
    <ScrollScreen>
      <AppHeader title="App Settings" onBack={nav.back} />
      <AccountSection title="PROFILE" />
      <InfoRow
        icon="user"
        title="Edit Profile"
        subtitle="Name, photo, phone, ZIP, household"
        onPress={() => nav.push('editProfile')}
      />
      <InfoRow
        icon="chat"
        title="Public Handle"
        subtitle={app.profile.handle ? `@${app.profile.handle}` : 'Choose a handle'}
        onPress={() => nav.push('editHandle')}
      />
      <AccountSection title="NOTIFICATIONS & COMMUNICATION" />
      <InfoRow
        icon="bell"
        title="Notification Settings"
        subtitle="Meal, pantry, resource, and benefits reminders"
        onPress={() => nav.push('notifications')}
      />
      {/*
        Phone-call consent is collected during signup and written to the
        backend via updateCommunicationConsents, but the backend Consent type
        does not expose it yet (Slice 1 TODO: add phoneCallConsent to Consent
        and select it in the Viewer query). Display-only until the read path
        exists — no toggle that writes nowhere.
      */}
      <InfoRow
        title="Phone call consent"
        subtitle="Managed at signup — changes coming soon"
      />
      <AccountSection title="LOCATION" />
      <InfoRow
        icon="map"
        title="Location access"
        subtitle={locationBusy ? 'Requesting…' : `${locationLabel} — used for nearby resources`}
        onPress={handleLocationPress}
      />
      <AccountSection title="PRIVACY & TERMS" />
      <InfoRow
        icon="shield"
        title="Terms of Service"
        onPress={() => void Linking.openURL(TERMS_URL)}
      />
      <InfoRow
        icon="shield"
        title="Privacy Policy"
        onPress={() => void Linking.openURL(PRIVACY_URL)}
      />
      <AccountSection title="ANALYTICS" />
      {/*
        Vexo engagement analytics + session replay. OFF by default; the user
        opts in here. Sensitive screens (benefits, onboarding, profile) are
        always masked out of replays, and text inputs are masked by default.
        The toggle renders disabled until a Vexo API key is provisioned for
        the build (EXPO_PUBLIC_VEXO_API_KEY) — no toggle that writes nowhere.
      */}
      <SettingsToggleRow
        title="Analytics"
        subtitle={
          isAnalyticsConfigured()
            ? 'Anonymous usage analytics and session replays help improve the app. Sensitive screens are always masked. Turn off anytime.'
            : 'Not available in this build yet'
        }
        value={app.analyticsConsentGranted && isAnalyticsConfigured()}
        disabled={!isAnalyticsConfigured()}
        onValueChange={(value) => void app.setAnalyticsConsent(value)}
      />
      <AccountSection title="SUBSCRIPTION" />
      {/*
        Hive Plus purchase is scaffolded only — no purchase flow is active.
        This row states the plan honestly instead of selling something that
        doesn't exist yet.
      */}
      <InfoRow
        icon="card"
        title="Hive Plus"
        subtitle="Free plan — purchases coming soon"
        onPress={() => setShowSubscription(true)}
      />
      <SubscriptionSheet visible={showSubscription} onClose={() => setShowSubscription(false)} />
    </ScrollScreen>
  );
}

export function NotificationsScreen({ nav }: { nav: Navigation }) {
  const app = useAppState();
  const [enabled, setEnabled] = useState(app.preferences.notificationsEnabled);
  const [pantry, setPantry] = useState(app.preferences.expiringPantryNotificationsEnabled);
  const [meals, setMeals] = useState(app.preferences.weeklyMealPlanNotificationsEnabled);
  const [resources, setResources] = useState(app.preferences.resourceReminderNotificationsEnabled);
  // Benefits renewal preferences live on the server (defaults on) and are
  // saved via their own mutation; there is no local copy until first save.
  const [renewalAlerts, setRenewalAlerts] = useState(true);
  const [discreetLockScreen, setDiscreetLockScreen] = useState(true);
  const [emailUpdates, setEmailUpdates] = useState(app.preferences.emailMarketingOptIn);
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
        emailMarketingOptIn: emailUpdates,
      });
      await updateBenefitsRenewalPreferences(renewalAlerts, discreetLockScreen);
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
      {/*
        Only real, server-backed preferences are listed here. The Swift
        sandbox's premium-locked "Ad-Free Experience" upsell is intentionally
        absent: there is no paywall in this app, and a toggle that writes
        nowhere would be dishonest.
      */}
      <AccountSection title="NOTIFICATIONS" />
      <SettingsToggleRow
        title="Enable notifications"
        subtitle="Master switch"
        value={enabled}
        onValueChange={setEnabled}
      />
      <AccountSection title="MEAL PLANNING" />
      <SettingsToggleRow
        title="Weekly meal planning"
        subtitle="When your new weekly plan is generated"
        value={meals}
        onValueChange={setMeals}
      />
      <AccountSection title="PANTRY" />
      <SettingsToggleRow
        title="Expiring pantry items"
        subtitle="When pantry items are about to expire"
        value={pantry}
        onValueChange={setPantry}
      />
      <AccountSection title="BENEFITS" />
      <SettingsToggleRow
        title="Benefits renewal reminders"
        subtitle="Before your certification period ends"
        value={renewalAlerts}
        onValueChange={setRenewalAlerts}
      />
      <SettingsToggleRow
        title="Discreet lock-screen notifications"
        subtitle="Keeps program names off your lock screen"
        value={discreetLockScreen}
        onValueChange={setDiscreetLockScreen}
      />
      <AccountSection title="COMMUNITY" />
      <SettingsToggleRow
        title="Resource reminders"
        subtitle="When new resources are added in your area"
        value={resources}
        onValueChange={setResources}
      />
      <AccountSection title="EMAIL" />
      <SettingsToggleRow
        title="Email updates"
        subtitle="Product news and offers from Help The Hive"
        value={emailUpdates}
        onValueChange={setEmailUpdates}
      />
      <View style={styles.saveBar}>
        {saveMessage ? <Text style={uiText.muted}>{saveMessage}</Text> : null}
        {saveError ? <Text style={sharedStyles.authError}>{saveError}</Text> : null}
        <AppButton title={isSaving ? 'Saving…' : 'Save Changes'} disabled={isSaving} onPress={() => void save()} />
      </View>
    </ScrollScreen>
  );
}

/** Swift toggle row: title + subtitle on the left, green switch on the right. */
function SettingsToggleRow({
  title,
  subtitle,
  value,
  disabled = false,
  onValueChange,
}: {
  title: string;
  subtitle?: string;
  value: boolean;
  disabled?: boolean;
  onValueChange: (value: boolean) => void;
}) {
  return (
    <View style={styles.toggleRow}>
      <View style={sharedStyles.flexOne}>
        <Text style={styles.toggleTitle}>{title}</Text>
        {subtitle ? <Text style={styles.toggleSubtitle}>{subtitle}</Text> : null}
      </View>
      <Switch
        value={value}
        disabled={disabled}
        onValueChange={onValueChange}
        trackColor={{ false: HiveColors.border, true: HiveColors.green }}
        thumbColor={HiveColors.white}
        ios_backgroundColor={HiveColors.border}
      />
    </View>
  );
}

export function FeedbackScreen({ nav }: { nav: Navigation }) {
  return (
    <ScrollScreen>
      <AppHeader title="Send Feedback" onBack={nav.back} />
      <View style={styles.feedbackBody}>
        <Text style={uiText.subtitle}>Help shape Help The Hive</Text>
        {/*
          There is no in-app feedback ticket yet, so there is no text field
          that goes nowhere — feedback goes to the real support inbox.
        */}
        <Text style={uiText.muted}>
          In-app feedback isn&apos;t wired up yet. Email us and a human will read it.
        </Text>
        <AppButton
          title="Email support@helpthehive.com"
          onPress={() => void Linking.openURL('mailto:support@helpthehive.com')}
        />
        <AppButton title="Back" variant="plain" onPress={nav.back} />
      </View>
    </ScrollScreen>
  );
}

export function AccountSection({ title }: { title: string }) {
  return <Text style={styles.accountSection}>{title}</Text>;
}

export function handleAvailabilityMessage(availability: HandleAvailability | null) {
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

const styles = StyleSheet.create({
  accountHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 16,
  },
  accountName: {
    color: HiveColors.text,
    fontSize: 18,
    fontWeight: '800',
  },
  accountSection: {
    color: HiveColors.textSecondary,
    fontSize: 12,
    fontWeight: '800',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 4,
  },
  accountStats: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 20,
    paddingBottom: 18,
  },
  accountFooter: {
    gap: 20,
    paddingHorizontal: 20,
    paddingTop: 36,
    paddingBottom: 40,
  },
  deleteAccountPress: {
    alignItems: 'center',
    paddingVertical: 4,
  },
  deleteAccountText: {
    color: '#D92D20',
    fontSize: 14,
    fontWeight: '500',
  },
  versionText: {
    color: HiveColors.textSecondary,
    opacity: 0.7,
    fontSize: 12,
    textAlign: 'center',
  },
  editProfileBody: {
    gap: 20,
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 40,
  },
  photoWrap: {
    alignItems: 'center',
    gap: 10,
    paddingBottom: 4,
  },
  photoPress: {
    position: 'relative',
  },
  cameraBadge: {
    position: 'absolute',
    right: 2,
    bottom: 2,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: HiveColors.green,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removePhotoText: {
    color: HiveColors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  fieldWrap: {
    gap: 6,
  },
  fieldLabel: {
    color: HiveColors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  fieldShell: {
    backgroundColor: HiveColors.white,
    borderColor: HiveColors.border,
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 52,
    justifyContent: 'center',
  },
  fieldShellReadonly: {
    opacity: 0.75,
  },
  fieldInput: {
    color: HiveColors.text,
    fontSize: 16,
  },
  stepperShell: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: HiveColors.white,
    borderColor: HiveColors.border,
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 52,
  },
  stepperLabel: {
    color: HiveColors.text,
    fontSize: 16,
    flex: 1,
  },
  stepperControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  stepperButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperGlyph: {
    color: HiveColors.green,
    fontSize: 26,
    fontWeight: '600',
    lineHeight: 28,
  },
  stepperGlyphDisabled: {
    color: HiveColors.border,
  },
  stepperValue: {
    color: HiveColors.text,
    fontSize: 17,
    fontWeight: '600',
    minWidth: 22,
    textAlign: 'center',
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  toggleTitle: {
    color: HiveColors.text,
    fontSize: 16,
  },
  toggleSubtitle: {
    color: HiveColors.textSecondary,
    fontSize: 13,
    marginTop: 2,
  },
  saveBar: {
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 40,
  },
  feedbackBody: {
    gap: 16,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 40,
  },
  iconButtonPlain: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
