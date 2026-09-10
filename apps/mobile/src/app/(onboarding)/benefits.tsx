import { router } from 'expo-router';

import { useOnboardingDraft } from '@/features/onboarding/onboarding-context';
import { BenefitsStep } from '@/features/onboarding/onboarding-screens';

export default function BenefitsRoute() {
  const draft = useOnboardingDraft();
  return (
    <BenefitsStep
      value={draft.wantsGovAssistance}
      onChange={draft.setWantsGovAssistance}
      onNext={() => router.push('/(onboarding)/profile-photo')}
      onBack={() => router.back()}
    />
  );
}
