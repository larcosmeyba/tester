// Account and settings screens.
//
// Extracted verbatim from app-root.tsx; markup unchanged. These are the screens
// that already talk to the real backend through features/profile/profile-repository.

import * as ImagePicker from 'expo-image-picker';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Image, Linking, Pressable, Text, View } from 'react-native';
import { useAuth } from '@/auth/auth-context';
import { AppButton, AppHeader, AppTextField, AvatarButton, HiveIcon, ScrollScreen, StatBadge, uiText, type HiveIconName } from '@/components/hive-ui';
import { requestAndRegisterPushToken, unregisterStoredPushToken } from '@/features/notifications/notification-service';
import { deleteViewerData, HandleUpdateError, type HandleAvailability } from '@/features/profile/profile-repository';
import { updateBenefitsRenewalPreferences } from '@/features/benefits/benefits-repository';
import { useAppState } from '@/state/app-state';
import { StyleSheet } from 'react-native';
import { sharedStyles } from '@/features/app/app-shared';
import { type Navigation } from '@/features/app/navigation-types';
import { HiveColors, Radii } from '@/constants/theme';

/**
 * Settings — the Figma settings surface (profile header, stat cards, grouped
 * rows, Sign Out / Delete Account). This is the screen the Figma set calls
 * "Settings"; the older intermediate "App Settings" screen had no Figma
 * counterpart and was removed.
 */
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
      <View style={settingsStyles.backRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={nav.back}
          style={({ pressed }) => [settingsStyles.backButton, pressed && sharedStyles.pressed]}>
          <HiveIcon name="back" size={22} color={HiveColors.text} />
        </Pressable>
      </View>

      <View style={settingsStyles.profileHeader}>
        <AvatarButton imageUri={app.profile.profileImageUri} onPress={() => nav.push('editProfile')} size={64} />
        <View style={sharedStyles.flexOne}>
          <Text style={settingsStyles.profileName}>{name}</Text>
          <Text style={sharedStyles.miniMuted}>{auth.user?.email ?? ''}</Text>
          <Pressable onPress={() => nav.push('editProfile')}>
            <Text style={sharedStyles.greenLink}>Edit Profile</Text>
          </Pressable>
        </View>
      </View>

      <View style={settingsStyles.statRow}>
        <StatBadge value="June 12, 2011" label="MEMBER SINCE" />
        <StatBadge value="$847.30" label="TOTAL SAVED" />
        <StatBadge value="142" label="MEALS PLANNED" />
      </View>

      <AccountSection title="ACCOUNT" />
      <View style={settingsStyles.group}>
        <SettingsRow icon="user" title="Edit Profile" onPress={() => nav.push('editProfile')} />
        <SettingsRow icon="chat" title="Public Handle" subtitle={app.profile.handle ? `@${app.profile.handle}` : 'Choose a handle'} onPress={() => nav.push('editHandle')} />
        <SettingsRow icon="send" title="Login Email" subtitle={auth.user?.email ?? ''} onPress={() => nav.push('changeEmail')} />
        <SettingsRow icon="card" title="Connected EBT Card" badge="Plaid — Beta" onPress={() => nav.push('connectAccount')} last />
      </View>

      <AccountSection title="PREFERENCES" />
      <View style={settingsStyles.group}>
        <SettingsRow icon="bell" title="Notification Settings" onPress={() => nav.push('notifications')} />
        <SettingsRow icon="dollar" title="Budget Settings" onPress={() => nav.push('budgetSettings')} last />
      </View>

      <AccountSection title="SUPPORT" />
      <View style={settingsStyles.group}>
        <SettingsRow icon="chat" title="Send Feedback" onPress={() => nav.push('feedback')} />
        <SettingsRow icon="info" title="About Help The Hive" onPress={() => Linking.openURL('https://helpthehive.com')} last />
      </View>

      <View style={settingsStyles.actions}>
        {app.profileSyncError ? (
          <>
            <Text style={sharedStyles.authError}>{app.profileSyncError}</Text>
            <AppButton title="Retry Profile Sync" variant="plain" onPress={() => void app.hydrateViewer()} />
          </>
        ) : null}
        {signOutError ? <Text style={sharedStyles.authError}>{signOutError}</Text> : null}
        <AppButton title="Sign Out" variant="secondary" onPress={() => void signOut()} />
        <AppButton title="Delete Account" variant="danger" onPress={() => nav.push('deleteAccount')} />
      </View>
    </ScrollScreen>
  );
}

