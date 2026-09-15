// Account and settings screens.
//
// Extracted verbatim from app-root.tsx; markup unchanged. These are the screens
// that already talk to the real backend through features/profile/profile-repository.

import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { useEffect, useState } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';
import { useAuth } from '@/auth/auth-context';
import { AppButton, AppHeader, AppTextField, AvatarButton, Card, CheckboxRow, HiveIcon, InfoRow, ModalSheet, ScrollScreen, StatBadge, uiText } from '@/components/hive-ui';
import { PRIVACY_URL, PRIVACY_VERSION, TERMS_URL, TERMS_VERSION } from '@/constants/legal';
import { requestAndRegisterPushToken, unregisterStoredPushToken } from '@/features/notifications/notification-service';
import { deleteViewerData, HandleUpdateError, type HandleAvailability } from '@/features/profile/profile-repository';
import { updateBenefitsRenewalPreferences } from '@/features/benefits/benefits-repository';
import { useAppState } from '@/state/app-state';
import { StyleSheet } from 'react-native';
import { sharedStyles } from '@/features/app/app-shared';
import { type Navigation } from '@/features/app/navigation-types';
import { HiveColors } from '@/constants/theme';

export function AccountScreen({ nav }: { nav: Navigation }) {
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
      <AppHeader title="My Account" onBack={nav.back} right={<Pressable accessibilityRole="button" accessibilityLabel="Settings" onPress={() => nav.push('settings')} style={styles.iconButtonPlain}><HiveIcon name="gear" size={18} /></Pressable>} />
      <View style={styles.accountHeader}>
        <AvatarButton imageUri={app.profile.profileImageUri} onPress={() => nav.push('editProfile')} size={58} />
        <View style={sharedStyles.flexOne}>
          <Text style={styles.accountName}>{name}</Text>
          <Text style={sharedStyles.miniMuted}>{auth.user?.email ?? ''}</Text>
          <Pressable onPress={() => nav.push('editProfile')}>
            <Text style={sharedStyles.greenLink}>Edit Profile</Text>
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
      <View style={sharedStyles.formScreen}>
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
        <AppButton title="Delete Account" variant="danger" onPress={() => nav.push('deleteAccount')} />
      </View>
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
      // profileImageUri is sent to the backend so the choice persists with
      // the account; display keeps using the device-local URI below.
      await app.saveProfile({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        phone: phone.trim(),
        zip: zip.trim(),
        householdSize: parsedHouseholdSize,
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
      <View style={sharedStyles.formScreen}>
        <View style={styles.centeredCompact}>
          <AvatarButton imageUri={imageUri} onPress={pickImage} size={90} />
          <AppButton title="Choose Photo" variant="plain" onPress={pickImage} />
        </View>
        {imageUri ? (
          <View style={styles.removePhotoWrap}>
            <AppButton title="Remove photo" variant="plain" onPress={() => setImageUri(undefined)} />
          </View>
        ) : null}
        <AppTextField label="First name" value={firstName} onChangeText={setFirstName} />
        <AppTextField label="Last name" value={lastName} onChangeText={setLastName} />
        <AppTextField label="Phone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
        <AppTextField label="ZIP code" value={zip} onChangeText={setZip} keyboardType="number-pad" />
        <AppTextField label="Household size" value={householdSize} onChangeText={setHouseholdSize} keyboardType="number-pad" />
        <Text style={sharedStyles.helperText}>Profile photos are stored on this device until cloud uploads are available.</Text>
        {saveError ? <Text style={sharedStyles.authError}>{saveError}</Text> : null}
        <AppButton title={isSaving ? 'Saving…' : 'Save Changes'} disabled={isSaving} onPress={() => void save()} />
      </View>
    </ScrollScreen>
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
      <View style={sharedStyles.formScreen}>
        <Text style={uiText.subtitle}>Change your login email</Text>
        <Text style={uiText.muted}>Current email: {auth.user?.email ?? ''}</Text>
        <AppTextField label="New email" value={newEmail} onChangeText={setNewEmail} placeholder="you@example.com" keyboardType="email-address" />
        {message ? <Text style={isError ? sharedStyles.authError : uiText.muted}>{message}</Text> : null}
        <AppButton
          title={isSubmitting ? 'Sending confirmation…' : 'Change Login Email'}
          disabled={!newEmail.includes('@') || newEmail.trim().toLowerCase() === auth.user?.email.toLowerCase() || isSubmitting}
          onPress={() => void submit()}
        />
      </View>
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
      {/*
        TODO: the backend stamps terms/privacy versions + accepted_at at
        signup, but the Viewer query doesn't select them yet, so per-version
        acceptance history can't be displayed. The subtitles below show the
        pinned versions from constants/legal — currently UNAPPROVED
        placeholders (Marcos must approve the real helpthehive.com URLs and
        version numbers before launch).
      */}
      <InfoRow
        icon="shield"
        title="Terms of Service"
        subtitle={`Version ${TERMS_VERSION}`}
        onPress={() => void Linking.openURL(TERMS_URL)}
      />
      <InfoRow
        icon="shield"
        title="Privacy Policy"
        subtitle={`Version ${PRIVACY_VERSION}`}
        onPress={() => void Linking.openURL(PRIVACY_URL)}
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
      <ModalSheet visible={showSubscription} onClose={() => setShowSubscription(false)}>
        <View style={styles.subscriptionSheet}>
          <Text style={uiText.subtitle}>Hive Plus</Text>
          <Text style={uiText.muted}>You&apos;re on the free plan.</Text>
          <Text style={sharedStyles.helperText}>
            Free includes 5 AI meal plans and 5 video imports a month, 10 single-meal
            generations a month, and 10 Penny questions a day. Hive Plus will add
            more of each — purchases aren&apos;t available yet.
          </Text>
          <AppButton title="Close" variant="secondary" onPress={() => setShowSubscription(false)} />
        </View>
      </ModalSheet>
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
      <View style={sharedStyles.formScreen}>
        <CheckboxRow title="Enable notifications" subtitle="Master switch" selected={enabled} onPress={() => setEnabled(!enabled)} />
        <CheckboxRow title="Expiring pantry items" selected={pantry} onPress={() => setPantry(!pantry)} />
        <CheckboxRow title="Weekly meal planning" selected={meals} onPress={() => setMeals(!meals)} />
        <CheckboxRow title="Resource reminders" selected={resources} onPress={() => setResources(!resources)} />
        <CheckboxRow
          title="Benefits renewal reminders"
          subtitle="Remind me before a certification period ends"
          selected={renewalAlerts}
          onPress={() => setRenewalAlerts(!renewalAlerts)}
        />
        <CheckboxRow
          title="Discreet lock-screen notifications"
          subtitle="Keeps program names off your lock screen"
          selected={discreetLockScreen}
          onPress={() => setDiscreetLockScreen(!discreetLockScreen)}
        />
        <CheckboxRow
          title="Email updates"
          subtitle="Product news and offers from Help The Hive"
          selected={emailUpdates}
          onPress={() => setEmailUpdates(!emailUpdates)}
        />
        {saveMessage ? <Text style={uiText.muted}>{saveMessage}</Text> : null}
        {saveError ? <Text style={sharedStyles.authError}>{saveError}</Text> : null}
        <AppButton title={isSaving ? 'Saving…' : 'Save Changes'} disabled={isSaving} onPress={() => void save()} />
      </View>
    </ScrollScreen>
  );
}

export function FeedbackScreen({ nav }: { nav: Navigation }) {
  const [message, setMessage] = useState('');

  return (
    <ScrollScreen keyboard>
      <AppHeader title="Send Feedback" onBack={nav.back} />
      <View style={sharedStyles.formScreen}>
        <Text style={uiText.subtitle}>Help shape Penny</Text>
        <Text style={uiText.muted}>This prototype stores no backend ticket. Use this to verify the feedback screen flow.</Text>
        <AppTextField label="Feedback" value={message} onChangeText={setMessage} placeholder="What should we improve?" multiline />
        <AppButton title="Send Feedback" disabled={!message.trim()} onPress={nav.back} />
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
    paddingTop: 18,
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
  removePhotoWrap: { alignItems: 'center', marginTop: -8, marginBottom: 8 },
  subscriptionSheet: { gap: 12, paddingHorizontal: 4, paddingBottom: 8 },
  centeredCompact: {
    alignItems: 'center',
    gap: 8,
  },
  iconButtonPlain: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
