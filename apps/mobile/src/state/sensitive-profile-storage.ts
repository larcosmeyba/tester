import * as SecureStore from 'expo-secure-store';

import type { AppProfile } from './app-state';

// The app profile (name, phone, zip) must never sit in unencrypted
// AsyncStorage, so it is persisted in the OS keychain /
// EncryptedSharedPreferences via expo-secure-store instead. The
// expo-secure-store config plugin already excludes these values from
// Android auto-backup.
//
// Benefits answers are deliberately not stored on device at all: they live
// on the server, behind the viewer's token, and are fetched by the benefits
// screens when needed.
const sensitiveProfileKey = 'hth_sensitive_profile';
// Key used by the pre-merge security branch, which stored the profile and the
// government profile together. Nobody shipped it, but if it is here its
// profile half is migrated and the whole thing is deleted: benefits answers
// are not kept on device.
const legacySensitiveProfilesKey = 'hth_sensitive_profiles';

function isAppProfile(value: unknown): value is AppProfile {
  if (!value || typeof value !== 'object') return false;
  const profile = value as Record<string, unknown>;
  return typeof profile.firstName === 'string' && typeof profile.lastName === 'string';
}

export async function loadSensitiveProfile(): Promise<AppProfile | undefined> {
  const raw = await SecureStore.getItemAsync(sensitiveProfileKey);
  if (raw) {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (isAppProfile(parsed)) return parsed;
    } catch {
      // Invalid sensitive data is discarded below.
    }
    await SecureStore.deleteItemAsync(sensitiveProfileKey);
    return undefined;
  }
  // One-time migration from the pre-merge layout.
  const legacyRaw = await SecureStore.getItemAsync(legacySensitiveProfilesKey);
  await SecureStore.deleteItemAsync(legacySensitiveProfilesKey);
  if (!legacyRaw) return undefined;
  try {
    const parsed = JSON.parse(legacyRaw) as { profile?: unknown };
    if (isAppProfile(parsed.profile)) {
      await saveSensitiveProfile(parsed.profile);
      return parsed.profile;
    }
  } catch {
    // Nothing usable to migrate.
  }
  return undefined;
}

export async function saveSensitiveProfile(profile: AppProfile) {
  await SecureStore.setItemAsync(sensitiveProfileKey, JSON.stringify(profile));
}

export async function clearSensitiveProfile() {
  await SecureStore.deleteItemAsync(sensitiveProfileKey);
}
