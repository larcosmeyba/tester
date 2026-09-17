/**
 * Shop with Instacart.
 *
 * The handoff belongs on the server: it holds the Instacart partner
 * credentials and builds the cart. This app only ever sends the plan id and
 * opens whatever URL the backend hands back. When the backend reports the
 * integration as not connected yet, the screen offers the affiliate fallback
 * card instead.
 * The primary call-to-action is Instacart's approved partner button
 * (InstacartCtaButton): their "Shop ingredients" copy, carrot logo, and
 * #003D29 / #FAF1E5 color scheme. Only that button wears their branding.
 *
 * No Instacart key, partner id, affiliate tag, or signing secret exists in
 * this bundle, and none should be added.
 */
import { useCallback, useState } from 'react';
import { useRouter } from 'expo-router';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { AppButton, AppHeader, Card, ScrollScreen, uiText } from '@/components/hive-ui';
import { Spacing } from '@/constants/theme';
import { PRICING_NOTICE } from '@/features/meals/pricing-notice';
import { useMealPlan } from '@/features/meals/meal-plan-context';
import { groceryService } from '@/features/meals/grocery-service';
import { InstacartCtaButton } from '@/features/meals/instacart-cta-button';
import { describeError } from '@/services/api-error';

export function InstacartScreen() {
  const router = useRouter();
  const { plan } = useMealPlan();
  const [isPreparing, setIsPreparing] = useState(false);
  const [isOpeningFallback, setIsOpeningFallback] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [unmatchedCount, setUnmatchedCount] = useState(0);

  const itemCount = (plan?.groceryList ?? [])
    .flatMap((section) => section.items)
    .filter((item) => !item.inPantry).length;

  const start = useCallback(async () => {
    if (!plan) return;
    setIsPreparing(true);
    setError(null);
    try {
      const handoff = await groceryService.prepareInstacartOrder(plan.planId);
      setUnmatchedCount(handoff.unmatchedIngredientIds.length);
      await Linking.openURL(handoff.checkoutUrl);
    } catch (caught) {
      setError(caught);
    } finally {
      setIsPreparing(false);
    }
  }, [plan]);

  const openFallback = useCallback(async () => {
    if (!plan) return;
    setIsOpeningFallback(true);
    setError(null);
    try {
      const url = await groceryService.instacartFallbackUrl(plan.planId);
      await Linking.openURL(url);
    } catch (caught) {
      setError(caught);
    } finally {
      setIsOpeningFallback(false);
    }
  }, [plan]);

  return (
    <ScrollScreen>
      <AppHeader title="Shop with Instacart" onBack={router.back} />
      <View style={styles.body}>
        <Card style={styles.card}>
          <Text style={uiText.subtitle}>
            {itemCount} {itemCount === 1 ? 'item' : 'items'} ready to send
          </Text>
          <Text style={uiText.muted}>
            We&apos;ll hand your list to Instacart so you can review the cart there. Prices and
            substitutions are decided on Instacart, not here.
          </Text>
          <Text style={uiText.small}>{PRICING_NOTICE}</Text>
        </Card>

        {unmatchedCount > 0 ? (
          <Card style={styles.card}>
            <Text style={uiText.body}>
              Instacart couldn&apos;t match {unmatchedCount} {unmatchedCount === 1 ? 'item' : 'items'} —
              add {unmatchedCount === 1 ? 'it' : 'them'} to your cart there.
            </Text>
          </Card>
        ) : null}

        {error ? (
          <Card style={styles.card}>
            <Text style={uiText.subtitle}>Instacart checkout isn&apos;t connected yet</Text>
            <Text style={uiText.muted}>
              {describeError(error).message} You can still open Instacart with your list beside
              you and shop it there.
            </Text>
            <AppButton
              title="Open Instacart instead"
              variant="secondary"
              disabled={!plan || isOpeningFallback}
              onPress={() => void openFallback()}
            />
          </Card>
        ) : null}

        <View style={styles.actions}>
          <InstacartCtaButton
            onPress={() => void start()}
            disabled={!plan || itemCount === 0 || isPreparing}
          />
          {isPreparing ? <Text style={uiText.small}>Preparing your cart…</Text> : null}
          <AppButton
            title="Shop on my own instead"
            variant="secondary"
            onPress={() => router.replace('/meals/shop-own')}
          />
        </View>
      </View>
    </ScrollScreen>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: Spacing.three, paddingTop: Spacing.three, gap: Spacing.three },
  card: { gap: Spacing.two },
  actions: { gap: Spacing.two, marginTop: Spacing.three },
});
