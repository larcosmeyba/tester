/**
 * Deep-links renewal push taps into the renewal detail screen.
 *
 * Rendered once in the root layout. It handles both the warm case (a
 * notification response while the app runs) and the cold case (the tap that
 * launched the app from a quit state). The payload is expected to be
 * { type: 'benefits_renewal', renewalId, program, state }; anything else is
 * ignored so other notification types keep their own handlers.
 */
import { useEffect } from 'react';
import { useRouter } from 'expo-router';

import {
  addNotificationResponseListener,
  getLastNotificationResponse,
  parseBenefitsRenewalPush,
} from '@/features/notifications/notification-service';

export function NotificationDeepLinkHandler() {
  const router = useRouter();

  useEffect(() => {
    const openRenewal = (renewalId: string) => {
      router.push(`/resources/benefits-renewals?renewalId=${encodeURIComponent(renewalId)}`);
    };

    let alive = true;
    // Cold start: the tap that opened the app from a quit state.
    getLastNotificationResponse()
      .then((response) => {
        if (!alive || !response) return;
        const renewal = parseBenefitsRenewalPush(response.notification.request.content.data);
        if (renewal) openRenewal(renewal.renewalId);
      })
      .catch(() => undefined);

    const subscription = addNotificationResponseListener((response) => {
      const renewal = parseBenefitsRenewalPush(response.notification.request.content.data);
      if (renewal) openRenewal(renewal.renewalId);
    });

    return () => {
      alive = false;
      subscription.remove();
    };
  }, [router]);

  return null;
}
