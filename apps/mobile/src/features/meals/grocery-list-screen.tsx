/**
 * The grocery list.
 *
 * One list, whatever the recipes came from — Penny's plan, hand-picked recipes,
 * or an imported one. Items are grouped by store aisle, quantities are already
 * consolidated and rounded to whole packages by the engine, and anything the
 * user already has is shown at $0 rather than hidden.
 *
 * Two ways to shop, per the product spec:
 *  - Shop on my own — the list is kept inside Help The Hive, checkable and
 *    printable.
 *  - Shop with Instacart — the list is handed to the backend's Instacart
 *    integration. No Instacart credentials exist in this app.
 */
import { useCallback, useMemo, useState } from 'react';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppButton, AppHeader, Card, EmptyState, HiveIcon, ScrollScreen, uiText } from '@/components/hive-ui';
import { HiveColors, Radii, Spacing } from '@/constants/theme';
import { PRICING_NOTICE } from '@/features/meals/pricing-notice';
import { useMealPlan } from '@/features/meals/meal-plan-context';
import type { GroceryItem } from '@/features/meals/meal-plan-model';

export function GroceryListScreen() {
  const router = useRouter();
  const { plan } = useMealPlan();
  const [checked, setChecked] = useState<string[]>([]);

  const sections = useMemo(() => plan?.groceryList ?? [], [plan]);
  const toBuy = useMemo(
    () => sections.flatMap((section) => section.items).filter((item) => !item.inPantry),
    [sections]
  );
  const alreadyHave = useMemo(
    () => sections.flatMap((section) => section.items).filter((item) => item.inPantry),
    [sections]
  );

  const toggle = useCallback((ingredientId: string) => {
    setChecked((current) =>
      current.includes(ingredientId)
        ? current.filter((id) => id !== ingredientId)
        : [...current, ingredientId]
    );
  }, []);

  if (!plan || sections.length === 0) {
    return (
      <ScrollScreen>
        <AppHeader title="Grocery List" onBack={router.back} />
        <View style={styles.body}>
          <EmptyState
            icon="cart"
            title="No grocery list yet"
            subtitle="Build a meal plan or pick some recipes and we'll put the list together."
          />
          <AppButton title="Build my meal plan" onPress={() => router.push('/meals/questionnaire')} />
        </View>
      </ScrollScreen>
    );
  }

  const { estimatedCost, budget } = plan.summary;

  return (
    <ScrollScreen>
      <AppHeader title="Grocery List" onBack={router.back} />
      <View style={styles.body}>
        <Card style={styles.costCard}>
          <Text style={uiText.small}>Estimated total</Text>
          <Text style={styles.costRange}>
            ${estimatedCost.low}–${estimatedCost.high}
          </Text>
          {budget !== null ? (
            <Text style={uiText.small}>
              {estimatedCost.high <= budget
                ? `Fits your $${Math.round(budget)} budget`
                : `About $${Math.round(estimatedCost.high - budget)} over your $${Math.round(budget)} budget`}
            </Text>
          ) : null}
          <Text style={uiText.small}>{PRICING_NOTICE}</Text>
        </Card>

        <Text style={uiText.subtitle}>
          {toBuy.length} {toBuy.length === 1 ? 'item' : 'items'} to buy
        </Text>

        {sections.map((section) => {
          const buyable = section.items.filter((item) => !item.inPantry);
          if (buyable.length === 0) return null;
          return (
            <View key={section.aisleLabel} style={styles.section}>
              <Text style={styles.aisleTitle}>{section.aisleLabel}</Text>
              {buyable.map((item) => (
                <GroceryRow
                  key={item.ingredientId}
                  item={item}
                  checked={checked.includes(item.ingredientId)}
                  onToggle={() => toggle(item.ingredientId)}
                />
              ))}
            </View>
          );
        })}

        {alreadyHave.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.aisleTitle}>Already in your pantry</Text>
            {alreadyHave.map((item) => (
              <View key={item.ingredientId} style={[styles.row, styles.pantryRow]}>
                <HiveIcon name="check" size={16} color={HiveColors.green} />
                <View style={styles.flexOne}>
                  <Text style={uiText.body}>{item.displayName}</Text>
                  <Text style={uiText.small}>
                    {formatQuantity(item)} · no need to buy
                  </Text>
                </View>
              </View>
            ))}
          </View>
        ) : null}

        <View style={styles.actions}>
          <Text style={uiText.subtitle}>How do you want to shop?</Text>
          <AppButton title="Shop with Instacart" onPress={() => router.push('/meals/instacart')} />
          <AppButton
            title="Shop on my own"
            variant="secondary"
            onPress={() => router.push('/meals/shop-own')}
          />
        </View>
      </View>
    </ScrollScreen>
  );
}

function GroceryRow({
  item,
  checked,
  onToggle,
}: {
  item: GroceryItem;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={`${item.displayName}, ${formatQuantity(item)}`}
      onPress={onToggle}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
        {checked ? <HiveIcon name="check" size={12} color={HiveColors.white} /> : null}
      </View>
      <View style={styles.flexOne}>
        <Text style={[uiText.body, checked && styles.checkedText]}>{item.displayName}</Text>
        <Text style={uiText.small}>{formatQuantity(item)}</Text>
      </View>
      <Text style={uiText.body}>${item.estimatedPrice.toFixed(2)}</Text>
    </Pressable>
  );
}

/** Prefers the package label ("2 × 15 oz can") over a bare number when we have one. */
function formatQuantity(item: GroceryItem): string {
  if (item.packageLabel) return item.packageLabel;
  return `${item.neededQty} ${item.unit}`;
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: Spacing.three, paddingTop: Spacing.three, gap: Spacing.three },
  flexOne: { flex: 1 },
  costCard: { gap: Spacing.one },
  costRange: { color: HiveColors.text, fontSize: 26, fontWeight: '800' },
  section: { gap: Spacing.one },
  aisleTitle: { color: HiveColors.textSecondary, fontSize: 12, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    minHeight: 56,
    borderRadius: Radii.lg,
    borderWidth: 1.5,
    borderColor: HiveColors.border,
    backgroundColor: HiveColors.white,
  },
  pantryRow: { backgroundColor: HiveColors.greenLight, borderColor: HiveColors.greenLight },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: Radii.sm,
    borderWidth: 2,
    borderColor: HiveColors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: { backgroundColor: HiveColors.green, borderColor: HiveColors.green },
  checkedText: { textDecorationLine: 'line-through', color: HiveColors.textSecondary },
  pressed: { opacity: 0.7 },
  actions: { gap: Spacing.two, marginTop: Spacing.four },
});
