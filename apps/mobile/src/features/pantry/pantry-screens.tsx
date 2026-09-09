// The pantry screens.
//
// Extracted verbatim from app-root.tsx; markup unchanged.
//
// NOTE: these read initialPantryItems from data/mock-data.ts. A complete pantry
// backend exists (internal/modules/pantry, GraphQL pantryItems/addPantryItem)
// and is not called from here. See docs/mock-inventory.md.

import { useState } from 'react';
import { Text, View } from 'react-native';
import { AppButton, AppHeader, AppTextField, Card, Chip, EmptyState, HiveIcon, type HiveIconName, ScrollScreen, StatBadge, rowStyles } from '@/components/hive-ui';
import { HiveColors } from '@/constants/theme';
import { makePantryItem, type StorageLocation, storageLocations } from '@/data/mock-data';
import { daysFromNow, formatDate, locationIcon, useAppState } from '@/state/app-state';
import { StyleSheet } from 'react-native';
import { capitalize, sharedStyles } from '@/features/app/app-shared';
import { type Navigation } from '@/features/app/navigation-types';

export function PantryScreen({ nav }: { nav: Navigation }) {
  const app = useAppState();
  const [filter, setFilter] = useState<'active' | 'used' | 'expired'>('active');
  const items = filter === 'active' ? app.activePantryItems : filter === 'used' ? app.usedItems : app.expiredItems;

  return (
    <ScrollScreen>
      <AppHeader title="My Pantry" onBack={nav.back} onAvatar={() => nav.push('account')} profileImageUri={app.profile.profileImageUri} />
      <View style={styles.pantrySummary}>
        <StatBadge value={`${app.wasteStats.totalAdded}`} label="ITEMS ADDED" />
        <StatBadge value={`${app.wasteStats.totalUsed}`} label="USED" />
        <StatBadge value={`$${app.wasteStats.estimatedWasteValue.toFixed(2)}`} label="WASTE SAVED" />
      </View>
      <View style={sharedStyles.filterRow}>
        {(['active', 'used', 'expired'] as const).map((item) => (
          <Chip key={item} label={capitalize(item)} selected={filter === item} onPress={() => setFilter(item)} />
        ))}
      </View>
      <View style={sharedStyles.listStack}>
        {items.length > 0 ? (
          items.map((item) => (
            <Card key={item.id} style={styles.pantryItemCard}>
              <View style={rowStyles.row}>
                <View style={styles.rowIconTint}>
                  <HiveIcon name={locationIcon(item.location) as HiveIconName} size={18} color={HiveColors.green} />
                </View>
                <View style={sharedStyles.flexOne}>
                  <Text style={sharedStyles.cardTitle}>{item.name}</Text>
                  <Text style={sharedStyles.miniMuted}>
                    {item.quantity} - {item.location} - Expires {formatDate(item.expirationDate)}
                  </Text>
                </View>
              </View>
              {filter === 'active' ? (
                <View style={styles.cardActionRow}>
                  <AppButton title="Used" variant="secondary" onPress={() => app.updatePantryItemStatus(item.id, 'used')} style={sharedStyles.flexOne} />
                  <AppButton title="Delete" variant="plain" onPress={() => app.deletePantryItem(item.id)} style={sharedStyles.flexOne} />
                </View>
              ) : null}
            </Card>
          ))
        ) : (
          <EmptyState title="No pantry items here yet." subtitle="Add items manually or from the scan prototype." />
        )}
      </View>
      <View style={styles.sideMargin}>
        <AppButton title="Add Pantry Item" icon="plus" onPress={() => nav.push('addPantry')} />
      </View>
    </ScrollScreen>
  );
}

export function AddPantryScreen({ nav }: { nav: Navigation }) {
  const app = useAppState();
  const [name, setName] = useState('');
  const [quantity, setQuantity] = useState('');
  const [location, setLocation] = useState<StorageLocation>('Pantry');
  const [category, setCategory] = useState('Other');
  const [days, setDays] = useState('7');

  function save() {
    app.addPantryItem(
      makePantryItem({
        name,
        quantity,
        location,
        category,
        expirationDate: daysFromNow(Number.parseInt(days, 10) || 7),
      })
    );
    nav.back();
  }

  return (
    <ScrollScreen keyboard>
      <AppHeader title="Add Pantry Item" onBack={nav.back} />
      <View style={sharedStyles.formScreen}>
        <AppTextField label="Item name" value={name} onChangeText={setName} placeholder="Milk" />
        <AppTextField label="Quantity" value={quantity} onChangeText={setQuantity} placeholder="1 gallon" />
        <AppTextField label="Category" value={category} onChangeText={setCategory} placeholder="Dairy" />
        <AppTextField label="Expires in days" value={days} onChangeText={setDays} placeholder="7" keyboardType="number-pad" />
        <Text style={sharedStyles.fieldGroupLabel}>Storage location</Text>
        <View style={sharedStyles.filterRow}>
          {storageLocations.map((option) => (
            <Chip key={option} label={option} selected={location === option} onPress={() => setLocation(option)} />
          ))}
        </View>
        <AppButton title="Save Item" disabled={!name || !quantity} onPress={save} />
      </View>
    </ScrollScreen>
  );
}

const styles = StyleSheet.create({
  cardActionRow: {
    flexDirection: 'row',
    gap: 10,
  },
  pantryItemCard: {
    gap: 12,
    backgroundColor: HiveColors.white,
    borderWidth: 1,
    borderColor: HiveColors.border,
  },
  pantrySummary: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 18,
  },
  rowIconTint: {
    width: 38,
    height: 38,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: HiveColors.greenLight,
    marginRight: 12,
  },
  sideMargin: {
    marginHorizontal: 20,
  },
});
