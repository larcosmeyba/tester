/**
 * INTERIM — audit Section 3, slice 3b owns the full Page 4.
 *
 * This is the landing screen when the group questionnaire finishes: the
 * applications have been refilled and the user is told Penny is preparing
 * them. Slice 3b replaces this with the complete Page 4 ("Penny is preparing
 * your applications", progress, the Penny-working-at-computer asset, then
 * auto-advance to Page 5 "Your applications are ready").
 *
 * It exists now so slice 3a's Page 3 has a real route to land on instead of a
 * dead end.
 */
import { ActivityIndicator, Image, StyleSheet, Text, View } from 'react-native';

import { Screen } from '@/components/hive-ui';
import { HiveColors, Spacing } from '@/constants/theme';
import { type Navigation } from '@/features/app/navigation-types';

// TODO (slice 3b): use the real Penny-working-at-computer asset from Marcos's
// screenshots. That image is still missing from the repo (known missing
// asset); penny-money.png is a stand-in.
const pennySource = require('@/assets/images/hive/penny-money.png');

export function BenefitsPreparingScreen({ nav }: { nav: Navigation }) {
  void nav;
  return (
    <Screen>
      <View style={styles.body}>
        <Image source={pennySource} style={styles.penny} resizeMode="contain" />
        <ActivityIndicator size="large" color={HiveColors.green} style={styles.spinner} />
        <Text style={styles.title}>Penny is preparing your applications.</Text>
        <Text style={styles.subtitle}>
          We&apos;re filling in your forms with the information you provided.
        </Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.four,
    backgroundColor: HiveColors.white,
  },
  penny: { width: 140, height: 140, marginBottom: Spacing.three },
  spinner: { marginBottom: Spacing.three },
  title: { fontSize: 24, fontWeight: '800', color: HiveColors.text, textAlign: 'center', marginBottom: Spacing.two },
  subtitle: { fontSize: 15, color: HiveColors.textSecondary, textAlign: 'center' },
});
