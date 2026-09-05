import { useLocalSearchParams } from 'expo-router';

import AppRoot from '@/features/app/app-root';

export default function Index() {
  const params = useLocalSearchParams<{ screen?: string | string[] }>();
  const screen = typeof params.screen === 'string' && (params.screen === 'login' || params.screen === 'forgot')
    ? params.screen
    : undefined;
  return <AppRoot initialPublicScreen={screen} />;
}
