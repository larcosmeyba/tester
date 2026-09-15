// The pantry screens.
//
// The markup is the Xcode-derived design, unchanged from when this was part of
// app-root.tsx. What changed underneath is the data: it now comes from the Help
// The Hive backend (internal/modules/pantry) through PantryProvider, instead of
// a locally-persisted array seeded from mock-data.ts.
//
// The loading, error and retry states follow the same shape as the meal screens
// so the app behaves consistently when the network does not cooperate.

import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import {
  AppButton,
  AppHeader,
  AppTextField,
  Card,
  Chip,
  EmptyState,
  HiveIcon,
  type HiveIconName,
  ScrollScreen,
  StatBadge,
  rowStyles,
  uiText,
} from '@/components/hive-ui';
import { HiveColors } from '@/constants/theme';
import { useAppState } from '@/state/app-state';
import { capitalize, sharedStyles } from '@/features/app/app-shared';
import { type Navigation } from '@/features/app/navigation-types';
import { usePantry } from '@/features/pantry/pantry-context';
import {
  STORAGE_LOCATIONS,
  daysUntilExpiry,
  expirationDateInDays,
  locationIconFor,
  locationLabel,
  type PantryFilter,
  type PantryItem,
  type StorageLocation,
} from '@/features/pantry/pantry-model';
import {
  consumePendingPurchases,
  peekPendingPurchases,
  subscribePendingPurchases,
  type PurchasedItem,
} from '@/features/pantry/pending-purchases';

type LocationFilter = 'ALL' | StorageLocation;

/** "Expires in 3 days" / "Expires today" / "Expired 2 days ago". */
function expiryLabel(item: PantryItem): string {
  const days = daysUntilExpiry(item);
  if (days < 0) return `Expired ${Math.abs(days)} ${Math.abs(days) === 1 ? 'day' : 'days'} ago`;
  if (days === 0) return 'Expires today';
  if (days === 1) return 'Expires tomorrow';
  return `Expires in ${days} days`;
}

