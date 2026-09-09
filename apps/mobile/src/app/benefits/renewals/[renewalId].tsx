/**
 * Handles the literal deep link `helpthehive://benefits/renewals/<renewalId>`.
 *
 * Renewal pushes carry the renewal id in their data payload; the notification
 * response handler navigates straight to the in-app route. This file exists so
 * the same URL also resolves when it arrives as a real link (from an email,
 * a shared link, or a push that includes the URL). It redirects into the
 * benefits renewals screen, which opens the renewal detail.
 */
import { Redirect, useLocalSearchParams } from 'expo-router';

export default function BenefitsRenewalDeepLink() {
  const { renewalId } = useLocalSearchParams<{ renewalId?: string }>();
  return (
    <Redirect
      href={
        renewalId
          ? `/resources/benefits-renewals?renewalId=${encodeURIComponent(renewalId)}`
          : '/resources/benefits-renewals'
      }
    />
  );
}
