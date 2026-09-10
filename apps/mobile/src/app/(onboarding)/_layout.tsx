import { Stack } from 'expo-router';

import { OnboardingDraftProvider } from '@/features/onboarding/onboarding-context';

export default function OnboardingLayout() {
  return (
    <OnboardingDraftProvider>
      <Stack screenOptions={{ headerShown: false }} />
    </OnboardingDraftProvider>
  );
}