export function PantryScreen({ nav }: { nav: Navigation }) {
  const app = useAppState();
  const pantry = usePantry();
  const [filter, setFilter] = useState<PantryFilter>('active');
  const [locationFilter, setLocationFilter] = useState<LocationFilter>('ALL');
  const [pendingBuys, setPendingBuys] = useState<PurchasedItem[] | null>(null);
  const [addingBuys, setAddingBuys] = useState(false);

  // The shop screen stashes a finished grocery run here; offer it once.
  useEffect(() => {
    setPendingBuys(peekPendingPurchases());
    return subscribePendingPurchases(setPendingBuys);
  }, []);

  async function addPurchasesToPantry() {
    const buys = consumePendingPurchases();
    if (!buys || buys.length === 0) return;
    setAddingBuys(true);
    try {
      for (const item of buys) {
        // Best effort, one at a time — a single failure must not lose the rest.
        await pantry
          .addItem({
            name: item.displayName,
            quantity: item.packageLabel ?? `${item.neededQty} ${item.unit}`.trim(),
            location: 'PANTRY',
            category: 'Groceries',
            expirationDate: expirationDateInDays(7),
          })
          .catch(() => undefined);
      }
    } finally {
      setAddingBuys(false);
    }
  }

  const baseItems =
    filter === 'active' ? pantry.activeItems : filter === 'used' ? pantry.usedItems : pantry.expiredItems;
  const items =
    filter === 'active' && locationFilter !== 'ALL'
      ? baseItems.filter((item) => item.location === locationFilter)
      : baseItems;

  function body() {
    if (pantry.status === 'loading' || pantry.status === 'idle') {
      return (
        <View style={styles.stateBody}>
          <ActivityIndicator size="large" color={HiveColors.green} />
        </View>
      );
    }

    if (pantry.status === 'error') {
      return (
        <View style={styles.stateBody}>
          <Text style={uiText.subtitle}>We couldn&apos;t load your pantry</Text>
          <Text style={uiText.muted}>{pantry.error}</Text>
          <AppButton title="Try again" onPress={() => void pantry.refresh()} />
        </View>
      );
    }

    if (items.length === 0) {
      return (
        <EmptyState
          title={
            filter === 'active'
              ? 'No pantry items here yet.'
              : filter === 'used'
                ? "Nothing's been marked used yet."
                : 'Nothing has expired. Good.'
          }
          subtitle={filter === 'active' ? 'Add items manually or from the scan prototype.' : undefined}
        />
      );
    }

    return items.map((item) => (
      <Card key={item.id} style={styles.pantryItemCard}>
        <View style={rowStyles.row}>
          <View style={styles.rowIconTint}>
            <HiveIcon name={locationIconFor(item.location) as HiveIconName} size={18} color={HiveColors.green} />
          </View>
          <View style={sharedStyles.flexOne}>
            <Text style={sharedStyles.cardTitle}>{item.name}</Text>
            <Text style={sharedStyles.miniMuted}>
              {item.quantity} - {locationLabel(item.location)} - {expiryLabel(item)}
            </Text>
          </View>
        </View>
        {filter === 'active' ? (
          <View style={styles.cardActionRow}>
            <AppButton
              title="Used"
              variant="secondary"
              disabled={pantry.isMutating}
              onPress={() => void pantry.markUsed(item.id).catch(() => undefined)}
              style={sharedStyles.flexOne}
            />
            {daysUntilExpiry(item) <= 5 ? (
              <AppButton
                title="Cook with this"
                variant="secondary"
                disabled={pantry.isMutating}
                onPress={() => nav.push('cookWhatIHave', { focusIngredient: item.name })}
                style={sharedStyles.flexOne}
              />
            ) : null}
          </View>
        ) : null}
        {filter === 'active' ? (
          <View style={styles.cardActionRow}>
            <AppButton
              title="Edit"
              variant="plain"
              disabled={pantry.isMutating}
              onPress={() => nav.push('addPantry', { itemId: item.id })}
              style={sharedStyles.flexOne}
            />
            <AppButton
              title="Delete"
              variant="plain"
              disabled={pantry.isMutating}
              onPress={() => void pantry.removeItem(item.id).catch(() => undefined)}
              style={sharedStyles.flexOne}
            />
          </View>
        ) : null}
      </Card>
    ));
  }

  return (
    <ScrollScreen>
      <AppHeader
        title="My Pantry"
        onBack={nav.back}
        onAvatar={() => nav.push('account')}
        profileImageUri={app.profile.profileImageUri}
      />
      <View style={styles.pantrySummary}>
        <StatBadge value={`${pantry.wasteStats.totalAdded}`} label="ITEMS ADDED" />
        <StatBadge value={`${pantry.wasteStats.totalUsed}`} label="USED" />
        <StatBadge value={`$${pantry.wasteStats.estimatedWasteValue.toFixed(2)}`} label="WASTE SAVED" />
      </View>
      {pendingBuys && pendingBuys.length > 0 ? (
        <View style={styles.sideMargin}>
          <Card style={styles.purchaseCard}>
            <Text style={uiText.subtitle}>Add the groceries you just purchased?</Text>
            <Text style={uiText.muted} numberOfLines={2}>
              {pendingBuys.map((item) => item.displayName).join(', ')}
            </Text>
            <View style={styles.cardActionRow}>
              <AppButton
                title={addingBuys ? 'Adding…' : `Add ${pendingBuys.length} to pantry`}
                disabled={addingBuys || pantry.isMutating}
                onPress={() => void addPurchasesToPantry()}
                style={sharedStyles.flexOne}
              />
              <AppButton
                title="Not now"
                variant="plain"
                disabled={addingBuys}
                onPress={() => consumePendingPurchases()}
                style={sharedStyles.flexOne}
              />
            </View>
          </Card>
        </View>
      ) : null}
      <View style={styles.sideMargin}>
        <AppButton
          title="Cook What I Have"
          icon="carrot"
          variant="secondary"
          onPress={() => nav.push('cookWhatIHave')}
        />
      </View>
      <View style={sharedStyles.filterRow}>
        {(['active', 'used', 'expired'] as const).map((item) => (
          <Chip key={item} label={capitalize(item)} selected={filter === item} onPress={() => setFilter(item)} />
        ))}
      </View>
      {filter === 'active' ? (
        <View style={sharedStyles.filterRow}>
          {(['ALL', ...STORAGE_LOCATIONS] as const).map((option) => (
            <Chip
              key={option}
              label={option === 'ALL' ? 'All' : locationLabel(option)}
              selected={locationFilter === option}
              onPress={() => setLocationFilter(option)}
            />
          ))}
        </View>
      ) : null}
      <View style={sharedStyles.listStack}>{body()}</View>
      <View style={styles.sideMargin}>
        <AppButton title="Add Pantry Item" icon="plus" onPress={() => nav.push('addPantry')} />
      </View>
    </ScrollScreen>
  );
}