/** A Figma settings row: green icon tile, title, optional subtitle/badge, chevron. */
export function SettingsRow({
  icon,
  title,
  subtitle,
  badge,
  onPress,
  last = false,
}: {
  icon: HiveIconName;
  title: string;
  subtitle?: string;
  badge?: string;
  onPress?: () => void;
  last?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => [settingsStyles.row, !last && settingsStyles.rowDivider, pressed && sharedStyles.pressed]}>
      <View style={settingsStyles.rowIcon}>
        <HiveIcon name={icon} size={18} color={HiveColors.greenDark} />
      </View>
      <View style={sharedStyles.flexOne}>
        <Text style={settingsStyles.rowTitle}>{title}</Text>
        {subtitle ? <Text style={sharedStyles.miniMuted}>{subtitle}</Text> : null}
      </View>
      {badge ? (
        <View style={settingsStyles.rowBadge}>
          <Text style={settingsStyles.rowBadgeText}>{badge}</Text>
        </View>
      ) : (
        <HiveIcon name="next" size={14} color={HiveColors.textSecondary} />
      )}
    </Pressable>
  );
}

const settingsStyles = StyleSheet.create({
  backRow: { paddingHorizontal: 12, paddingTop: 4 },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 16,
  },
  profileName: { color: HiveColors.text, fontSize: 20, fontWeight: '800' },
  statRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 20, paddingBottom: 8 },
  group: { paddingHorizontal: 20 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 13,
  },
  rowDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: HiveColors.border },
  rowIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#E6F4EA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowTitle: { color: HiveColors.text, fontSize: 16, fontWeight: '600' },
  rowBadge: {
    backgroundColor: '#E6F4EA',
    borderRadius: Radii.pill,
    paddingVertical: 5,
    paddingHorizontal: 10,
  },
  rowBadgeText: { color: HiveColors.greenDark, fontSize: 12, fontWeight: '700' },
  actions: { paddingHorizontal: 20, paddingTop: 24, gap: 12 },
});

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

