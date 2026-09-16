/**
 * Shopping checklist — Swift `PlanShoppingChecklistView`.
 *
 * Opened from the Meal Plan tab's "Shop on Your Own List" button: the user
 * walks the aisles with this, checking things off as they go. Category-grouped
 * rows with prices, a "Left to buy" banner, and an "N of M items checked off"
 * subtitle.
 *
 * Print/share and the finished-run pantry prompt are kept from the previous
 * screen: the share icon in the header prints the list, and Done shopping
 * (enabled once everything is checked) feeds the pantry screen's
 * "Add the groceries you just purchased?" prompt.
 */
import { useCallback, useMemo, useState } from 'react';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppButton, HiveIcon } from '@/components/hive-ui';
import { HiveColors, Spacing } from '@/constants/theme';
import { PRICING_NOTICE_SHORT } from '@/features/meals/pricing-notice';
import { printAndShareGroceryList } from '@/features/meals/grocery-list-print';
import { useMealPlan } from '@/features/meals/meal-plan-context';
import {
  checkoffProgress,
  checklistSections,
  remainingTotal,
} from '@/features/meals/grocery-checklist';
import { GroceryCategorySection } from '@/features/meals/grocery-category-section';
import { setPendingPurchases } from '@/features/pantry/pending-purchases';
import { describeError } from '@/services/api-error';

export function ShopOnMyOwnScreen() {
  const router = useRouter();
  const { plan } = useMealPlan();
  const [checked, setChecked] = useState<string[]>([]);
  const [isPrinting, setIsPrinting] = useState(false);
  const [printError, setPrintError] = useState('');

  const rawSections = useMemo(() => plan?.groceryList ?? [], [plan]);
  const sections = useMemo(() => checklistSections(rawSections), [rawSections]);
  const checkedSet = useMemo(() => new Set(checked), [checked]);
  const progress = useMemo(
    () => checkoffProgress(rawSections, checkedSet),
    [rawSections, checkedSet],
  );
  const remaining = useMemo(
    () => remainingTotal(rawSections, checkedSet),
    [rawSections, checkedSet],
  );

  const toggle = useCallback((ingredientId: string) => {
    setChecked((current) =>
      current.includes(ingredientId)
        ? current.filter((id) => id !== ingredientId)
        : [...current, ingredientId],
    );
  }, []);

  const printList = useCallback(async () => {
    if (!plan || isPrinting) return;
    setPrintError('');
    setIsPrinting(true);
    try {
      await printAndShareGroceryList('Help The Hive — grocery list', plan.groceryList, checked);
    } catch (caught) {
      setPrintError(describeError(caught).message);
    } finally {
      setIsPrinting(false);
    }
  }, [plan, checked, isPrinting]);

  const doneShopping = useCallback(() => {
    const items = rawSections
      .flatMap((section) => section.items)
      .filter((item) => !item.inPantry);
    // A finished grocery run becomes the pantry screen's
    // "Add the groceries you just purchased?" prompt.
    setPendingPurchases(
      items.map((item) => ({
        displayName: item.displayName,
        neededQty: item.neededQty,
        unit: item.unit,
        packageLabel: item.packageLabel,
      })),
    );
    router.replace('/meals/plan');
  }, [rawSections, router]);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={router.back}
          style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}>
          <HiveIcon name="back" size={16} color={HiveColors.text} />
        </Pressable>
        <View style={styles.headerText}>
          <Text style={styles.title}>Shop on My Own</Text>
          <Text style={styles.subtitle}>
            {progress.checked} of {progress.total} items checked off
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={isPrinting ? 'Preparing list' : 'Print or share list'}
          onPress={() => void printList()}
          disabled={isPrinting || sections.length === 0}
          style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}>
          <HiveIcon name="share" size={16} color={HiveColors.text} />
        </Pressable>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <View style={styles.banner}>
          <HiveIcon name="cart" size={14} color={HiveColors.green} />
          <Text style={styles.bannerTotal}>Left to buy: ${remaining.amount.toFixed(2)}</Text>
          <Text style={styles.bannerNote}>Est. — Kroger pricing</Text>
        </View>

        {printError ? <Text style={styles.printError}>{printError}</Text> : null}

        {sections.length > 0 ? (
          sections.map((section) => (
            <GroceryCategorySection
              key={section.aisleLabel}
              section={section}
              checkable
              checkedIds={checkedSet}
              onToggle={toggle}
            />
          ))
        ) : (
          <View style={styles.empty}>
            <HiveIcon name="cart" size={32} color={HiveColors.border} />
            <Text style={styles.emptyTitle}>No grocery list yet</Text>
            <Text style={styles.emptySubtitle}>
              Generate a meal plan and Penny will build your list.
            </Text>
          </View>
        )}

        {remaining.usedFallback ? (
          <Text style={styles.fallbackNote}>
            * Some items show a category estimate while live Kroger pricing loads.
          </Text>
        ) : null}

        <Text style={styles.notice}>{PRICING_NOTICE_SHORT}</Text>

        {sections.length > 0 ? (
          <View style={styles.actions}>
            <AppButton
              title={progress.total - progress.checked === 0 ? "That's everything — done shopping" : 'Done shopping'}
              variant="secondary"
              disabled={progress.total - progress.checked > 0}
              onPress={doneShopping}
            />
          </View>
        ) : null}

        <View style={styles.scrollSpacer} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: HiveColors.white },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 10,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: HiveColors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.7 },
  headerText: { flex: 1, gap: 1 },
  title: { color: HiveColors.text, fontSize: 20, fontWeight: '700' },
  subtitle: { color: HiveColors.textSecondary, fontSize: 12 },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, gap: 16 },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    backgroundColor: HiveColors.greenLight,
    borderRadius: 12,
  },
  bannerTotal: { color: HiveColors.green, fontSize: 14, fontWeight: '700' },
  bannerNote: { color: HiveColors.textSecondary, fontSize: 11 },
  empty: { alignItems: 'center', gap: 12, paddingVertical: 40 },
  emptyTitle: { color: HiveColors.textSecondary, fontSize: 15, fontWeight: '600' },
  emptySubtitle: { color: HiveColors.textSecondary, fontSize: 13, textAlign: 'center' },
  fallbackNote: { color: HiveColors.textSecondary, fontSize: 11, fontStyle: 'italic' },
  notice: { color: HiveColors.textSecondary, fontSize: 11 },
  printError: { color: HiveColors.warningText, fontSize: 13 },
  actions: { marginTop: Spacing.two },
  scrollSpacer: { height: 30 },
});
