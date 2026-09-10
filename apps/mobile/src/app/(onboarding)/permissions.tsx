import * as Location from 'expo-location';
import { useState } from 'react';

import { useOnboardingDraft } from '@/features/onboarding/onboarding-context';
import { LocationPermissionStep, NotificationsPermissionStep } from '@/features/onboarding/onboarding-screens';
import { requestNotificationPermission } from '@/features/notifications/notification-service';

export default function PermissionsRoute() {
  const draft = useOnboardingDraft();
  const [stage, setStage] = useState<'notifications' | 'location'>('notifications');

  async function enableNotifications() {
    try {
      const granted = await requestNotificationPermission();
      draft.setNotificationsEnabled(granted);
      draft.setStatusMessage(
        granted ? 'Notification permission enabled.' : 'Notifications skipped. You can enable them later.',
      );
    } catch {
      draft.setNotificationsEnabled(false);
      draft.setStatusMessage('Push notifications are unavailable in Expo Go. You can enable them in a development build.');
    }
    setStage('location');
  }

  async function allowLocation() {
    const result = await Location.requestForegroundPermissionsAsync();
    draft.setStatusMessage(result.granted ? 'Location permission enabled.' : 'Location skipped. You can enable it later.');
    await draft.finish();
  }

  if (stage === 'notifications') {
    return (
      <NotificationsPermissionStep
        onPrimary={() => void enableNotifications()}
        onSecondary={() => {
          draft.setNotificationsEnabled(false);
          setStage('location');
        }}
        busy={draft.isFinishing}
      />
    );
  }

  return (
    <LocationPermissionStep
      message={draft.finishError || draft.statusMessage}
      onPrimary={() => void allowLocation()}
      onSecondary={() => void draft.finish()}
      busy={draft.isFinishing}
    />
  );
}
