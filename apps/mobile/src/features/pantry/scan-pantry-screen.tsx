/**
 * ScanPantryScreen — from Marcos's SwiftUI ScanPantryView. Same three phases:
 *
 * 1. Picking: "Scan Your Pantry" art, Take a Photo (camera) / Upload from
 *    Library (image library).
 * 2. Analyzing: photo preview, spinner, "Penny is scanning your photo…".
 * 3. Review: one card per detected item; each item needs an explicitly
 *    confirmed expiration date before "Save to Pantry" enables.
 *
 * The detection itself is simulated (three mock items after a 2s delay),
 * exactly like the Swift's `simulatedDetection()` — the real model call is
 * the TODO. Saved items go through the backend pantry like everything else.
 */
import { useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';

import { AppButton, AppHeader, HiveIcon, ScrollScreen, uiText } from '@/components/hive-ui';
import { HiveColors } from '@/constants/theme';
import { sharedStyles } from '@/features/app/app-shared';
import { type Navigation } from '@/features/app/navigation-types';
import { usePantry } from '@/features/pantry/pantry-context';
import { expirationDateInDays, locationLabel, type StorageLocation } from '@/features/pantry/pantry-model';
import { ExpirationDateField } from '@/features/pantry/expiration-date-field';

type ScanPhase = 'picking' | 'analyzing' | 'review';

type DetectedItem = {
  id: string;
  name: string;
  quantity: string;
  category: string;
  location: StorageLocation;
  expirationDate: string;
  dateConfirmed: boolean;
};

let detectedId = 0;
const nextId = () => `detected-${Date.now()}-${(detectedId += 1)}`;

/**
 * Simulated AI detection — mirrors the Swift's simulatedDetection().
 * TODO: replace with the real vision-model call; the review phase already
 * treats the list as untrusted input the user must confirm.
 */
function simulatedDetection(): DetectedItem[] {
  return [
    { id: nextId(), name: 'Eggs', quantity: '1 dozen', category: 'Dairy', location: 'REFRIGERATOR', expirationDate: expirationDateInDays(7), dateConfirmed: false },
    { id: nextId(), name: 'Apples', quantity: '4 pcs', category: 'Produce', location: 'REFRIGERATOR', expirationDate: expirationDateInDays(7), dateConfirmed: false },
    { id: nextId(), name: 'Bread', quantity: '1 loaf', category: 'Grains', location: 'PANTRY', expirationDate: expirationDateInDays(7), dateConfirmed: false },
  ];
}

function DetectedItemCard({
  item,
  onConfirmDate,
}: {
  item: DetectedItem;
  onConfirmDate: (id: string, date: string) => void;
}) {
  return (
    <View
      style={[
        styles.detectedCard,
        { borderColor: item.dateConfirmed ? 'rgba(27,94,32,0.4)' : 'rgba(251,188,5,0.4)' },
      ]}>
      <View style={styles.detectedHeader}>
        <View style={styles.detectedIcon}>
          <HiveIcon name="leaf" size={16} color={HiveColors.green} />
        </View>
        <View style={sharedStyles.flexOne}>
          <Text style={styles.itemName} numberOfLines={1}>
            {item.name}
          </Text>
          <Text style={styles.itemSub} numberOfLines={1}>
            {item.quantity} · {locationLabel(item.location)}
          </Text>
        </View>
        {item.dateConfirmed ? <HiveIcon name="checkCircle" size={20} color={HiveColors.green} /> : null}
      </View>
      <View style={styles.detectedDivider} />
      <View style={styles.detectedDate}>
        <ExpirationDateField
          label="Expiration Date"
          value={item.expirationDate}
          confirmed={item.dateConfirmed}
          onConfirm={(date) => onConfirmDate(item.id, date)}
        />
      </View>
    </View>
  );
}

export function ScanPantryScreen({ nav }: { nav: Navigation }) {
  const pantry = usePantry();
  const [phase, setPhase] = useState<ScanPhase>('picking');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [detected, setDetected] = useState<DetectedItem[]>([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function startAnalysis(uri: string) {
    setError('');
    setPhotoUri(uri);
    setPhase('analyzing');
    // Simulated AI detection — see simulatedDetection().
    await new Promise((resolve) => setTimeout(resolve, 2000));
    setDetected(simulatedDetection());
    setPhase('review');
  }

  async function takePhoto() {
    setError('');
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      setError('Camera access is needed to scan your pantry. You can upload a photo from your library instead.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
    });
    if (!result.canceled) {
      const uri = result.assets[0]?.uri;
      if (uri) void startAnalysis(uri);
    }
  }

  async function uploadFromLibrary() {
    setError('');
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setError('Photo library access is needed to upload a pantry photo.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
    });
    if (!result.canceled) {
      const uri = result.assets[0]?.uri;
      if (uri) void startAnalysis(uri);
    }
  }

  const canSaveAll = detected.length > 0 && detected.every((item) => item.dateConfirmed);

  async function saveAll() {
    if (!canSaveAll || saving) return;
    setSaving(true);
    setError('');
    try {
      for (const item of detected) {
        // Best effort, one at a time — a single failure must not lose the rest.
        await pantry
          .addItem({
            name: item.name,
            quantity: item.quantity,
            location: item.location,
            category: item.category,
            expirationDate: item.expirationDate,
          })
          .catch(() => undefined);
      }
      nav.back();
    } catch {
      setError('We could not save those items. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  function pickingBody() {
    return (
      <View style={styles.picking}>
        <View style={styles.pickingArt}>
          <View style={styles.artCircle}>
            <HiveIcon name="camera" size={44} color={HiveColors.green} />
          </View>
          <Text style={styles.pickingTitle}>Scan Your Pantry</Text>
          <Text style={[uiText.muted, sharedStyles.centerText]}>
            Take a photo or upload one. Penny will identify the food items, then you confirm before saving.
          </Text>
        </View>
        <View style={styles.pickingButtons}>
          <AppButton title="Take a Photo" icon="camera" onPress={() => void takePhoto()} />
          <Pressable
            accessibilityRole="button"
            onPress={() => void uploadFromLibrary()}
            style={styles.uploadButton}>
            <HiveIcon name="camera" size={18} color={HiveColors.text} />
            <Text style={styles.uploadText}>Upload from Library</Text>
          </Pressable>
        </View>
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
      </View>
    );
  }

  function analyzingBody() {
    return (
      <View style={styles.analyzing}>
        {photoUri ? (
          <Image source={{ uri: photoUri }} style={styles.photoPreview} resizeMode="cover" />
        ) : (
          <View style={styles.photoPreview} />
        )}
        <ActivityIndicator size="large" color={HiveColors.green} />
        <Text style={styles.pickingTitle}>Penny is scanning your photo…</Text>
        <Text style={uiText.muted}>Identifying food items and categories</Text>
      </View>
    );
  }

  function reviewBody() {
    return (
      <View style={styles.review}>
        <View style={styles.reviewBanner}>
          <HiveIcon name="warning" size={16} color={HiveColors.orange} />
          <Text style={styles.reviewBannerText}>Add an expiration date to each item before saving</Text>
        </View>
        {detected.map((item) => (
          <DetectedItemCard
            key={item.id}
            item={item}
            onConfirmDate={(id, date) =>
              setDetected((prev) =>
                prev.map((entry) =>
                  entry.id === id ? { ...entry, expirationDate: date, dateConfirmed: true } : entry,
                ),
              )
            }
          />
        ))}
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
        <AppButton
          title={
            saving
              ? 'Saving…'
              : canSaveAll
                ? `Save to Pantry (${detected.length} item${detected.length === 1 ? '' : 's'})`
                : 'Add expiration dates to save'
          }
          disabled={!canSaveAll || saving || pantry.isMutating}
          onPress={() => void saveAll()}
        />
      </View>
    );
  }

  return (
    <ScrollScreen>
      <AppHeader title="Scan My Pantry" onBack={nav.back} />
      {phase === 'picking' ? pickingBody() : phase === 'analyzing' ? analyzingBody() : reviewBody()}
    </ScrollScreen>
  );
}

const styles = StyleSheet.create({
  picking: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 48,
    paddingBottom: 32,
    gap: 32,
  },
  pickingArt: {
    alignItems: 'center',
    gap: 12,
  },
  artCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: HiveColors.greenLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickingTitle: {
    color: HiveColors.text,
    fontSize: 24,
    fontWeight: '700',
  },
  pickingButtons: {
    gap: 14,
  },
  uploadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    backgroundColor: HiveColors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: HiveColors.border,
    minHeight: 54,
  },
  uploadText: {
    color: HiveColors.text,
    fontSize: 17,
    fontWeight: '600',
  },
  analyzing: {
    flex: 1,
    alignItems: 'center',
    gap: 16,
    paddingHorizontal: 32,
    paddingTop: 48,
    paddingBottom: 32,
  },
  photoPreview: {
    width: 200,
    height: 200,
    borderRadius: 20,
    backgroundColor: HiveColors.card,
  },
  review: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 32,
    gap: 12,
  },
  reviewBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: HiveColors.orangeBanner,
    borderRadius: 12,
    padding: 14,
  },
  reviewBannerText: {
    flex: 1,
    color: HiveColors.warningText,
    fontSize: 13,
    fontWeight: '500',
  },
  detectedCard: {
    backgroundColor: HiveColors.card,
    borderRadius: 16,
    borderWidth: 1.5,
    padding: 14,
  },
  detectedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  detectedIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: HiveColors.greenLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  detectedDivider: {
    height: 1,
    backgroundColor: HiveColors.border,
    marginVertical: 12,
  },
  detectedDate: {
    gap: 4,
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
  errorText: {
    ...uiText.muted,
    color: HiveColors.danger,
    textAlign: 'center',
  },
});