/**
 * Edit Profile — the Figma profile editor: avatar with camera badge, labeled
 * fields, a household-size stepper, and Save Changes.
 */
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
    if (!firstName.trim() || !lastName.trim()) {
      setSaveError('Enter your first and last name.');
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
        householdSize,
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
      <View style={editProfileStyles.avatarWrap}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Change profile photo"
          onPress={() => void pickImage()}
          style={({ pressed }) => [pressed && sharedStyles.pressed]}>
          <View style={editProfileStyles.avatarRing}>
            {imageUri ? (
              <Image source={{ uri: imageUri }} style={editProfileStyles.avatarImage} />
            ) : (
              <View style={editProfileStyles.avatarFallback}>
                <HiveIcon name="user" size={44} color={HiveColors.textSecondary} />
              </View>
            )}
          </View>
          <View style={editProfileStyles.cameraBadge}>
            <HiveIcon name="camera" size={16} color={HiveColors.white} />
          </View>
        </Pressable>
      </View>

      <View style={sharedStyles.formScreen}>
        <AppTextField label="First Name" value={firstName} onChangeText={setFirstName} placeholder="Sam" />
        <AppTextField label="Last Name" value={lastName} onChangeText={setLastName} placeholder="Chavez" />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Change login email"
          onPress={() => nav.push('changeEmail')}>
          <View style={editProfileStyles.fieldWrap}>
            <Text style={editProfileStyles.fieldLabel}>Email Address</Text>
            <View style={editProfileStyles.readonlyField}>
              <Text style={editProfileStyles.readonlyValue}>{auth.user?.email ?? ''}</Text>
              <HiveIcon name="next" size={13} color={HiveColors.textSecondary} />
            </View>
          </View>
        </Pressable>
        <AppTextField label="Phone Number" value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="(818) 555-0142" />
        <AppTextField label="ZIP Code" value={zip} onChangeText={setZip} keyboardType="number-pad" placeholder="91502" />
        <View style={editProfileStyles.fieldWrap}>
          <Text style={editProfileStyles.fieldLabel}>Household Size</Text>
          <View style={editProfileStyles.stepper}>
            <Text style={editProfileStyles.stepperLabel}>{householdSize} {householdSize === 1 ? 'person' : 'people'}</Text>
            <View style={editProfileStyles.stepperButtons}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Decrease household size"
                disabled={householdSize <= 1}
                onPress={() => setHouseholdSize((size) => Math.max(1, size - 1))}
                style={({ pressed }) => [
                  editProfileStyles.stepperButton,
                  householdSize <= 1 && editProfileStyles.stepperButtonDisabled,
                  pressed && sharedStyles.pressed,
                ]}>
                <HiveIcon name="minus" size={14} color={HiveColors.white} />
              </Pressable>
              <Text style={editProfileStyles.stepperCount}>{householdSize}</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Increase household size"
                onPress={() => setHouseholdSize((size) => Math.min(12, size + 1))}
                style={({ pressed }) => [editProfileStyles.stepperButton, pressed && sharedStyles.pressed]}>
                <HiveIcon name="plus" size={14} color={HiveColors.white} />
              </Pressable>
            </View>
          </View>
        </View>
        <Text style={sharedStyles.helperText}>Profile photos are stored on this device until cloud uploads are available.</Text>
        {saveError ? <Text style={sharedStyles.authError}>{saveError}</Text> : null}
        <AppButton title={isSaving ? 'Saving…' : 'Save Changes'} disabled={isSaving} onPress={() => void save()} />
      </View>
    </ScrollScreen>
  );
}

const editProfileStyles = StyleSheet.create({
  avatarWrap: { alignItems: 'center', paddingTop: 12, paddingBottom: 20 },
  avatarRing: {
    width: 112,
    height: 112,
    borderRadius: 56,
    borderWidth: 2.5,
    borderColor: HiveColors.greenDark,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F2F7F3',
  },
  avatarImage: { width: 102, height: 102, borderRadius: 51 },
  avatarFallback: {
    width: 102,
    height: 102,
    borderRadius: 51,
    backgroundColor: '#E4EBE5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cameraBadge: {
    position: 'absolute',
    right: 2,
    bottom: 2,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: HiveColors.greenDark,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2.5,
    borderColor: HiveColors.white,
  },
  fieldWrap: { gap: 6 },
  fieldLabel: { color: HiveColors.text, fontSize: 15, fontWeight: '700' },
  readonlyField: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: HiveColors.border,
    borderRadius: 12,
    paddingVertical: 13,
    paddingHorizontal: 14,
    backgroundColor: HiveColors.white,
  },
  readonlyValue: { color: HiveColors.text, fontSize: 16 },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: HiveColors.border,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: HiveColors.white,
  },
  stepperLabel: { color: HiveColors.text, fontSize: 16 },
  stepperButtons: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stepperButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: HiveColors.greenDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperButtonDisabled: { opacity: 0.4 },
  stepperCount: { color: HiveColors.text, fontSize: 17, fontWeight: '700', minWidth: 20, textAlign: 'center' },
});

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

/**
 * Notification Settings — the Figma grouped toggle list. Toggles apply
 * immediately (the Figma has no save button): the mapped preferences persist
 * through the existing pipeline, and push registration follows whether any
 * toggle is on.
 *
 * NOTE: the Figma showed "Ad-Free Experience" as a locked PREMIUM upsell.
 * Marcos removed the premium treatment (2026-09-10): it is now a standard
 * toggle like the other rows, defaulting on — the app shows no ads.
 */
