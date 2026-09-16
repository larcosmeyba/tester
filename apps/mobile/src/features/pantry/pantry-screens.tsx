/**
 * The pantry screens, rebuilt from Marcos's SwiftUI design (MyPantryView,
 * AddPantryItemView) — same screens, same flow, same copy.
 *
 * The data underneath is the Help The Hive backend through PantryProvider
 * (internal/modules/pantry), not the Swift's local UserDefaults store: the
 * pantry survives reinstalls and is the same data the meal generator reads.
 *
 * Layout (Swift):
 * - "Add Items" row -> action sheet: Scan Photo with AI / Add Manually
 * - Dark-green "Generate a Meal" card -> the Cook What I Have screen
 * - "Your Saved Recipes" from the cook history
 * - Segmented control: Active / Expired / Waste Stats
 * - Active: USE FIRST expiring-soon section, location filter chips, item rows
 * - Expired: educational banner, or the "No expired items" empty state
 * - Waste Stats: stat cards, estimated waste, top categories, waste tips
 *
 * The pending-purchases banner (a finished grocery run offered once) is kept:
 * it is existing behavior the Swift design does not cover.
 */
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import {
  AppButton,
  AppHeader,
  AppTextField,
  Card,
  HiveIcon,
  type HiveIconName,
  ModalSheet,
  ScrollScreen,
  uiText,
} from '@/components/hive-ui';
import { HiveColors } from '@/constants/theme';
import { useAppState } from '@/state/app-state';
import { sharedStyles } from '@/features/app/app-shared';
import { type Navigation } from '@/features/app/navigation-types';
import { usePantry } from '@/features/pantry/pantry-context';
import {
  STORAGE_LOCATIONS,
  daysUntilExpiry,
  expirationDateInDays,
  locationIconFor,
  locationLabel,
  type PantryItem,
  type StorageLocation,
} from '@/features/pantry/pantry-model';
import { ExpirationDateField, formatYmd } from '@/features/pantry/expiration-date-field';
import {
  consumePendingPurchases,
  peekPendingPurchases,
  subscribePendingPurchases,
  type PurchasedItem,
} from '@/features/pantry/pending-purchases';
import { loadCookHistory, type CookedMealRecord } from '@/features/meals/cook-what-i-have-history';

type PantryTab = 'active' | 'expired' | 'stats';

const TABS: { id: PantryTab; label: string }[] = [
  { id: 'active', label: 'Active' },
  { id: 'expired', label: 'Expired' },
  { id: 'stats', label: 'Waste Stats' },
];

const ADD_CATEGORIES = ['Produce', 'Dairy', 'Meat', 'Grains', 'Canned Goods', 'Frozen', 'Beverages', 'Snacks', 'Other'];

/** Swift ActivePantryRow expiry copy: "Expires today" / "Expires tomorrow" / "Exp. Sep 22". */
function activeExpiryLabel(item: PantryItem): string {
  const days = daysUntilExpiry(item);
  if (days <= 0) return 'Expires today';
  if (days === 1) return 'Expires tomorrow';
  return `Exp. ${formatYmd(item.expirationDate).replace(/, \d{4}$/, '')}`;
}

function expiryColor(days: number): string {
  if (days <= 3) return HiveColors.danger;
  if (days <= 5) return HiveColors.orange;
  return HiveColors.textSecondary;
}

function expiringSoonLabel(item: PantryItem): string {
  const days = Math.max(0, daysUntilExpiry(item));
  if (days === 0) return 'Expires today';
  return `Expires in ${days} day${days === 1 ? '' : 's'}`;
}

