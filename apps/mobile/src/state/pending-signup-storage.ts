import * as SecureStore from 'expo-secure-store';

import type { PendingSignupProfile } from './app-state';

const pendingSignupKey = 'hth_pending_signup_profile';

function isPendingSignupProfile(value: unknown): value is PendingSignupProfile {
  if (!value || typeof value !== 'object') return false;
  const profile = value as Record<string, unknown>;
  return ['email', 'firstName', 'lastName', 'phone'].every((key) => typeof profile[key] === 'string');
}

export async function loadPendingSignupProfile() {
  const raw = await SecureStore.getItemAsync(pendingSignupKey);
  if (!raw) return undefined;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (isPendingSignupProfile(parsed)) return parsed;
  } catch {
    // Invalid pending data is discarded below.
  }
  await SecureStore.deleteItemAsync(pendingSignupKey);
  return undefined;
}

export async function savePendingSignupProfile(profile: PendingSignupProfile) {
  await SecureStore.setItemAsync(pendingSignupKey, JSON.stringify(profile));
}

export async function clearPendingSignupProfile() {
  await SecureStore.deleteItemAsync(pendingSignupKey);
}
