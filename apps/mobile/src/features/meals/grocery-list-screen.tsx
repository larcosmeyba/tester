/**
 * Grocery choice — Swift `GroceryChoiceView`.
 *
 * Shown after the plan review ("This Plan Looks Good"): the consolidated list
 * for the whole week ("Everything for the week, combined — no duplicates."),
 * an estimated-total banner, then the two shopping paths — Send to Instacart
 * or Shop on My Own.
 *
 * Prices come from the backend's grocery list (`plan.groceryList`), always
 * labeled Estimated. The Instacart handoff itself lives on the dedicated
 * Instacart screen — this button routes there rather than duplicating it.
 */
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppButton, EmptyState, HiveIcon } from '@/components/hive-ui';
import { InstacartButton } from '@/components/hive-instacart';
import { HiveColors, Radii, Spacing } from '@/constants/theme';
import { PRICING_NOTICE_SHORT } from '@/features/meals/pricing-notice';
import { useMealPlan } from '@/features/meals/meal-plan-context';
import {
  checklistSections,
  estimatedTotal,
} from '@/features/meals/grocery-checklist';
import { GroceryCategorySection } from '@/features/meals/grocery-category-section';
import {
  loadCookGroceryAdditions,
  removeCookGroceryAddition,
  subscribeCookGroceryAdditions,
  type CookGroceryAddition,
} from '@/features/meals/cook-grocery-additions';

export function GroceryListScreen() {
  const router = useRouter();
  const { plan } = useMealPlan();
  // Missing ingredients one-tap-added from Cook What I Have — client-side only,
  // the plan's server-derived list is untouched.
  const [cookAdditions, setCookAdditions] = useState<CookGroceryAddition[]>([]);

  useEffect(() => {
    void loadCookGroceryAdditions().then(setCookAdditions).catch(() => undefined);
    return subscribeCookGroceryAdditions(setCookAdditions);
  }, []);

  const sections = useMemo(() => checklistSections(plan?.groceryList ?? []), [plan]);
  const total = useMemo(() => estimatedTotal(plan?.groceryList ?? []), [plan]);

  if (!plan || sections.length === 0) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.emptyBody}>
          <EmptyState
            icon="cart"
            title="No grocery list yet"
            subtitle="Generate a meal plan and Penny will build your list."
          />
          <AppButton
            title="Build my meal plan"
            onPress={() => router.push('/meals/questionnaire')}
          />
          <CookAdditionsSection additions={cookAdditions} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Text style={styles.title}>Your grocery list</Text>
          <Text style={styles.subtitle}>Everything for the week, combined — no duplicates.</Text>
        </View>

        <View style={styles.banner}>
          <HiveIcon name="dollar" size={15} color={HiveColors.green} />
          <View style={styles.bannerText}>
            <Text style={styles.bannerTotal}>
              Estimated total: ${total.amount.toFixed(2)}
            </Text>
            <Text style={styles.bannerNote}>
              Estimated pricing from your local Kroger — prices and availability can change.
            </Text>
            <Text style={styles.bannerNote}>{PRICING_NOTICE_SHORT}</Text>
          </View>
        </View>

        {sections.map((section) => (
          <GroceryCategorySection
            key={section.aisleLabel}
            section={section}
            checkable={false}
          />
        ))}

        {total.usedFallback ? (
          <Text style={styles.fallbackNote}>
            * Some items show a category estimate while live Kroger pricing loads.
          </Text>
        ) : null}

        <CookAdditionsSection additions={cookAdditions} />

        <View style={styles.scrollSpacer} />
      </ScrollView>

      <View style={styles.choice}>
        <View style={styles.divider} />
        <Text style={styles.choiceTitle}>How would you like to shop?</Text>
        <InstacartButton
          title="Send to Instacart"
          onPress={() => router.push('/meals/instacart')}
          style={styles.instacartButton}
        />
        <AppButton
          title="Shop on My Own"
          variant="secondary"
          onPress={() => router.push('/meals/shop-own')}
          style={styles.shopOwnButton}
        />
        <Text style={styles.footnote}>
          Shop on My Own shows this list with prices on your Meal Plan tab.
        </Text>
      </View>
    </SafeAreaView>
  );
}

/** Missing ingredients one-tap-added from Cook What I Have. Additive only. */
function CookAdditionsSection({ additions }: { additions: CookGroceryAddition[] }) {
  if (additions.length === 0) return null;
  return (
    <View style={styles.additions}>
      <Text style={styles.additionsTitle}>From Cook What I Have</Text>
      {additions.map((item) => (
        <View key={item.ingredientId} style={styles.additionRow}>
          <View style={styles.flexOne}>
            <Text style={styles.additionName}>{item.displayName}</Text>
            <Text style={styles.additionQty}>
              {item.neededQty} {item.unit}
            </Text>
          </View>
          <AppButton
            title="Remove"
            variant="plain"
            onPress={() => void removeCookGroceryAddition(item.ingredientId).catch(() => undefined)}
          />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: HiveColors.white },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingTop: 16, gap: 16 },
  scrollSpacer: { height: 10 },
  emptyBody: { flex: 1, paddingHorizontal: 20, paddingTop: 40, gap: Spacing.three },
  header: { gap: 4 },
  title: { color: HiveColors.text, fontSize: 24, fontWeight: '700' },
  subtitle: { color: HiveColors.textSecondary, fontSize: 14 },
  banner: {
    flexDirection: 'row',
    gap: 8,
    padding: 12,
    backgroundColor: HiveColors.greenLight,
    borderRadius: 12,
  },
  bannerText: { flex: 1, gap: 1 },
  bannerTotal: { color: HiveColors.green, fontSize: 14, fontWeight: '700' },
  bannerNote: { color: HiveColors.textSecondary, fontSize: 11 },
  fallbackNote: { color: HiveColors.textSecondary, fontSize: 11, fontStyle: 'italic' },
  additions: { gap: Spacing.two },
  additionsTitle: {
    color: HiveColors.textSecondary,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  additionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Radii.lg,
    borderWidth: 1,
    borderColor: HiveColors.border,
    backgroundColor: HiveColors.white,
  },
  flexOne: { flex: 1 },
  additionName: { color: HiveColors.text, fontSize: 15 },
  additionQty: { color: HiveColors.textSecondary, fontSize: 12 },
  choice: {
    gap: 10,
    paddingHorizontal: 20,
    paddingBottom: 12,
    paddingTop: 2,
    backgroundColor: HiveColors.white,
  },
  divider: { height: 1, backgroundColor: HiveColors.border, marginBottom: 2 },
  choiceTitle: { color: HiveColors.text, fontSize: 15, fontWeight: '700', textAlign: 'center' },
  instacartButton: { minHeight: 52, borderRadius: 14 },
  shopOwnButton: { minHeight: 52, borderRadius: 14 },
  footnote: { color: HiveColors.textSecondary, fontSize: 11, textAlign: 'center' },
});
