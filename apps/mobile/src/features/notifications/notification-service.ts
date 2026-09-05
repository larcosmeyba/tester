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
