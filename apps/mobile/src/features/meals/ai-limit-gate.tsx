/**
 * The free-tier gate for AI meal features (Audit Section 4).
 *
 * Shown when the user hits their monthly allowance of AI meal plans, video
 * imports, or single-meal generations. Viewing, moving, and checking off
 * meals stay free and never route here.
 *
 * Visual pattern mirrors the Penny paywall sheet. The upgrade button swaps to
 * the honest SubscriptionSheetBody ("purchases aren't available yet") — it
 * never pretends to sell something that doesn't exist.
 */
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AppButton, Card, HiveIcon, PennyImage, uiText } from '@/components/hive-ui';
import { HiveColors, Spacing } from '@/constants/theme';
import type { AiUsage } from '@/features/meals/ai-usage-limits';
import { SubscriptionSheetBody } from '@/features/profile/subscription-sheet';

const pennySource = require('@/assets/images/hive/penny.png');

const GATE_BENEFITS = [
  'More AI meal plans every month',
  'More video imports and single meals',
  'Unlimited Penny conversations',
  'Supports greener AI infrastructure',
];

export function AiLimitGate({ usage, onClose }: { usage: AiUsage; onClose: () => void }) {
  // Purchases aren't live yet: the upgrade button swaps to the honest
  // "coming soon" sheet instead of pretending to sell something.
  const [showPlus, setShowPlus] = useState(false);
  if (showPlus) {
    return <SubscriptionSheetBody onClose={onClose} />;
  }
  return (
    <View style={styles.sheetStack}>
      <PennyImage source={pennySource} size={78} />
      <Text style={uiText.subtitle}>You&apos;ve used your {usage.limit} free {usage.label} this month</Text>
      <Text style={[uiText.muted, styles.centerText]}>
        Your free {usage.label} renew next month. Upgrade to Hive Plus for more AI meal plans,
        video imports, and unlimited Penny conversations.
      </Text>
      <Card style={styles.fullWidth}>
        {GATE_BENEFITS.map((benefit) => (
          <View key={benefit} style={styles.benefitRow}>
            <HiveIcon name="check" size={14} color={HiveColors.green} />
            <Text style={styles.benefitText}>{benefit}</Text>
          </View>
        ))}
      </Card>
      <AppButton
        title="Upgrade to Hive Plus"
        onPress={() => setShowPlus(true)}
        style={styles.fullWidth}
      />
      <AppButton title="Maybe later" variant="plain" onPress={onClose} />
    </View>
  );
}

const styles = StyleSheet.create({
  sheetStack: { gap: Spacing.three, alignItems: 'center', padding: Spacing.three },
  centerText: { textAlign: 'center' },
  fullWidth: { alignSelf: 'stretch' },
  benefitRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  benefitText: { color: HiveColors.text, fontSize: 14 },
});