export function NotificationsScreen({ nav }: { nav: Navigation }) {
  const app = useAppState();

  // Persisted through the existing preferences pipeline:
  const [weeklyPlanReady, setWeeklyPlanReady] = useState(app.preferences.weeklyMealPlanNotificationsEnabled);
  const [expiringItems, setExpiringItems] = useState(app.preferences.expiringPantryNotificationsEnabled);
  const [renewalReminders, setRenewalReminders] = useState(true);
  // Figma-only toggles (no backend field yet — local state for this pass):
  const [dailyReminders, setDailyReminders] = useState(true);
  const [newDeals, setNewDeals] = useState(true);
  const [priceDrops, setPriceDrops] = useState(true);
  const [lowStock, setLowStock] = useState(false);
  const [ebtBalance, setEbtBalance] = useState(true);
  const [adFree, setAdFree] = useState(true);

  const [saveError, setSaveError] = useState('');
  const persistRef = useRef({
    weeklyPlanReady: app.preferences.weeklyMealPlanNotificationsEnabled,
    expiringItems: app.preferences.expiringPantryNotificationsEnabled,
    renewalReminders: true,
    anyOn: true,
  });
  const pushStateRef = useRef(true);
  const savingRef = useRef(false);
  const dirtyRef = useRef(false);

  async function persist() {
    if (savingRef.current) {
      dirtyRef.current = true;
      return;
    }
    savingRef.current = true;
    dirtyRef.current = false;
    setSaveError('');
    try {
      const next = persistRef.current;
      await app.savePreferences({
        notificationsEnabled: next.anyOn,
        expiringPantryNotificationsEnabled: next.expiringItems,
        weeklyMealPlanNotificationsEnabled: next.weeklyPlanReady,
        resourceReminderNotificationsEnabled: app.preferences.resourceReminderNotificationsEnabled,
      });
      // The discreet lock-screen toggle has no Figma counterpart; the
      // existing default (on) is preserved.
      await updateBenefitsRenewalPreferences(next.renewalReminders, true);
      if (next.anyOn !== pushStateRef.current) {
        pushStateRef.current = next.anyOn;
        if (next.anyOn) {
          const result = await requestAndRegisterPushToken();
          if (result.status !== 'registered') setSaveError(result.message);
        } else {
          await unregisterStoredPushToken();
        }
      }
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Unable to save notification preferences.');
    } finally {
      savingRef.current = false;
      if (dirtyRef.current) void persist();
    }
  }

  function update(patch: Partial<{ weeklyPlanReady: boolean; expiringItems: boolean; renewalReminders: boolean; dailyReminders: boolean; newDeals: boolean; priceDrops: boolean; lowStock: boolean; ebtBalance: boolean; adFree: boolean }>) {
    if (patch.weeklyPlanReady !== undefined) setWeeklyPlanReady(patch.weeklyPlanReady);
    if (patch.expiringItems !== undefined) setExpiringItems(patch.expiringItems);
    if (patch.renewalReminders !== undefined) setRenewalReminders(patch.renewalReminders);
    if (patch.dailyReminders !== undefined) setDailyReminders(patch.dailyReminders);
    if (patch.newDeals !== undefined) setNewDeals(patch.newDeals);
    if (patch.priceDrops !== undefined) setPriceDrops(patch.priceDrops);
    if (patch.lowStock !== undefined) setLowStock(patch.lowStock);
    if (patch.ebtBalance !== undefined) setEbtBalance(patch.ebtBalance);
    if (patch.adFree !== undefined) setAdFree(patch.adFree);

    const merged = {
      dailyReminders,
      weeklyPlanReady,
      newDeals,
      priceDrops,
      expiringItems,
      lowStock,
      ebtBalance,
      adFree,
      renewalReminders,
      ...patch,
    };
    const anyOn =
      merged.dailyReminders || merged.weeklyPlanReady || merged.newDeals || merged.priceDrops ||
      merged.expiringItems || merged.lowStock || merged.ebtBalance || merged.renewalReminders;
    persistRef.current = {
      weeklyPlanReady: merged.weeklyPlanReady,
      expiringItems: merged.expiringItems,
      renewalReminders: merged.renewalReminders,
      anyOn,
    };
    void persist();
  }

  return (
    <ScrollScreen>
      <AppHeader title="Notification Settings" onBack={nav.back} />
      <NotificationSection title="MEAL PLANNING">
        <NotificationToggle
          title="Daily Meal Reminders"
          subtitle="Get reminded about your planned meals"
          value={dailyReminders}
          onToggle={() => update({ dailyReminders: !dailyReminders })}
        />
        <NotificationToggle
          title="Weekly Meal Plan Ready"
          subtitle="When your new weekly plan is generated"
          value={weeklyPlanReady}
          onToggle={() => update({ weeklyPlanReady: !weeklyPlanReady })}
          last
        />
      </NotificationSection>
      <NotificationSection title="SAVINGS & DEALS">
        <NotificationToggle
          title="New Deals Available"
          subtitle="When new deals match your preferences"
          value={newDeals}
          onToggle={() => update({ newDeals: !newDeals })}
        />
        <NotificationToggle
          title="Price Drop Alerts"
          subtitle="When items on your list go on sale"
          value={priceDrops}
          onToggle={() => update({ priceDrops: !priceDrops })}
          last
        />
      </NotificationSection>
      <NotificationSection title="ADS">
        <NotificationToggle
          title="Ad-Free Experience"
          subtitle="Hide ads throughout the app"
          value={adFree}
          onToggle={() => update({ adFree: !adFree })}
          last
        />
      </NotificationSection>
      <NotificationSection title="PANTRY">
        <NotificationToggle
          title="Expiring Items"
          subtitle="When pantry items are about to expire"
          value={expiringItems}
          onToggle={() => update({ expiringItems: !expiringItems })}
        />
        <NotificationToggle
          title="Low Stock Alerts"
          subtitle="When you're running low on essentials"
          value={lowStock}
          onToggle={() => update({ lowStock: !lowStock })}
          last
        />
      </NotificationSection>
      <NotificationSection title="BENEFITS">
        <NotificationToggle
          title="EBT Balance Updates"
          subtitle="Monthly balance notifications"
          value={ebtBalance}
          onToggle={() => update({ ebtBalance: !ebtBalance })}
        />
        <NotificationToggle
          title="Benefits Renewal Reminders"
          subtitle="Before your renewal deadline"
          value={renewalReminders}
          onToggle={() => update({ renewalReminders: !renewalReminders })}
          last
        />
      </NotificationSection>
      {saveError ? (
        <View style={notificationStyles.errorWrap}>
          <Text style={sharedStyles.authError}>{saveError}</Text>
        </View>
      ) : null}
    </ScrollScreen>
  );
}

function NotificationSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={notificationStyles.section}>
      <Text style={notificationStyles.sectionTitle}>{title}</Text>
      <View>{children}</View>
    </View>
  );
}

function NotificationToggle({
  title,
  subtitle,
  value,
  onToggle,
  last = false,
}: {
  title: string;
  subtitle: string;
  value: boolean;
  onToggle: () => void;
  last?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: value }}
      accessibilityLabel={title}
      onPress={onToggle}
      style={({ pressed }) => [
        notificationStyles.toggleRow,
        !last && notificationStyles.toggleDivider,
        pressed && sharedStyles.pressed,
      ]}>
      <View style={sharedStyles.flexOne}>
        <Text style={notificationStyles.toggleTitle}>{title}</Text>
        <Text style={notificationStyles.toggleSubtitle}>{subtitle}</Text>
      </View>
      <View style={[notificationStyles.checkbox, value && notificationStyles.checkboxOn]}>
        {value ? <HiveIcon name="check" size={13} color={HiveColors.white} /> : null}
      </View>
    </Pressable>
  );
}

const notificationStyles = StyleSheet.create({
  section: { paddingHorizontal: 20, paddingTop: 18 },
  sectionTitle: {
    color: HiveColors.textSecondary,
    fontSize: 12.5,
    fontWeight: '800',
    letterSpacing: 0.6,
    paddingBottom: 6,
  },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13 },
  toggleDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: HiveColors.border },
  toggleTitle: { color: HiveColors.text, fontSize: 16.5, fontWeight: '700' },
  toggleSubtitle: { color: HiveColors.textSecondary, fontSize: 14, marginTop: 2 },
  checkbox: {
    width: 26,
    height: 26,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: '#D8DCD8',
    backgroundColor: HiveColors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxOn: { borderColor: HiveColors.greenDark, backgroundColor: HiveColors.greenDark },
  errorWrap: { paddingHorizontal: 20, paddingTop: 12 },
});

