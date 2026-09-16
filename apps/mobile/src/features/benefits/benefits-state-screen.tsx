/**
 * Benefits flow, Page 1 — Confirm State (audit Section 3).
 *
 * Matches Marcos's screenshots: a "Finding your location…" locating phase
 * with a manual fallback, a state picker ("Which state are you applying for
 * benefits in?") with ZIP lookup and the full A–Z list, and a confirm phase
 * ("It looks like you're in [State]. Is this the state you're applying for
 * benefits in?").
 *
 * The confirm step is mandatory: the device's physical location is never
 * assumed to be the filing state. Location is only used when permission was
 * already granted (the native prompt lives in onboarding); otherwise the
 * picker is shown straight away with ZIP-code lookup.
 */
import * as Location from 'expo-location';
import { useEffect, useEffectEvent, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { AppButton, HiveIcon, Screen } from '@/components/hive-ui';
import { HiveColors, Spacing } from '@/constants/theme';
import { type Navigation } from '@/features/app/navigation-types';
import { useAppState } from '@/state/app-state';
import { findState, US_STATES, type USState } from './benefits-flow-state';

// TODO (Section 3 audit): confirm this is the exact Penny illustration from
// Marcos's screenshots. penny-money.png is the closest shipped asset.
const pennySource = require('@/assets/images/hive/penny-money.png');

type Phase = 'locating' | 'picker' | 'confirm';

export function BenefitsStateScreen({ nav }: { nav: Navigation }) {
  const app = useAppState();
  const [phase, setPhase] = useState<Phase>('locating');
  const [detected, setDetected] = useState<USState | null>(null);
  const [zip, setZip] = useState('');
  const [zipError, setZipError] = useState('');
  const [resolving, setResolving] = useState(false);

  const runEntryLookup = useEffectEvent(() => {
    // Only use the device location when permission was already granted.
    // Anything else goes straight to the manual picker — no re-prompt here.
    if (app.preferences.locationPermissionStatus !== 'granted') {
      setPhase('picker');
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const position = await Location.getCurrentPositionAsync({});
        const [place] = await Location.reverseGeocodeAsync(position.coords);
        const state = findState(place?.region ?? null);
        if (cancelled) return;
        if (state) {
          setDetected(state);
          setPhase('confirm');
        } else {
          setPhase('picker');
        }
      } catch {
        if (!cancelled) setPhase('picker');
      }
    })();
    return () => {
      cancelled = true;
    };
  });

  /* eslint-disable react-hooks/set-state-in-effect -- one-shot entry lookup:
     reads the permission status once and either reverse-geocodes the device
     location or falls back to the manual picker. Runs a single time. */
  useEffect(() => runEntryLookup(), []);
  /* eslint-enable react-hooks/set-state-in-effect */

  async function findStateForZip() {
    const cleaned = zip.trim();
    if (cleaned.length < 5 || resolving) return;
    setResolving(true);
    setZipError('');
    try {
      // The OS geocoder turns the ZIP into coordinates; reverse-geocoding
      // those gives the state without any client-side ZIP table to maintain.
      const geocoded = await Location.geocodeAsync(cleaned);
      const first = geocoded[0];
      if (!first) {
        setZipError('Could not find that ZIP code. Try again or pick your state below.');
        return;
      }
      const [place] = await Location.reverseGeocodeAsync({
        latitude: first.latitude,
        longitude: first.longitude,
      });
      const state = findState(place?.region ?? null);
      if (state) {
        setDetected(state);
        setPhase('confirm');
      } else {
        setZipError('Could not determine a state from that ZIP code. Pick your state below.');
      }
    } catch {
      setZipError('Could not look up that ZIP code. Try again or pick your state below.');
    } finally {
      setResolving(false);
    }
  }

  if (phase === 'locating') {
    return (
      <Screen>
        <View style={styles.locating}>
          <Image source={pennySource} style={styles.penny} resizeMode="contain" />
          <ActivityIndicator size="large" color={HiveColors.textSecondary} style={styles.spinner} />
          <Text style={styles.locatingTitle}>Finding your location…</Text>
          <Text style={styles.locatingSubtitle}>This helps us show benefits for your state.</Text>
          <View style={styles.locatingButton}>
            <AppButton title="Choose my state manually" variant="secondary" onPress={() => setPhase('picker')} />
          </View>
        </View>
      </Screen>
    );
  }

  if (phase === 'confirm' && detected) {
    return (
      <Screen>
        <View style={styles.confirm}>
          <View style={styles.pinCircle}>
            <HiveIcon name="map" size={44} color={HiveColors.green} />
          </View>
          <Text style={styles.confirmTitle}>It looks like you&apos;re in{'\n'}{detected.name}.</Text>
          <Text style={styles.confirmSubtitle}>Is this the state you&apos;re applying for benefits in?</Text>
          <View style={styles.confirmButtons}>
            <AppButton
              title="Yes, continue"
              onPress={() => nav.push('benefitsProgramPicker', { state: detected.name })}
            />
            <AppButton title="Choose a different state" variant="secondary" onPress={() => setPhase('picker')} />
          </View>
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={styles.pickerHeader}>
        <Text style={styles.pickerTitle}>Which state are you applying for benefits in?</Text>
        <Text style={styles.pickerSubtitle}>Benefits programs vary by state.</Text>
        <View style={styles.zipRow}>
          <TextInput
            style={styles.zipInput}
            value={zip}
            onChangeText={(text) => {
              setZip(text);
              setZipError('');
            }}
            placeholder="Enter ZIP code"
            placeholderTextColor={HiveColors.placeholder}
            keyboardType="number-pad"
            maxLength={10}
            returnKeyType="search"
            onSubmitEditing={findStateForZip}
            accessibilityLabel="Enter ZIP code"
          />
          <AppButton
            title={resolving ? '…' : 'Find State'}
            variant="secondary"
            onPress={findStateForZip}
            disabled={zip.trim().length < 5 || resolving}
            style={styles.zipButton}
          />
        </View>
        {zipError !== '' ? <Text style={styles.zipError}>{zipError}</Text> : null}
      </View>
      <FlatList
        data={US_STATES}
        keyExtractor={(state) => state.code}
        contentContainerStyle={styles.stateList}
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Apply in ${item.name}`}
            onPress={() => {
              setDetected(item);
              setPhase('confirm');
            }}
            style={({ pressed }) => [styles.stateRow, pressed && styles.stateRowPressed]}>
            <Text style={styles.stateName}>{item.name}</Text>
            <HiveIcon name="next" size={16} color={HiveColors.textSecondary} />
          </Pressable>
        )}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  locating: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.four,
    backgroundColor: HiveColors.white,
  },
  penny: { width: 120, height: 120, marginBottom: Spacing.three },
  spinner: { marginBottom: Spacing.three },
  locatingTitle: { fontSize: 20, fontWeight: '700', color: HiveColors.text, marginBottom: Spacing.one },
  locatingSubtitle: { fontSize: 15, color: HiveColors.textSecondary, textAlign: 'center', marginBottom: Spacing.five },
  locatingButton: { width: '100%' },
  pickerHeader: { paddingHorizontal: Spacing.three, paddingTop: Spacing.four, gap: Spacing.two },
  pickerTitle: { fontSize: 28, fontWeight: '800', color: HiveColors.text },
  pickerSubtitle: { fontSize: 15, color: HiveColors.textSecondary },
  zipRow: { flexDirection: 'row', gap: Spacing.two, alignItems: 'center', marginTop: Spacing.one },
  zipInput: {
    flex: 1,
    backgroundColor: HiveColors.card,
    borderRadius: 12,
    paddingHorizontal: Spacing.three,
    paddingVertical: 14,
    fontSize: 16,
    color: HiveColors.text,
  },
  zipButton: { minWidth: 110 },
  zipError: { color: HiveColors.danger, fontSize: 13 },
  stateList: { paddingBottom: Spacing.five },
  stateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.three,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: HiveColors.border,
  },
  stateRowPressed: { backgroundColor: HiveColors.card },
  stateName: { fontSize: 17, color: HiveColors.text },
  confirm: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.four,
    backgroundColor: HiveColors.white,
  },
  pinCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: HiveColors.greenLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.four,
  },
  confirmTitle: { fontSize: 28, fontWeight: '800', color: HiveColors.text, textAlign: 'center', marginBottom: Spacing.two },
  confirmSubtitle: { fontSize: 15, color: HiveColors.textSecondary, textAlign: 'center', marginBottom: Spacing.five },
  confirmButtons: { width: '100%', gap: Spacing.two },
});
