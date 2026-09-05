/**
 * Shop On My Own.
 *
 * The list stays inside Help The Hive: checkable while walking the aisles, and
 * printable or shareable for anyone who would rather carry paper.
 */
import { useCallback, useMemo, useState } from 'react';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppButton, AppHeader, EmptyState, HiveIcon, ScrollScreen, uiText } from '@/components/hive-ui';
import { HiveColors, Radii, Spacing } from '@/constants/theme';
import { PRICING_NOTICE } from '@/features/meals/pricing-notice';
import { useMealPlan } from '@/features/meals/meal-plan-context';

export function ShopOnMyOwnScreen() {
  const router = useRouter();
  const { plan } = useMealPlan();
  const [checked, setChecked] = useState<string[]>([]);

  const items = useMemo(
    () => (plan?.groceryList ?? []).flatMap((section) => section.items).filter((item) => !item.inPantry),
    [plan]
  );

  const toggle = useCallback((id: string) => {
    setChecked((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }, []);

  const remaining = items.length - checked.length;

  if (items.length === 0) {
    return (
      <ScrollScreen>
        <AppHeader title="Shop on your own" onBack={router.back} />
        <View style={styles.stateBody}>
          <EmptyState icon="cart" title="Nothing to buy" subtitle="Your grocery list is empty right now." />
        </View>
      </ScrollScreen>
    );
  }

  return (
    <ScrollScreen>
      <AppHeader title="Shop on your own" onBack={router.back} />
      <View style={styles.body}>
        <Text style={uiText.muted}>
          {remaining === 0 ? "That's everything — nice work." : `${remaining} left to pick up.`}
        </Text>

        {items.map((item) => {
          const isChecked = checked.includes(item.ingredientId);
          return (
            <Pressable
              key={item.ingredientId}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: isChecked }}
              accessibilityLabel={item.displayName}
              onPress={() => toggle(item.ingredientId)}
              style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
              <View style={[styles.checkbox, isChecked && styles.checkboxChecked]}>
                {isChecked ? <HiveIcon name="check" size={12} color={HiveColors.white} /> : null}
              </View>
              <View style={styles.flexOne}>
                <Text style={[uiText.body, isChecked && styles.checkedText]}>{item.displayName}</Text>
                <Text style={uiText.small}>{item.packageLabel ?? `${item.neededQty} ${item.unit}`}</Text>
              </View>
              <Text style={uiText.body}>${item.estimatedPrice.toFixed(2)}</Text>
            </Pressable>
          );
        })}

        <Text style={uiText.small}>{PRICING_NOTICE}</Text>

        <View style={styles.actions}>
          <AppButton
            title="Done shopping"
            disabled={remaining > 0}
            onPress={() => router.replace('/meals/plan')}
          />
        </View>
      </View>
    </ScrollScreen>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: Spacing.three, paddingTop: Spacing.three, gap: Spacing.two },
  stateBody: { paddingVertical: Spacing.five, paddingHorizontal: Spacing.three, gap: Spacing.three, alignItems: 'center' },
  flexOne: { flex: 1 },
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