export function AddPantryScreen({ nav, itemId }: { nav: Navigation; itemId?: string }) {
  const pantry = usePantry();
  const editing = pantry.items.find((item) => item.id === itemId) ?? null;

  const [name, setName] = useState(editing?.name ?? '');
  const [quantity, setQuantity] = useState(editing?.quantity ?? '');
  const [location, setLocation] = useState<StorageLocation>(editing?.location ?? 'PANTRY');
  const [category, setCategory] = useState(editing?.category ?? 'Other');
  const [days, setDays] = useState(
    editing ? String(Math.max(0, daysUntilExpiry(editing))) : '7',
  );
  const [saveError, setSaveError] = useState('');

  async function save() {
    setSaveError('');
    const input = {
      name: name.trim(),
      quantity: quantity.trim(),
      location,
      category: category.trim() || 'Other',
      expirationDate: expirationDateInDays(Number.parseInt(days, 10) || 7),
    };
    try {
      if (editing) {
        await pantry.updateItem(editing.id, input);
      } else {
        await pantry.addItem(input);
      }
      nav.back();
    } catch {
      // The server rejected it — a blank field, or an unreachable network. The
      // message it produced is on the context; keep the user on the form with
      // what they typed rather than dropping them back to a list that did not
      // change.
      setSaveError(pantry.error || 'We could not save that item. Please try again.');
    }
  }

  return (
    <ScrollScreen keyboard>
      <AppHeader title={editing ? 'Edit Pantry Item' : 'Add Pantry Item'} onBack={nav.back} />
      <View style={sharedStyles.formScreen}>
        <AppTextField label="Item name" value={name} onChangeText={setName} placeholder="Milk" />
        <AppTextField label="Quantity" value={quantity} onChangeText={setQuantity} placeholder="1 gallon" />
        <AppTextField label="Category" value={category} onChangeText={setCategory} placeholder="Dairy" />
        <AppTextField
          label="Expires in days"
          value={days}
          onChangeText={setDays}
          placeholder="7"
          keyboardType="number-pad"
        />
        <Text style={sharedStyles.fieldGroupLabel}>Storage location</Text>
        <View style={sharedStyles.filterRow}>
          {STORAGE_LOCATIONS.map((option) => (
            <Chip
              key={option}
              label={locationLabel(option)}
              selected={location === option}
              onPress={() => setLocation(option)}
            />
          ))}
        </View>
        {saveError ? <Text style={styles.saveError}>{saveError}</Text> : null}
        <AppButton
          title={pantry.isMutating ? 'Saving…' : 'Save Item'}
          disabled={!name.trim() || !quantity.trim() || pantry.isMutating}
          onPress={() => void save()}
        />
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
  saveError: {
    ...uiText.muted,
    color: HiveColors.danger,
  },
  sideMargin: {
    marginHorizontal: 20,
  },
  purchaseCard: {
    gap: 10,
    marginBottom: 4,
  },
  stateBody: {
    alignItems: 'center',
    gap: 12,
    paddingVertical: 32,
  },
});