function RowMenu({
  item,
  onClose,
  onMarkUsed,
  onEdit,
  onDelete,
}: {
  item: PantryItem;
  onClose: () => void;
  onMarkUsed: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <ModalSheet visible onClose={onClose}>
      <View style={styles.menu}>
        <Text style={[uiText.subtitle, styles.menuTitle]} numberOfLines={1}>
          {item.name}
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            onClose();
            onMarkUsed();
          }}
          style={styles.menuRow}>
          <HiveIcon name="checkCircle" size={20} color={HiveColors.green} />
          <Text style={uiText.body}>Mark as Used</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            onClose();
            onEdit();
          }}
          style={styles.menuRow}>
          <HiveIcon name="doc" size={20} color={HiveColors.text} />
          <Text style={uiText.body}>Edit</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            onClose();
            onDelete();
          }}
          style={styles.menuRow}>
          <HiveIcon name="trash" size={20} color={HiveColors.danger} />
          <Text style={[uiText.body, styles.menuDelete]}>Delete</Text>
        </Pressable>
      </View>
    </ModalSheet>
  );
}

function ActiveRow({
  item,
  onMenu,
  onMarkUsed,
}: {
  item: PantryItem;
  onMenu: () => void;
  onMarkUsed: () => void;
}) {
  const days = daysUntilExpiry(item);
  return (
    <View style={styles.itemRow}>
      <View style={styles.itemIcon}>
        <HiveIcon name={locationIconFor(item.location) as HiveIconName} size={20} color={HiveColors.green} />
      </View>
      <View style={sharedStyles.flexOne}>
        <Text style={styles.itemName} numberOfLines={1}>
          {item.name}
        </Text>
        <Text style={styles.itemSub} numberOfLines={1}>
          {item.quantity} · {locationLabel(item.location)}
        </Text>
        <Text style={[styles.itemSub, { color: expiryColor(days) }]}>{activeExpiryLabel(item)}</Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Options for ${item.name}`}
        onPress={onMenu}
        hitSlop={12}
        style={styles.ellipsisButton}>
        <HiveIcon name="ellipsis" size={18} color={HiveColors.textSecondary} />
      </Pressable>
    </View>
  );
}

function ExpiredRow({ item, onDelete }: { item: PantryItem; onDelete: () => void }) {
  return (
    <View style={styles.itemRow}>
      <View style={styles.expiredIcon}>
        <HiveIcon name="xCircle" size={18} color={HiveColors.danger} />
      </View>
      <View style={sharedStyles.flexOne}>
        <Text style={styles.itemName} numberOfLines={1}>
          {item.name}
        </Text>
        <Text style={styles.itemSub} numberOfLines={1}>
          Expired {formatYmd(item.expirationDate).replace(/, \d{4}$/, '')} · {item.quantity}
        </Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Delete ${item.name}`}
        onPress={onDelete}
        hitSlop={12}
        style={styles.ellipsisButton}>
        <HiveIcon name="trash" size={16} color={HiveColors.danger} />
      </Pressable>
    </View>
  );
}

function EmptyPantryState({ icon, title, subtitle }: { icon: HiveIconName; title: string; subtitle: string }) {
  return (
    <View style={styles.emptyState}>
      <HiveIcon name={icon} size={44} color={HiveColors.border} />
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptySubtitle}>{subtitle}</Text>
    </View>
  );
}

