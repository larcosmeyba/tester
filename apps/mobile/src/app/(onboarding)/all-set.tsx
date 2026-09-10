import { router } from 'expo-router';

import { AllSetStep } from '@/features/onboarding/onboarding-screens';

export default function AllSetRoute() {
  return <AllSetStep onNext={() => router.push('/(onboarding)/permissions')} />;
}
