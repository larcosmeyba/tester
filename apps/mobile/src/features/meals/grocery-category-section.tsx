/**
 * Grocery category section — shared by the grocery choice screen (read-only)
 * and the shopping checklist (checkable), matching Swift's
 * `GroceryCategorySection`.
 */
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { HiveIcon } from '@/components/hive-ui';
import { HiveColors, Radii, Spacing } from '@/constants/theme';
import type { Aisle } from '@/features/meals/meal-enums';
import {
  displayQuantity,
  priceForItem,
  type ChecklistSection,
} from '@/features/meals/grocery-checklist';
import type { GroceryItem } from '@/features/meals/meal-plan-model';

export function GroceryCategorySection({
  section,
  checkable,
  checkedIds,
  onToggle,
}: {
  section: ChecklistSection;
  checkable: boolean;
  checkedIds?: ReadonlySet<string>;
  onToggle?: (ingredientId: string) => void;
}) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{section.aisleLabel}</Text>
      <View style={styles.card}>
        {section.items.map((item, index) => (
          <View key={item.ingredientId}>
            <GroceryRow
              item={item}
              aisle={section.aisle}
              aisleLabel={section.aisleLabel}
              checkable={checkable}
              checked={checkedIds?.has(item.ingredientId) ?? false}
              onToggle={onToggle}
            />
            {index < section.items.length - 1 ? (
              <View style={[styles.divider, checkable && styles.dividerCheckable]} />
            ) : null}
          </View>
        ))}
      </View>
    </View>
  );
}

function GroceryRow({
  item,
  aisle,
  aisleLabel,
  checkable,
  checked,
  onToggle,
}: {
  item: GroceryItem;
  aisle: Aisle | null;
  aisleLabel: string;
  checkable: boolean;
  checked: boolean;
  onToggle?: (ingredientId: string) => void;
}) {
  const quantity = displayQuantity(item);
  const priced = priceForItem(item, aisle, aisleLabel);

  const content = (
    <>
      {checkable ? (
        <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
          {checked ? <HiveIcon name="check" size={13} color={HiveColors.white} /> : null}
        </View>
      ) : null}
      <View style={styles.flexOne}>
        <Text style={[styles.name, checked && styles.checkedText]}>
          {item.displayName}
        </Text>
        {quantity ? <Text style={styles.quantity}>{quantity}</Text> : null}
      </View>
      <View style={styles.priceCol}>
        <Text style={[styles.price, checked && styles.checkedText]}>
          ${priced.amount.toFixed(2)}
        </Text>
        <Text style={styles.estLabel}>
          {priced.source === 'server' ? 'Est.' : 'Est.*'}
        </Text>
      </View>
    </>
  );

  if (!checkable) {
    return <View style={styles.row}>{content}</View>;
  }

  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={`${item.displayName}${quantity ? `, ${quantity}` : ''}`}
      onPress={() => onToggle?.(item.ingredientId)}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.two },
  label: {
    color: HiveColors.textSecondary,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  card: {
    backgroundColor: HiveColors.white,
    borderRadius: Radii.lg,
    borderWidth: 1,
    borderColor: HiveColors.border,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  divider: { height: 1, backgroundColor: HiveColors.border, marginLeft: 14 },
  dividerCheckable: { marginLeft: 48 },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: HiveColors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: { backgroundColor: HiveColors.green, borderColor: HiveColors.green },
  flexOne: { flex: 1 },
  name: { color: HiveColors.text, fontSize: 15, fontWeight: '500' },
  quantity: { color: HiveColors.textSecondary, fontSize: 12, marginTop: 1 },
  priceCol: { alignItems: 'flex-end' },
  price: { color: HiveColors.text, fontSize: 14, fontWeight: '600' },
  estLabel: { color: HiveColors.textSecondary, fontSize: 9 },
  checkedText: { textDecorationLine: 'line-through', color: HiveColors.textSecondary },
  pressed: { opacity: 0.7 },
});
