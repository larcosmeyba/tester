// The pantry screens.
//
// The markup is the Xcode-derived design, unchanged from when this was part of
// app-root.tsx. What changed underneath is the data: it now comes from the Help
// The Hive backend (internal/modules/pantry) through PantryProvider, instead of
// a locally-persisted array seeded from mock-data.ts.
//
// The loading, error and retry states follow the same shape as the meal screens
// so the app behaves consistently when the network does not cooperate.

import { useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';

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
import { formatDate, useAppState } from '@/state/app-state';
import { capitalize, sharedStyles } from '@/features/app/app-shared';
import { type Navigation } from '@/features/app/navigation-types';
import { usePantry } from '@/features/pantry/pantry-context';
import {
  STORAGE_LOCATIONS,
  expirationDateInDays,
  locationIconFor,
  locationLabel,
  type PantryFilter,
  type StorageLocation,
} from '@/features/pantry/pantry-model';

export function PantryScreen({ nav }: { nav: Navigation }) {
  const app = useAppState();
  const pantry = usePantry();
  const [filter, setFilter] = useState<PantryFilter>('active');

  const items =
    filter === 'active' ? pantry.activeItems : filter === 'used' ? pantry.usedItems : pantry.expiredItems;

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
          subtitle={filter === 'active' ? 'Add items manually or scan them with your camera.' : undefined}
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
              {item.quantity} - {locationLabel(item.location)} - Expires {formatDate(item.expirationDate)}
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
      <View style={sharedStyles.filterRow}>
        {(['active', 'used', 'expired'] as const).map((item) => (
          <Chip key={item} label={capitalize(item)} selected={filter === item} onPress={() => setFilter(item)} />
        ))}
      </View>
      <View style={sharedStyles.listStack}>{body()}</View>
      <View style={styles.sideMargin}>
        <View style={styles.addRow}>
          <AppButton title="Scan Items" variant="secondary" onPress={() => nav.push('scanPantry')} style={sharedStyles.flexOne} />
          <AppButton title="Add Pantry Item" icon="plus" onPress={() => nav.push('addPantry')} style={sharedStyles.flexOne} />
        </View>
      </View>
    </ScrollScreen>
  );
}

