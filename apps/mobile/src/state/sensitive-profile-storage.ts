import * as SecureStore from 'expo-secure-store';

import type { AppProfile, GovernmentProfile } from './app-state';

// Personally identifying profile data (name, phone, zip, income, employment,
// housing) must never sit in unencrypted AsyncStorage, so it is persisted in
// the OS keychain / EncryptedSharedPreferences via expo-secure-store instead.
// The expo-secure-store config plugin already excludes these values from
// Android auto-backup.
const sensitiveProfilesKey = 'hth_sensitive_profiles';

export type SensitiveProfiles = {
  profile: AppProfile;
  governmentProfile: GovernmentProfile;
};

function isSensitiveProfiles(value: unknown): value is SensitiveProfiles {
  if (!value || typeof value !== 'object') return false;
  const profiles = value as Record<string, unknown>;
  return (
    !!profiles.profile &&
    typeof profiles.profile === 'object' &&
    !!profiles.governmentProfile &&
    typeof profiles.governmentProfile === 'object'
  );
}

export async function loadSensitiveProfiles(): Promise<SensitiveProfiles | undefined> {
  const raw = await SecureStore.getItemAsync(sensitiveProfilesKey);
  if (!raw) return undefined;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (isSensitiveProfiles(parsed)) return parsed;
  } catch {
    // Invalid sensitive data is discarded below.
  }
  await SecureStore.deleteItemAsync(sensitiveProfilesKey);
  return undefined;
}

export async function saveSensitiveProfiles(profiles: SensitiveProfiles) {
  await SecureStore.setItemAsync(sensitiveProfilesKey, JSON.stringify(profiles));
}

export async function clearSensitiveProfiles() {
  await SecureStore.deleteItemAsync(sensitiveProfilesKey);
}
