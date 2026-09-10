import { router } from 'expo-router';

import { useOnboardingDraft } from '@/features/onboarding/onboarding-context';
import { BudgetStep } from '@/features/onboarding/onboarding-screens';

export default function BudgetRoute() {
  const draft = useOnboardingDraft();
  return <BudgetStep value={draft.budgetDollars} onChange={draft.setBudgetDollars} onNext={() => router.push('/(onboarding)/connect-ebt')} />;
}