export function AddPantryScreen({ nav }: { nav: Navigation }) {
  const pantry = usePantry();
  const [name, setName] = useState('');
  const [quantity, setQuantity] = useState('');
  const [location, setLocation] = useState<StorageLocation>('PANTRY');
  const [category, setCategory] = useState('Other');
  const [days, setDays] = useState('7');
  const [saveError, setSaveError] = useState('');

  async function save() {
    setSaveError('');
    try {
      await pantry.addItem({
        name: name.trim(),
        quantity: quantity.trim(),
        location,
        category: category.trim() || 'Other',
        expirationDate: expirationDateInDays(Number.parseInt(days, 10) || 7),
      });
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
      <AppHeader title="Add Pantry Item" onBack={nav.back} />
      <View style={sharedStyles.formScreen}>
        <AppButton title="Scan with Camera Instead" variant="secondary" onPress={() => nav.push('scanPantry')} />
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

type DetectedPantryItem = {
  key: string;
  name: string;
  quantity: string;
  location: StorageLocation;
  category: string;
  days: string;
  selected: boolean;
};

/**
 * What the (simulated) vision pass returns. A fixed, plausible fridge haul —
 * the point of this screen in preview builds is the review-and-confirm flow,
 * not the recognition itself.
 */
const PREVIEW_DETECTIONS: Array<Omit<DetectedPantryItem, 'key' | 'selected'>> = [
  { name: 'Milk', quantity: '1 gallon', location: 'REFRIGERATOR', category: 'Dairy', days: '7' },
  { name: 'Eggs', quantity: '1 dozen', location: 'REFRIGERATOR', category: 'Dairy', days: '14' },
  { name: 'Bread', quantity: '1 loaf', location: 'PANTRY', category: 'Bakery', days: '5' },
  { name: 'Apples', quantity: '4', location: 'PANTRY', category: 'Produce', days: '10' },
];

export function ScanPantryScreen({ nav }: { nav: Navigation }) {
  const pantry = usePantry();
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [phase, setPhase] = useState<'idle' | 'analyzing' | 'review' | 'saving'>('idle');
  const [detected, setDetected] = useState<DetectedPantryItem[]>([]);
  const [notice, setNotice] = useState('');

  async function handleAsset(uri: string) {
    setPhotoUri(uri);
    setPhase('analyzing');
    setNotice('');
    // Preview build: on-device/server vision is not wired yet (there is no
    // scan endpoint in the API contract), so the detection pass is simulated.
    // Everything after it — review, edit, confirm, save — is the real flow
    // and writes through the same pantry.addItem as manual entry.
    await new Promise((resolve) => setTimeout(resolve, 1500));
    setDetected(PREVIEW_DETECTIONS.map((item, index) => ({ ...item, key: `scan-${index}`, selected: true })));
    setPhase('review');
  }

  async function takePhoto() {
    setNotice('');
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        setNotice('Camera access was denied. Choose a photo from your library instead, or add items manually.');
        return;
      }
      const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.8 });
      if (!result.canceled && result.assets[0]) await handleAsset(result.assets[0].uri);
    } catch {
      setNotice('The camera is not available on this device. Choose a photo from your library instead.');
    }
  }

  async function chooseFromLibrary() {
    setNotice('');
    try {
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
      if (!result.canceled && result.assets[0]) await handleAsset(result.assets[0].uri);
    } catch {
      setNotice('Could not open your photo library. Please try again.');
    }
  }

  function toggleSelected(key: string) {
    setDetected((current) =>
      current.map((item) => (item.key === key ? { ...item, selected: !item.selected } : item))
    );
  }

  function updateDetected(key: string, patch: Partial<DetectedPantryItem>) {
    setDetected((current) => current.map((item) => (item.key === key ? { ...item, ...patch } : item)));
  }

  function retake() {
    setPhotoUri(null);
    setDetected([]);
    setNotice('');
    setPhase('idle');
  }

  async function saveSelected() {
    const chosen = detected.filter((item) => item.selected && item.name.trim().length > 0);
    if (chosen.length === 0) {
      setNotice('Select at least one item to add.');
      return;
    }
    setPhase('saving');
    setNotice('');
    try {
      for (const item of chosen) {
        await pantry.addItem({
          name: item.name.trim(),
          quantity: item.quantity.trim() || '1',
          location: item.location,
          category: item.category.trim() || 'Other',
          expirationDate: expirationDateInDays(Number.parseInt(item.days, 10) || 7),
        });
      }
      nav.back();
    } catch {
      setNotice(pantry.error || 'We could not save those items. Please try again.');
      setPhase('review');
    }
  }

  const selectedCount = detected.filter((item) => item.selected).length;

  return (
    <ScrollScreen keyboard>
      <AppHeader title="Scan Items" onBack={nav.back} />
      <View style={sharedStyles.formScreen}>
        {phase === 'idle' ? (
          <>
            <Text style={uiText.subtitle}>Take a photo of your fridge or pantry</Text>
            <Text style={uiText.muted}>
              Penny will pull out the items she can see. You review everything before anything is added — nothing is
              saved automatically.
            </Text>
            {notice ? <Text style={styles.saveError}>{notice}</Text> : null}
            <AppButton title="Take a Photo" onPress={() => void takePhoto()} />
            <AppButton title="Choose from Library" variant="secondary" onPress={() => void chooseFromLibrary()} />
            <Text style={sharedStyles.miniMuted}>
              Preview: item detection is simulated in this build. Real photo recognition arrives with the backend.
            </Text>
          </>
        ) : null}

        {phase === 'analyzing' && photoUri ? (
          <View style={styles.stateBody}>
            <Image source={{ uri: photoUri }} style={styles.scanPhoto} resizeMode="cover" />
            <ActivityIndicator size="large" color={HiveColors.green} />
            <Text style={uiText.muted}>Looking at your photo…</Text>
          </View>
        ) : null}

        {phase === 'review' || phase === 'saving' ? (
          <>
            {photoUri ? <Image source={{ uri: photoUri }} style={styles.scanPhotoSmall} resizeMode="cover" /> : null}
            <Text style={uiText.subtitle}>We spotted these items</Text>
            <Text style={uiText.muted}>
              Uncheck anything we got wrong, fix names and quantities, then add them to your pantry.
            </Text>
            {detected.map((item) => (
              <View key={item.key} style={styles.scanRow}>
                <Pressable
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: item.selected }}
                  accessibilityLabel={`Include ${item.name || 'item'}`}
                  onPress={() => toggleSelected(item.key)}
                  style={[styles.scanCheck, item.selected && styles.scanCheckOn]}
                />
                <View style={sharedStyles.flexOne}>
                  <TextInput
                    value={item.name}
                    onChangeText={(value) => updateDetected(item.key, { name: value })}
                    placeholder="Item name"
                    placeholderTextColor={HiveColors.textSecondary}
                    style={styles.scanInput}
                  />
                  <Text style={sharedStyles.miniMuted}>
                    {locationLabel(item.location)} · {item.category}
                  </Text>
                </View>
                <TextInput
                  value={item.quantity}
                  onChangeText={(value) => updateDetected(item.key, { quantity: value })}
                  placeholder="Qty"
                  placeholderTextColor={HiveColors.textSecondary}
                  style={[styles.scanInput, styles.scanQty]}
                />
              </View>
            ))}
            {notice ? <Text style={styles.saveError}>{notice}</Text> : null}
            <AppButton
              title={phase === 'saving' ? 'Adding…' : `Add ${selectedCount} Item${selectedCount === 1 ? '' : 's'}`}
              disabled={selectedCount === 0 || phase === 'saving' || pantry.isMutating}
              onPress={() => void saveSelected()}
            />
            <AppButton title="Retake Photo" variant="plain" disabled={phase === 'saving'} onPress={retake} />
          </>
        ) : null}
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
  addRow: {
    flexDirection: 'row',
    gap: 10,
  },
  scanPhoto: {
    width: '100%',
    height: 220,
    borderRadius: 12,
    backgroundColor: HiveColors.card,
  },
  scanPhotoSmall: {
    width: '100%',
    height: 120,
    borderRadius: 12,
    backgroundColor: HiveColors.card,
  },
  scanRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: HiveColors.border,
  },
  scanCheck: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: HiveColors.border,
    backgroundColor: HiveColors.white,
  },
  scanCheckOn: {
    borderColor: HiveColors.green,
    backgroundColor: HiveColors.green,
  },
  scanInput: {
    fontSize: 15,
    color: HiveColors.text,
    paddingVertical: 6,
  },
  scanQty: {
    width: 88,
    textAlign: 'right',
  },
  stateBody: {
    alignItems: 'center',
    gap: 12,
    paddingVertical: 32,
  },
});
