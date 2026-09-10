import { router } from 'expo-router';

import { useOnboardingDraft } from '@/features/onboarding/onboarding-context';
import { FinanceTopicsStep } from '@/features/onboarding/onboarding-screens';

export default function FinanceTopicsRoute() {
  const draft = useOnboardingDraft();
  return (
    <FinanceTopicsStep
      selected={draft.financeTopics}
      onToggle={draft.toggleFinanceTopic}
      onNext={() => router.push('/(onboarding)/resources')}
      onBack={() => router.back()}
    />
  );
}
