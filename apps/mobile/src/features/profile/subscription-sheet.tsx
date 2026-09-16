/**
 * Hive Plus paywall sheet (RevenueCat).
 *
 * - Shows the Hive Free vs Hive Plus comparison, monthly ($4.99) and annual
 *   ($39.99, "Save 33%") plans, and the 7-day free trial on both.
 * - Purchase goes through `Purchases.purchasePackage` on the RevenueCat
 *   default offering; restore via `Purchases.restorePurchases()`.
 * - When the RevenueCat SDK isn't configured yet (no public keys), the same
 *   UI renders with static package data (preview mode) so it can be
 *   screenshotted — the purchase button stays honest about it.
 * - Government benefits assistance is always free and is never paywalled.
 */
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppButton, ModalSheet, PennyImage, uiText } from '@/components/hive-ui';
import { HiveColors, Spacing } from '@/constants/theme';
import {
  PLUS_TRIAL_LABEL,
  getPlusOffering,
  purchasePlus,
  restorePlus,
  type PlusPackage,
} from '@/features/subscriptions/revenuecat';
import { usePlusStatus } from '@/features/subscriptions/use-plus-status';

const pennySource = require('@/assets/images/hive/penny.png');

/** Marcos-approved Hive Free allowances (2026-09-15); Hive Plus is unlimited AI. */
const COMPARISON_ROWS: { label: string; free: string; plus: string }[] = [
  { label: 'AI meal plans', free: '4 / month', plus: 'Unlimited' },
  { label: 'Video imports', free: '4 / month', plus: 'Unlimited' },
  { label: 'URL imports', free: '5 / month', plus: 'Unlimited' },
  { label: 'Single-meal generations', free: '10 / month', plus: 'Unlimited' },
  { label: 'Penny conversations', free: '60 / month', plus: 'Unlimited' },
  { label: 'Benefits assistance', free: 'Free', plus: 'Free' },
];