/**
 * Send Feedback — the Figma feedback form: star rating, category chips, a
 * message field, and the founder note. Still prototype-local: sending returns
 * to the previous screen (no backend ticket yet).
 */
export function FeedbackScreen({ nav }: { nav: Navigation }) {
  const [rating, setRating] = useState(0);
  const [category, setCategory] = useState('Love');
  const [message, setMessage] = useState('');

  return (
    <ScrollScreen keyboard>
      <AppHeader title="Send Feedback" onBack={nav.back} />
      <View style={feedbackStyles.body}>
        <Text style={feedbackStyles.heading}>How&apos;s your experience so far?</Text>

        <View style={feedbackStyles.stars}>
          {[1, 2, 3, 4, 5].map((value) => (
            <Pressable
              key={value}
              accessibilityRole="button"
              accessibilityLabel={`Rate ${value} star${value === 1 ? '' : 's'}`}
              onPress={() => setRating(value)}
              style={({ pressed }) => [feedbackStyles.star, pressed && sharedStyles.pressed]}>
              <HiveIcon
                name="star"
                size={40}
                color={value <= rating ? HiveColors.greenDark : '#D8DCD8'}
              />
            </Pressable>
          ))}
        </View>

        <View style={feedbackStyles.chips}>
          {FEEDBACK_CATEGORIES.map((label) => {
            const selected = category === label;
            return (
              <Pressable
                key={label}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => setCategory(label)}
                style={({ pressed }) => [
                  feedbackStyles.chip,
                  selected && feedbackStyles.chipSelected,
                  pressed && sharedStyles.pressed,
                ]}>
                <Text style={[feedbackStyles.chipText, selected && feedbackStyles.chipTextSelected]}>
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <AppTextField
          label=""
          value={message}
          onChangeText={setMessage}
          placeholder="Tell us more... what do you love, or what would make Help The Hive better?"
          multiline
        />

        <View style={feedbackStyles.founderNote}>
          <HiveIcon name="star" size={16} color={HiveColors.warning} />
          <Text style={feedbackStyles.founderNoteText}>Our founder reads every message</Text>
        </View>

        <AppButton title="Send feedback" disabled={!message.trim()} onPress={nav.back} />
      </View>
    </ScrollScreen>
  );
}

const FEEDBACK_CATEGORIES = ['Idea', 'Bug', 'Love', 'Other'];

const feedbackStyles = StyleSheet.create({
  body: { paddingHorizontal: 20, paddingTop: 8, gap: 20 },
  heading: { color: HiveColors.text, fontSize: 26, fontWeight: '800', letterSpacing: -0.3 },
  stars: { flexDirection: 'row', gap: 10 },
  star: { padding: 2 },
  chips: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  chip: {
    borderWidth: 1.5,
    borderColor: HiveColors.border,
    borderRadius: Radii.pill,
    paddingVertical: 10,
    paddingHorizontal: 20,
    backgroundColor: HiveColors.white,
  },
  chipSelected: { backgroundColor: HiveColors.greenDark, borderColor: HiveColors.greenDark },
  chipText: { color: HiveColors.text, fontSize: 16, fontWeight: '600' },
  chipTextSelected: { color: HiveColors.white },
  founderNote: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  founderNoteText: { color: HiveColors.textSecondary, fontSize: 14 },
});

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
