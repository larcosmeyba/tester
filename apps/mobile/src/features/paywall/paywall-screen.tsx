// Hive Plus paywall screen.
//
// Free tier is fully usable with soft usage limits (see usage-limits.ts):
// upgrade prompts appear only after a limit is actually hit. This screen is
// reachable from the Account screen's "Hive Plus" row and from those
// post-limit prompts — never from the benefits flow.
//
// Purchasing is SCAFFOLDED ONLY: purchasePlus throws a "not wired" error.
// Real in-app purchase needs App Store / Play store configuration and a
// native IAP library, which is not installed (see constraints in the task).

import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { AppButton, AppHeader, HiveIcon, ScrollScreen, uiText, type HiveIconName } from '@/components/hive-ui';
import { sharedStyles } from '@/features/app/app-shared';
import { type Navigation } from '@/features/app/navigation-types';
import { HiveColors, Radii } from '@/constants/theme';
import { StyleSheet } from 'react-native';

export type PlusPlan = 'monthly' | 'annual';

const PLANS: { id: PlusPlan; title: string; price: string; detail: string }[] = [
  { id: 'monthly', title: 'Monthly', price: '$4.99', detail: 'per month, billed monthly' },
  { id: 'annual', title: 'Yearly', price: '$39.99', detail: 'per year — save 33% vs monthly' },
];

/**
 * SCAFFOLD ONLY — not wired to any store.
 *
 * Real IAP requires native store configuration (App Store Connect /
 * Google Play Console products) plus a native purchase library. Do not
 * call this expecting a charge: it throws so a half-wired purchase can
 * never silently succeed or fail.
 */
export async function purchasePlus(plan: PlusPlan): Promise<void> {
  console.log(`[paywall] purchasePlus(${plan}) — not wired: real IAP needs store config`);
  throw new Error('Purchases are not wired up yet — real in-app purchase needs store configuration.');
}

const PLUS_FEATURES: { icon: HiveIconName; text: string }[] = [
  { icon: 'calendar', text: 'Unlimited AI meal planning — build as many weekly plans as you need' },
  { icon: 'box', text: 'Pantry tracking with photo scan and low-stock alerts' },
  { icon: 'wallet', text: 'Grocery budgeting that keeps every week inside your budget' },
  { icon: 'resources', text: 'Benefits info, program cards, and application autofill' },
  { icon: 'penny', text: 'Unlimited Penny assistant — ask anything, any time' },
];

export function PaywallScreen({ nav }: { nav: Navigation }) {
  const [selectedPlan, setSelectedPlan] = useState<PlusPlan>('annual');
  const [error, setError] = useState('');
  const [isWorking, setIsWorking] = useState(false);

  async function startTrial() {
    setError('');
    setIsWorking(true);
    try {
      await purchasePlus(selectedPlan);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Purchase is not available yet.');
    } finally {
      setIsWorking(false);
    }
  }

  return (
    <ScrollScreen>
      <AppHeader title="Hive Plus" onBack={nav.back} />
      <View style={paywallStyles.body}>
        <View style={paywallStyles.hero}>
          <HiveIcon name="sparkle" size={44} color={HiveColors.yellowDark} />
          <Text style={uiText.title}>Hive Plus</Text>
          <Text style={[uiText.muted, sharedStyles.centerText]}>
            Everything in Help The Hive, without limits. Start with a 7-day free trial — cancel any time.
          </Text>
        </View>

        <View style={paywallStyles.plans}>
          {PLANS.map((plan) => {
            const selected = plan.id === selectedPlan;
            return (
              <Pressable
                key={plan.id}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => setSelectedPlan(plan.id)}
                style={({ pressed }) => [paywallStyles.planCard, selected && paywallStyles.planCardSelected, pressed && sharedStyles.pressed]}>
                <View style={paywallStyles.planHeader}>
                  <Text style={paywallStyles.planTitle}>{plan.title}</Text>
                  <View style={[paywallStyles.radio, selected && paywallStyles.radioSelected]}>
                    {selected ? <HiveIcon name="check" size={12} color={HiveColors.white} /> : null}
                  </View>
                </View>
                <Text style={paywallStyles.planPrice}>{plan.price}</Text>
                <Text style={sharedStyles.miniMuted}>{plan.detail}</Text>
              </Pressable>
            );
          })}
        </View>

        <View style={paywallStyles.features}>
          {PLUS_FEATURES.map((feature) => (
            <View key={feature.text} style={paywallStyles.featureRow}>
              <View style={paywallStyles.featureIcon}>
                <HiveIcon name={feature.icon} size={18} color={HiveColors.greenDark} />
              </View>
              <Text style={paywallStyles.featureText}>{feature.text}</Text>
            </View>
          ))}
        </View>

        {error ? <Text style={sharedStyles.authError}>{error}</Text> : null}

        <AppButton title="Start 7-day free trial" onPress={() => void startTrial()} disabled={isWorking} style={sharedStyles.fullWidth} />
        <Text style={[sharedStyles.miniMuted, sharedStyles.centerText]}>
          Free for 7 days, then {selectedPlan === 'annual' ? '$39.99/year' : '$4.99/month'}. No ads, ever. Cancel any time.
        </Text>
      </View>
    </ScrollScreen>
  );
}

const paywallStyles = StyleSheet.create({
  body: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 32, gap: 20 },
  hero: { alignItems: 'center', gap: 8, paddingTop: 8 },
  plans: { gap: 12 },
  planCard: {
    borderWidth: 1.5,
    borderColor: HiveColors.border,
    borderRadius: Radii.lg,
    padding: 16,
    gap: 4,
    backgroundColor: HiveColors.white,
  },
  planCardSelected: { borderColor: HiveColors.greenDark, backgroundColor: '#EAF6EE' },
  planHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  planTitle: { color: HiveColors.text, fontSize: 16, fontWeight: '700' },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: HiveColors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioSelected: { borderColor: HiveColors.greenDark, backgroundColor: HiveColors.greenDark },
  planPrice: { color: HiveColors.text, fontSize: 24, fontWeight: '800' },
  features: { gap: 12 },
  featureRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  featureIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#E6F4EA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureText: { color: HiveColors.text, fontSize: 14, fontWeight: '500', flex: 1 },
});
