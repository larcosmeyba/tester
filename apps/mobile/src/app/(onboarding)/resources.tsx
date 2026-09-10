import { router } from 'expo-router';

import { useOnboardingDraft } from '@/features/onboarding/onboarding-context';
import { ResourcesStep } from '@/features/onboarding/onboarding-screens';

export default function ResourcesRoute() {
  const draft = useOnboardingDraft();
  return (
    <ResourcesStep
      selected={draft.resources}
      onToggle={draft.toggleResource}
      onNext={() => router.push('/(onboarding)/benefits')}
      onBack={() => router.back()}
    />
  );
}
