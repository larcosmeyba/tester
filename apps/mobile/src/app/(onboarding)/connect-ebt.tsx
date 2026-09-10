import { router } from 'expo-router';

import { ConnectEbtStep } from '@/features/onboarding/onboarding-screens';

export default function ConnectEbtRoute() {
  return <ConnectEbtStep onNext={() => router.push('/(onboarding)/finance-topics')} onBack={() => router.back()} />;
}
