// Shared Hive Plus sheet: the honest "coming soon" state for subscription.
//
// Product decision: purchases are scaffolded only — no purchase flow is
// active. Both the Account screen's "Manage Subscription" row and the
// Settings screen's "Hive Plus" row open this sheet instead of selling
// something that doesn't exist yet. This is deliberately NOT a paywall.

import { Text, View, StyleSheet } from 'react-native';
import { AppButton, ModalSheet, uiText } from '@/components/hive-ui';
import { sharedStyles } from '@/features/app/app-shared';

export function SubscriptionSheet({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  return (
    <ModalSheet visible={visible} onClose={onClose}>
      <View style={styles.sheet}>
        <Text style={uiText.subtitle}>Hive Plus</Text>
        <Text style={uiText.muted}>You&apos;re on the free plan.</Text>
        <Text style={sharedStyles.helperText}>
          Free includes 5 AI meal plans and 5 video imports a month, 10 single-meal
          generations a month, and 10 Penny questions a day. Hive Plus will add
          more of each — purchases aren&apos;t available yet.
        </Text>
        <AppButton title="Close" variant="secondary" onPress={onClose} />
      </View>
    </ModalSheet>
  );
}

const styles = StyleSheet.create({
  sheet: { gap: 12, paddingHorizontal: 4, paddingBottom: 8 },
});
