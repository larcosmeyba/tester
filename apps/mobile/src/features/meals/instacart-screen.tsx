/**
 * Shop with Instacart.
 *
 * BACKEND INTEGRATION REQUIRED. The handoff belongs on the server: it holds the
 * Instacart partner credentials and builds the cart. This app only ever sends
 * the plan id and opens whatever URL the backend hands back.
 *
 * No Instacart key, partner id, or signing secret exists in this bundle, and
 * none should be added.
 */
import { useCallback, useState } from 'react';
import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { AppButton, AppHeader, Card, ScrollScreen, uiText } from '@/components/hive-ui';
import { Spacing } from '@/constants/theme';
import { PRICING_NOTICE } from '@/features/meals/pricing-notice';
import { useMealPlan } from '@/features/meals/meal-plan-context';
import { groceryService } from '@/features/meals/grocery-service';
import { describeError } from '@/services/api-error';

export function InstacartScreen() {
  const router = useRouter();
  const { plan } = useMealPlan();
  const [isPreparing, setIsPreparing] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const itemCount = (plan?.groceryList ?? [])
    .flatMap((section) => section.items)
    .filter((item) => !item.inPantry).length;

  const start = useCallback(async () => {
    if (!plan) return;
    setIsPreparing(true);
    setError(null);
    try {
      await groceryService.prepareInstacartOrder(plan.planId);
    } catch (caught) {
      setError(caught);
    } finally {
      setIsPreparing(false);
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

        {error ? (
          <Card style={styles.card}>
            <Text style={uiText.body}>{describeError(error).message}</Text>
          </Card>
        ) : null}

        <View style={styles.actions}>
          <AppButton
            title="Send my list to Instacart"
            disabled={!plan || itemCount === 0}
            onPress={() => void start()}
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
