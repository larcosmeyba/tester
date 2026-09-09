import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import { deletePushToken, registerPushToken } from '@/features/profile/profile-repository';

const storedPushTokenKey = 'helpthehive.expoPushToken';
const androidChannelId = 'default';

export type PushRegistrationResult =
  | { status: 'registered' }
  | { status: 'permission-denied'; message: string }
  | { status: 'unavailable'; message: string };

async function configureAndroidChannel() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(androidChannelId, {
    name: 'Help The Hive reminders',
    importance: Notifications.AndroidImportance.DEFAULT,
  });
}

async function expoProjectId() {
  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (typeof projectId !== 'string' || !projectId) {
    throw new Error('The Expo project ID is not configured.');
  }
  return projectId;
}

async function obtainAndRegisterToken() {
  const token = (await Notifications.getExpoPushTokenAsync({ projectId: await expoProjectId() })).data;
  const platform = Platform.OS === 'ios' ? 'IOS' : Platform.OS === 'android' ? 'ANDROID' : 'WEB';
  await registerPushToken(token, platform);
  await SecureStore.setItemAsync(storedPushTokenKey, token);
}

export async function requestNotificationPermission() {
  await configureAndroidChannel();
  const existing = await Notifications.getPermissionsAsync();
  if (existing.granted) return true;
  return (await Notifications.requestPermissionsAsync()).granted;
}

export async function requestAndRegisterPushToken(): Promise<PushRegistrationResult> {
  try {
    if (!(await requestNotificationPermission())) {
      return { status: 'permission-denied', message: 'Notification preferences were saved, but system permission was not granted.' };
    }
    await obtainAndRegisterToken();
    return { status: 'registered' };
  } catch (error) {
    return {
      status: 'unavailable',
      message: `Notification preferences were saved, but push registration is unavailable. ${error instanceof Error ? error.message : ''}`.trim(),
    };
  }
}

export async function refreshPushTokenIfPermitted(): Promise<PushRegistrationResult | null> {
  try {
    await configureAndroidChannel();
    const permission = await Notifications.getPermissionsAsync();
    if (!permission.granted) return null;
    await obtainAndRegisterToken();
    return { status: 'registered' };
  } catch (error) {
    return {
      status: 'unavailable',
      message: `Push registration is unavailable. ${error instanceof Error ? error.message : ''}`.trim(),
    };
  }
}

export async function unregisterStoredPushToken() {
  const token = await SecureStore.getItemAsync(storedPushTokenKey);
  if (!token) return;
  await deletePushToken(token);
  await SecureStore.deleteItemAsync(storedPushTokenKey);
}

/**
 * Renewal push taps.
 *
 * The server sends renewal reminders with deliberately generic titles and
 * bodies — program names never leave the app on a push (and with the discreet
 * lock-screen preference on, even the generic "benefits" wording is replaced
 * by a neutral reminder). The detail the app needs travels in the data
 * payload for deep-linking only. The server sends the kind under the `kind`
 * key (`apps/server/internal/modules/benefits/renewals.go`); `type` is
 * accepted as a fallback.
 *
 *   { kind: 'benefits_renewal', renewalId: '<id>', program: 'SNAP', state: 'MO' }
 *
 * program/state are present for logging context only; the screen re-fetches
 * the renewal by id rather than trusting the payload.
 */
export type BenefitsRenewalPushData = {
  kind: 'benefits_renewal';
  renewalId: string;
  program?: string;
  state?: string;
};

export function parseBenefitsRenewalPush(data: unknown): BenefitsRenewalPushData | null {
  if (typeof data !== 'object' || data === null) return null;
  const record = data as Record<string, unknown>;
  // The server sends `kind`; accept the older `type` key as a fallback.
  const kind = record.kind ?? record.type;
  if (kind !== 'benefits_renewal') return null;
  if (typeof record.renewalId !== 'string' || record.renewalId === '') return null;
  return {
    kind: 'benefits_renewal',
    renewalId: record.renewalId,
    program: typeof record.program === 'string' ? record.program : undefined,
    state: typeof record.state === 'string' ? record.state : undefined,
  };
}

/**
 * Fired when the user taps a notification. Register once at the root layout;
 * the handler deep-links into the renewal detail when the payload is a
 * renewal reminder and ignores everything else.
 */
export function addNotificationResponseListener(
  listener: (response: Notifications.NotificationResponse) => void,
) {
  return Notifications.addNotificationResponseReceivedListener(listener);
}

/**
 * The tap that opened the app from a quit state, if any. Checked once on
 * launch so a cold start from a renewal push still lands on the renewal.
 */
export async function getLastNotificationResponse() {
  return Notifications.getLastNotificationResponseAsync();
}