export function SubscriptionSheet({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const { isPlus, isLoading: statusLoading, refresh } = usePlusStatus();
  const [offering, setOffering] = useState<{ packages: PlusPackage[]; live: boolean } | null>(null);
  const [selectedId, setSelectedId] = useState<'monthly' | 'annual'>('annual');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  /* eslint-disable react-hooks/set-state-in-effect -- one-shot sheet-open fetch:
     plans + Plus status load once each time the paywall opens. */
  useEffect(() => {
    if (!visible) return;
    setMessage(null);
    setOffering(null);
    getPlusOffering().then(setOffering);
    refresh();
  }, [visible, refresh]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const selected =
    offering?.packages.find((p) => p.id === selectedId) ?? offering?.packages[0] ?? null;

  async function handlePurchase() {
    if (!selected || busy) return;
    setBusy(true);
    setMessage(null);
    const outcome = await purchasePlus(selected);
    setBusy(false);
    if (outcome === 'purchased') {
      await refresh();
    } else if (outcome === 'cancelled') {
      // Backed out of the store sheet — stay on the paywall, no message needed.
    } else if (outcome === 'unavailable') {
      setMessage('Checkout isn\u2019t connected yet — this is a preview. Purchases go live in the next update.');
    } else {
      setMessage('Something went wrong with the purchase. Please try again.');
    }
  }

  async function handleRestore() {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    const active = await restorePlus();
    await refresh();
    setBusy(false);
    setMessage(
      active ? 'Your Hive Plus purchase was restored.' : 'No previous Hive Plus purchase was found.'
    );
  }

  return (
    <ModalSheet visible={visible} onClose={onClose}>
      <View style={styles.sheet}>
        {statusLoading ? (
          <Text style={uiText.muted}>Checking your plan…</Text>
        ) : isPlus ? (
          <>
            <PennyImage source={pennySource} size={72} />
            <Text style={uiText.subtitle}>You&apos;re on Hive Plus</Text>
            <Text style={[uiText.muted, styles.centerText]}>
              Unlimited AI meal plans, Penny conversations, and imports are active.
            </Text>
            <AppButton title="Close" variant="secondary" onPress={onClose} style={styles.fullWidth} />
          </>
        ) : (
          <>
            <PennyImage source={pennySource} size={72} />
            <Text style={uiText.subtitle}>Hive Plus</Text>
            <Text style={[uiText.muted, styles.centerText]}>
              Unlimited AI. Everything else stays free.
            </Text>

            <View style={styles.compareCard}>
              <View style={styles.compareHeader}>
                <Text style={[styles.compareCell, styles.compareLabel]} />
                <Text style={[styles.compareCell, styles.compareHead]}>Free</Text>
                <Text style={[styles.compareCell, styles.compareHead, styles.comparePlus]}>Plus</Text>
              </View>
              {COMPARISON_ROWS.map((row) => (
                <View key={row.label} style={styles.compareRow}>
                  <Text style={[styles.compareCell, styles.compareLabel]}>{row.label}</Text>
                  <Text style={[styles.compareCell, styles.compareValue]}>{row.free}</Text>
                  <Text style={[styles.compareCell, styles.compareValue, styles.comparePlus]}>
                    {row.plus}
                  </Text>
                </View>
              ))}
            </View>
            <Text style={[uiText.small, styles.centerText]}>
              Government benefits assistance is always free — it&apos;s never paywalled.
            </Text>

            {offering ? (
              <View style={styles.plans}>
                {offering.packages.map((pkg) => {
                  const isSelected = pkg.id === selected?.id;
                  return (
                    <Pressable
                      key={pkg.id}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: isSelected }}
                      onPress={() => setSelectedId(pkg.id)}
                      style={[styles.planCard, isSelected && styles.planCardSelected]}>
                      <View style={styles.planTop}>
                        <Text style={styles.planTitle}>{pkg.title}</Text>
                        {pkg.badge ? (
                          <View style={styles.badge}>
                            <Text style={styles.badgeText}>{pkg.badge}</Text>
                          </View>
                        ) : null}
                      </View>
                      <Text style={styles.planPrice}>
                        {pkg.priceLabel} <Text style={styles.planCadence}>{pkg.cadenceLabel}</Text>
                      </Text>
                      <Text style={uiText.small}>
                        {PLUS_TRIAL_LABEL}, then {pkg.priceLabel} {pkg.cadenceLabel}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : (
              <Text style={uiText.muted}>Loading plans…</Text>
            )}

            {message ? <Text style={[uiText.small, styles.message]}>{message}</Text> : null}

            <AppButton
              title={busy ? 'Processing…' : 'Start free trial'}
              onPress={handlePurchase}
              disabled={busy || !selected}
              style={styles.fullWidth}
            />
            <AppButton
              title="Restore purchases"
              variant="secondary"
              onPress={handleRestore}
              disabled={busy}
              style={styles.fullWidth}
            />
            <AppButton title="Not now" variant="plain" onPress={onClose} />
            <Text style={[uiText.small, styles.centerText]}>
              Payment is charged to your App Store or Google Play account. Cancel anytime.
            </Text>
          </>
        )}
      </View>
    </ModalSheet>
  );
}

const styles = StyleSheet.create({
  sheet: { gap: Spacing.two, paddingHorizontal: 4, paddingBottom: 8, alignItems: 'center' },
  fullWidth: { alignSelf: 'stretch' },
  centerText: { textAlign: 'center' },
  compareCard: {
    alignSelf: 'stretch',
    backgroundColor: HiveColors.card,
    borderRadius: 14,
    padding: Spacing.two,
  },
  compareHeader: { flexDirection: 'row', paddingBottom: 6 },
  compareRow: {
    flexDirection: 'row',
    paddingVertical: 5,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: HiveColors.border,
  },
  compareCell: { flex: 1, fontSize: 13 },
  compareLabel: { flex: 1.6, color: HiveColors.text },
  compareHead: { fontWeight: '700', color: HiveColors.textSecondary, textAlign: 'center' },
  compareValue: { color: HiveColors.textSecondary, textAlign: 'center' },
  comparePlus: { color: HiveColors.green, fontWeight: '700' },
  plans: { alignSelf: 'stretch', gap: Spacing.two },
  planCard: {
    borderWidth: 1.5,
    borderColor: HiveColors.border,
    borderRadius: 14,
    padding: Spacing.two,
    gap: 4,
    backgroundColor: HiveColors.card,
  },
  planCardSelected: { borderColor: HiveColors.green },
  planTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  planTitle: { fontSize: 16, fontWeight: '700', color: HiveColors.text },
  planPrice: { fontSize: 20, fontWeight: '800', color: HiveColors.text },
  planCadence: { fontSize: 14, fontWeight: '400', color: HiveColors.textSecondary },
  badge: {
    backgroundColor: HiveColors.green,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  badgeText: { color: HiveColors.white, fontSize: 12, fontWeight: '700' },
  message: { textAlign: 'center', color: HiveColors.danger },
});
