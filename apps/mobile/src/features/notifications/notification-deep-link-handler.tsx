/**
 * Deep-links notification taps into the app.
 *
 * Rendered once in the root layout. It handles both the warm case (a
 * notification response while the app runs) and the cold case (the tap that
 * launched the app from a quit state).
 *
 * - Renewal reminders ({ type: 'benefits_renewal', ... }) go through
 *   expo-router paths; anything else is ignored so other notification types
 *   keep their own handlers.
 * - Questionnaire drop-off reminders ({ kind: 'benefits_questionnaire', ... })
 *   target AppRoot's custom nav stack, which expo-router can't reach, so the
 *   parsed payload is stashed via setPendingQuestionnaireDeepLink and AppRoot
 *   consumes it.
 */
import { useEffect } from 'react';
import { useRouter } from 'expo-router';

import {
  addNotificationResponseListener,
  getLastNotificationResponse,
  parseBenefitsRenewalPush,
  parseQuestionnaireReminderPush,
} from '@/features/notifications/notification-service';
import { setPendingQuestionnaireDeepLink } from '@/features/notifications/pending-deep-link';

export function NotificationDeepLinkHandler() {
  const router = useRouter();

  useEffect(() => {
    const openRenewal = (renewalId: string) => {
      router.push(`/resources/benefits-renewals?renewalId=${encodeURIComponent(renewalId)}`);
    };

    const handleResponse = (data: unknown) => {
      const renewal = parseBenefitsRenewalPush(data);
      if (renewal) {
        openRenewal(renewal.renewalId);
        return;
      }
      const questionnaire = parseQuestionnaireReminderPush(data);
      if (questionnaire) {
        setPendingQuestionnaireDeepLink(questionnaire);
      }
    };

    let alive = true;
    // Cold start: the tap that opened the app from a quit state.
    getLastNotificationResponse()
      .then((response) => {
        if (!alive || !response) return;
        handleResponse(response.notification.request.content.data);
      })
      .catch(() => undefined);

    const subscription = addNotificationResponseListener((response) => {
      handleResponse(response.notification.request.content.data);
    });

    return () => {
      alive = false;
      subscription.remove();
    };
  }, [router]);

  return null;
}