export function PantryScreen({ nav }: { nav: Navigation }) {
  const app = useAppState();
  const pantry = usePantry();
  const [tab, setTab] = useState<PantryTab>('active');
  const [locationFilter, setLocationFilter] = useState<'ALL' | StorageLocation>('ALL');
  const [addSheetOpen, setAddSheetOpen] = useState(false);
  const [menuItem, setMenuItem] = useState<PantryItem | null>(null);
  const [history, setHistory] = useState<CookedMealRecord[]>([]);
  const [pendingBuys, setPendingBuys] = useState<PurchasedItem[] | null>(() => peekPendingPurchases());
  const [addingBuys, setAddingBuys] = useState(false);

  // The shop screen stashes a finished grocery run here; offer it once.
  useEffect(() => subscribePendingPurchases(setPendingBuys), []);
  useEffect(() => {
    void loadCookHistory().then(setHistory).catch(() => undefined);
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

  function markUsed(id: string) {
    void pantry.markUsed(id).catch(() => undefined);
  }

  const activeItems =
    locationFilter === 'ALL'
      ? pantry.activeItems
      : pantry.activeItems.filter((item) => item.location === locationFilter);

  function activeTab() {
    const expiring = pantry.expiringItems;
    return (
      <View style={styles.tabBody}>
        {expiring.length > 0 ? (
          <View style={styles.useFirst}>
            <View style={styles.useFirstHeader}>
              <Text style={styles.useFirstTitle}>USE FIRST</Text>
              <Text style={styles.useFirstCount}>
                {expiring.length} item{expiring.length === 1 ? '' : 's'}
              </Text>
            </View>
            {expiring.map((item) => (
              <View key={item.id} style={styles.useFirstRow}>
                <View style={sharedStyles.flexOne}>
                  <Text style={styles.itemName} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text style={[styles.itemSub, styles.useFirstExpiry]}>{expiringSoonLabel(item)}</Text>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Mark ${item.name} as used`}
                  disabled={pantry.isMutating}
                  onPress={() => markUsed(item.id)}
                  style={styles.usedItButton}>
                  <Text style={styles.usedItText}>Used it</Text>
                </Pressable>
              </View>
            ))}
          </View>
        ) : null}

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          <LocationChip
            label="All"
            icon="grid"
            selected={locationFilter === 'ALL'}
            onPress={() => setLocationFilter('ALL')}
          />
          {STORAGE_LOCATIONS.map((loc) => (
            <LocationChip
              key={loc}
              label={locationLabel(loc)}
              icon={locationIconFor(loc) as HiveIconName}
              selected={locationFilter === loc}
              onPress={() => setLocationFilter(loc)}
            />
          ))}
        </ScrollView>

        {activeItems.length === 0 ? (
          <EmptyPantryState
            icon="box"
            title={locationFilter === 'ALL' ? 'Your pantry is empty' : `Nothing in ${locationLabel(locationFilter)}`}
            subtitle="Tap 'Add Items' to get started"
          />
        ) : (
          <View style={styles.itemList}>
            {activeItems.map((item) => (
              <ActiveRow
                key={item.id}
                item={item}
                onMenu={() => setMenuItem(item)}
                onMarkUsed={() => markUsed(item.id)}
              />
            ))}
          </View>
        )}
      </View>
    );
  }

  function expiredTab() {
    if (pantry.expiredItems.length === 0) {
      return (
        <EmptyPantryState
          icon="checkCircle"
          title="No expired items"
          subtitle="Great job keeping your pantry fresh!"
        />
      );
    }
    return (
      <View style={styles.tabBody}>
        <View style={styles.expiredBanner}>
          <HiveIcon name="heart" size={16} color={HiveColors.green} />
          <Text style={[uiText.body, sharedStyles.flexOne, styles.expiredBannerText]}>
            Life happens — these items expired. Use this list to shop smarter next time.
          </Text>
        </View>
        <View style={styles.itemList}>
          {pantry.expiredItems.map((item) => (
            <ExpiredRow
              key={item.id}
              item={item}
              onDelete={() => void pantry.removeItem(item.id).catch(() => undefined)}
            />
          ))}
        </View>
      </View>
    );
  }

  function statsTab() {
    const stats = pantry.wasteStats;
    return (
      <View style={styles.tabBody}>
        <View style={styles.statCards}>
          <StatNumberCard value={`${stats.totalAdded}`} label="Added" color={HiveColors.green} />
          <StatNumberCard value={`${stats.totalUsed}`} label="Used" color={HiveColors.blue} />
          <StatNumberCard value={`${stats.totalExpired}`} label="Expired" color={HiveColors.danger} />
        </View>

        <View style={styles.wasteCard}>
          <View style={styles.wasteIcon}>
            <HiveIcon name="dollar" size={24} color={HiveColors.orange} />
          </View>
          <View>
            <Text style={styles.wasteTitle}>Estimated Food Waste</Text>
            <Text style={uiText.muted}>${stats.estimatedWasteValue.toFixed(2)} worth of food expired</Text>
          </View>
        </View>

        {stats.mostWastedCategories.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Most Expired Categories</Text>
            {stats.mostWastedCategories.map((category, index) => (
              <View key={category} style={styles.categoryRow}>
                <Text style={styles.categoryRank}>{index + 1}</Text>
                <Text style={uiText.body}>{category}</Text>
              </View>
            ))}
          </View>
        ) : null}

        <View style={styles.tipsCard}>
          <Text style={styles.sectionTitle}>Tips to Reduce Waste</Text>
          <WasteTip icon="clock" text="Shop only for what you'll use in the next 5–7 days" />
          <WasteTip icon="fork" text="Plan meals around what's expiring soonest" />
          <WasteTip icon="snow" text="Freeze meat and bread before they expire" />
        </View>
      </View>
    );
  }

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
    if (tab === 'active') return activeTab();
    if (tab === 'expired') return expiredTab();
    return statsTab();
  }

  return (
    <ScrollScreen>
      <AppHeader
        title="My Pantry"
        onBack={nav.back}
        onAvatar={() => nav.push('account')}
        profileImageUri={app.profile.profileImageUri}
      />

      <View style={styles.screenPad}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Add items to your pantry"
          onPress={() => setAddSheetOpen(true)}
          style={styles.addRow}>
          <View style={styles.addCircle}>
            <HiveIcon name="plus" size={16} color={HiveColors.white} />
          </View>
          <Text style={styles.addRowText}>Add Items</Text>
          <HiveIcon name="next" size={14} color={HiveColors.textSecondary} />
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Generate a meal from your pantry"
          onPress={() => nav.push('cookWhatIHave')}
          style={styles.generateCard}>
          <LinearGradient
            colors={[HiveColors.greenGradientStart, HiveColors.greenGradientEnd]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.generateGradient}>
            <View style={styles.sparkleCircle}>
              <HiveIcon name="sparkles" size={18} color={HiveColors.white} />
            </View>
            <View style={sharedStyles.flexOne}>
              <Text style={styles.generateTitle}>Generate a Meal</Text>
              <Text style={styles.generateSubtitle}>Penny cooks with what you already have</Text>
            </View>
            <HiveIcon name="next" size={14} color={HiveColors.white} />
          </LinearGradient>
        </Pressable>

        {history.length > 0 ? (
          <View style={styles.savedSection}>
            <Text style={styles.savedTitle}>Your Saved Recipes</Text>
            {history.slice(0, 5).map((record) => (
              <Pressable
                key={`${record.recipeId}:${record.createdAt}`}
                accessibilityRole="button"
                onPress={() => nav.push('cookWhatIHave')}
                style={styles.savedRow}>
                <HiveIcon name="fork" size={14} color={HiveColors.green} />
                <Text style={[uiText.body, sharedStyles.flexOne]} numberOfLines={1}>
                  {record.title}
                </Text>
                <Text style={uiText.small}>{record.slot.charAt(0).toUpperCase() + record.slot.slice(1)}</Text>
                <HiveIcon name="next" size={12} color={HiveColors.textSecondary} />
              </Pressable>
            ))}
          </View>
        ) : null}

        {pendingBuys && pendingBuys.length > 0 ? (
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
        ) : null}

        <View style={styles.segmented}>
          {TABS.map((option) => {
            const selected = tab === option.id;
            return (
              <Pressable
                key={option.id}
                accessibilityRole="tab"
                accessibilityState={{ selected }}
                onPress={() => setTab(option.id)}
                style={[styles.segment, selected && styles.segmentSelected]}>
                <Text style={[styles.segmentText, selected && styles.segmentTextSelected]}>
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {body()}
      </View>

      <ModalSheet visible={addSheetOpen} onClose={() => setAddSheetOpen(false)}>
        <View style={styles.addSheet}>
          <Text style={uiText.subtitle}>How would you like to add items?</Text>
          <AppButton
            title="Scan Photo with AI"
            icon="camera"
            onPress={() => {
              setAddSheetOpen(false);
              nav.push('scanPantry');
            }}
          />
          <AppButton
            title="Add Manually"
            variant="secondary"
            onPress={() => {
              setAddSheetOpen(false);
              nav.push('addPantry');
            }}
          />
          <AppButton title="Cancel" variant="plain" onPress={() => setAddSheetOpen(false)} />
        </View>
      </ModalSheet>

      {menuItem ? (
        <RowMenu
          item={menuItem}
          onClose={() => setMenuItem(null)}
          onMarkUsed={() => markUsed(menuItem.id)}
          onEdit={() => nav.push('addPantry', { itemId: menuItem.id })}
          onDelete={() => void pantry.removeItem(menuItem.id).catch(() => undefined)}
        />
      ) : null}
    </ScrollScreen>
  );
}

function LocationChip({
  label,
  icon,
  selected,
  onPress,
}: {
  label: string;
  icon: HiveIconName;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.locationChip, selected && styles.locationChipSelected]}>
      <HiveIcon name={icon} size={13} color={selected ? HiveColors.green : HiveColors.textSecondary} />
      <Text style={[styles.locationChipText, selected && styles.locationChipTextSelected]}>{label}</Text>
    </Pressable>
  );
}

function StatNumberCard({ value, label, color }: { value: string; label: string; color: string }) {
  return (
    <View style={[styles.statCard, { backgroundColor: `${color}14` }]}>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function WasteTip({ icon, text }: { icon: HiveIconName; text: string }) {
  return (
    <View style={styles.tipRow}>
      <HiveIcon name={icon} size={15} color={HiveColors.green} />
      <Text style={[uiText.body, sharedStyles.flexOne, styles.tipText]}>{text}</Text>
    </View>
  );
}

export function AddPantryScreen({ nav, itemId }: { nav: Navigation; itemId?: string }) {
  const pantry = usePantry();
  const editing = pantry.items.find((item) => item.id === itemId) ?? null;

  const [name, setName] = useState(editing?.name ?? '');
  const [quantity, setQuantity] = useState(editing?.quantity ?? '');
  const [location, setLocation] = useState<StorageLocation>(editing?.location ?? 'PANTRY');
  const [category, setCategory] = useState(editing?.category ?? 'Other');
  const [expirationDate, setExpirationDate] = useState(
    editing?.expirationDate ?? expirationDateInDays(7),
  );
  // The Swift design requires an explicit tap on the date picker — a default
  // is not a confirmation. Editing an existing item keeps its date confirmed.
  const [dateConfirmed, setDateConfirmed] = useState(editing != null);
  const [saveError, setSaveError] = useState('');

  const canSave =
    name.trim().length > 0 && quantity.trim().length > 0 && dateConfirmed && !pantry.isMutating;

  async function save() {
    setSaveError('');
    const input = {
      name: name.trim(),
      quantity: quantity.trim(),
      location,
      category: category.trim() || 'Other',
      expirationDate,
    };
    try {
      if (editing) {
        await pantry.updateItem(editing.id, input);
      } else {
        await pantry.addItem(input);
      }
      nav.back();
    } catch {
      // The server rejected it — a blank field, or an unreachable network.
      // Keep the user on the form with what they typed rather than dropping
      // them back to a list that did not change.
      setSaveError(pantry.error || 'We could not save that item. Please try again.');
    }
  }

  return (
    <ScrollScreen keyboard>
      <AppHeader title={editing ? 'Edit Item' : 'Add Item'} onBack={nav.back} />
      <View style={styles.form}>
        <AppTextField label="Item Name" value={name} onChangeText={setName} placeholder="e.g. Brown Rice" />
        <AppTextField
          label="Quantity"
          value={quantity}
          onChangeText={setQuantity}
          placeholder="e.g. 2 lbs, 1 bag, 3 cans"
        />

        <View>
          <Text style={styles.fieldLabel}>Storage Location</Text>
          <View style={styles.locationRow}>
            {STORAGE_LOCATIONS.map((option) => {
              const selected = location === option;
              return (
                <Pressable
                  key={option}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => setLocation(option)}
                  style={[styles.locationOption, selected && styles.locationOptionSelected]}>
                  <HiveIcon
                    name={locationIconFor(option) as HiveIconName}
                    size={15}
                    color={selected ? HiveColors.green : HiveColors.text}
                  />
                  <Text style={[styles.locationOptionText, selected && styles.locationOptionTextSelected]}>
                    {locationLabel(option)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <ExpirationDateField
          value={expirationDate}
          confirmed={dateConfirmed}
          onConfirm={(date) => {
            setExpirationDate(date);
            setDateConfirmed(true);
          }}
        />

        <View>
          <Text style={styles.fieldLabel}>Category</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
            {ADD_CATEGORIES.map((option) => {
              const selected = category === option;
              return (
                <Pressable
                  key={option}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => setCategory(option)}
                  style={[styles.locationChip, selected && styles.locationChipSelected]}>
                  <Text style={[styles.locationChipText, selected && styles.locationChipTextSelected]}>
                    {option}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        {saveError ? <Text style={styles.saveError}>{saveError}</Text> : null}
        <AppButton
          title={pantry.isMutating ? 'Saving…' : 'Save'}
          disabled={!canSave}
          onPress={() => void save()}
        />
      </View>
    </ScrollScreen>
  );
}

const styles = StyleSheet.create({
  screenPad: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 32,
    gap: 14,
  },
  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: HiveColors.card,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  addCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: HiveColors.green,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addRowText: {
    flex: 1,
    color: HiveColors.text,
    fontSize: 15,
    fontWeight: '600',
  },
  generateCard: {
    borderRadius: 14,
    overflow: 'hidden',
  },
  generateGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
  },
  sparkleCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.20)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  generateTitle: {
    color: HiveColors.white,
    fontSize: 15,
    fontWeight: '700',
  },
  generateSubtitle: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 12,
  },
  savedSection: {
    gap: 8,
  },
  savedTitle: {
    color: HiveColors.text,
    fontSize: 13,
    fontWeight: '700',
  },
  savedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: HiveColors.card,
    borderRadius: 10,
    padding: 10,
  },
  purchaseCard: {
    gap: 10,
  },
  cardActionRow: {
    flexDirection: 'row',
    gap: 10,
  },
  segmented: {
    flexDirection: 'row',
    backgroundColor: HiveColors.card,
    borderRadius: 14,
    padding: 4,
  },
  segment: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 10,
    alignItems: 'center',
  },
  segmentSelected: {
    backgroundColor: HiveColors.green,
  },
  segmentText: {
    color: HiveColors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  segmentTextSelected: {
    color: HiveColors.white,
  },
  tabBody: {
    gap: 14,
  },
  useFirst: {
    gap: 10,
    backgroundColor: HiveColors.orangeBanner,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(251,188,5,0.35)',
    padding: 14,
  },
  useFirstHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  useFirstTitle: {
    color: HiveColors.textSecondary,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  useFirstCount: {
    color: HiveColors.orange,
    fontSize: 13,
    fontWeight: '600',
  },
  useFirstRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  useFirstExpiry: {
    color: HiveColors.orange,
    fontWeight: '500',
  },
  usedItButton: {
    backgroundColor: HiveColors.green,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  usedItText: {
    color: HiveColors.white,
    fontSize: 12,
    fontWeight: '600',
  },
  chipRow: {
    flexDirection: 'row',
    gap: 8,
    paddingRight: 4,
  },
  locationChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: HiveColors.card,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: 'transparent',
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  locationChipSelected: {
    backgroundColor: HiveColors.greenLight,
    borderColor: HiveColors.green,
  },
  locationChipText: {
    color: HiveColors.textSecondary,
    fontSize: 13,
    fontWeight: '500',
  },
  locationChipTextSelected: {
    color: HiveColors.green,
  },
  itemList: {
    backgroundColor: HiveColors.white,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: HiveColors.border,
    overflow: 'hidden',
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: HiveColors.border,
  },
  itemIcon: {
    width: 48,
    height: 48,
    borderRadius: 10,
    backgroundColor: HiveColors.greenLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  expiredIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(235,67,53,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemName: {
    color: HiveColors.text,
    fontSize: 15,
    fontWeight: '600',
  },
  itemSub: {
    color: HiveColors.textSecondary,
    fontSize: 12,
    marginTop: 2,
  },
  ellipsisButton: {
    padding: 8,
  },
  emptyState: {
    alignItems: 'center',
    gap: 10,
    paddingTop: 40,
    paddingHorizontal: 40,
  },
  emptyTitle: {
    color: HiveColors.text,
    fontSize: 17,
    fontWeight: '600',
  },
  emptySubtitle: {
    color: HiveColors.textSecondary,
    fontSize: 14,
    textAlign: 'center',
  },
  expiredBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: HiveColors.greenLight,
    borderRadius: 12,
    padding: 14,
  },
  expiredBannerText: {
    color: HiveColors.textSecondary,
    fontSize: 13,
  },
  statCards: {
    flexDirection: 'row',
    gap: 12,
  },
  statCard: {
    flex: 1,
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    gap: 6,
  },
  statValue: {
    fontSize: 28,
    fontWeight: '700',
  },
  statLabel: {
    color: HiveColors.textSecondary,
    fontSize: 12,
  },
  wasteCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: HiveColors.orangeSoft,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(251,188,5,0.30)',
    padding: 16,
  },
  wasteIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(251,188,5,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  wasteTitle: {
    color: HiveColors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  section: {
    gap: 8,
  },
  sectionTitle: {
    color: HiveColors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  categoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: HiveColors.card,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  categoryRank: {
    color: HiveColors.textSecondary,
    fontSize: 13,
    fontWeight: '700',
    width: 20,
  },
  tipsCard: {
    backgroundColor: HiveColors.card,
    borderRadius: 16,
    padding: 16,
    gap: 10,
  },
  tipRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  tipText: {
    color: HiveColors.textSecondary,
    fontSize: 13,
  },
  stateBody: {
    alignItems: 'center',
    gap: 12,
    paddingVertical: 32,
  },
  menu: {
    gap: 4,
    padding: 20,
  },
  menuTitle: {
    marginBottom: 8,
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
  },
  menuDelete: {
    color: HiveColors.danger,
  },
  addSheet: {
    gap: 12,
    padding: 20,
  },
  form: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 32,
    gap: 20,
  },
  fieldLabel: {
    color: HiveColors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 8,
  },
  locationRow: {
    flexDirection: 'row',
    gap: 10,
  },
  locationOption: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: HiveColors.card,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: 'transparent',
    paddingVertical: 10,
  },
  locationOptionSelected: {
    backgroundColor: HiveColors.greenLight,
    borderColor: HiveColors.green,
  },
  locationOptionText: {
    color: HiveColors.text,
    fontSize: 14,
    fontWeight: '500',
  },
  locationOptionTextSelected: {
    color: HiveColors.green,
  },
  saveError: {
    ...uiText.muted,
    color: HiveColors.danger,
  },
});
