// The Home tab — Marcos's approved Section 2 home screen
// ("Home Screen Update .png"). Source of truth for layout/copy.

import { useState } from 'react';
import {
  Alert,
  Animated,
  Image,
  Linking,
  PanResponder,
  Pressable,
  ScrollView,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AvatarButton, HiveIcon } from '@/components/hive-ui';
import { FloatingPill, useFloatingTabBarSpace, FLOATING_TAB_BAR_HEIGHT } from '@/components/hive-navigation';
import { useAppState } from '@/state/app-state';
import { usePantry } from '@/features/pantry/pantry-context';
import { StyleSheet } from 'react-native';
import { sharedStyles } from '@/features/app/app-shared';
import { type Navigation } from '@/features/app/navigation-types';
import { HiveColors, Shadows } from '@/constants/theme';
import { type ResourceItem } from '@/data/mock-data';
import { getHomeResources } from './home-resources';

const pennyWaveHomeSource = require('@/assets/images/hive/penny-wave-home.png');
// TODO (Section 2 audit): replace the placeholder above with the exact Home
// greeting Penny image from Marcos's ZIP — follow the approved screenshot for
// spacing, size, and overall design.
const askPennySource = require('@/assets/images/hive/ask-penny.png');

const BENEFIT_PILLS = ['SNAP', 'WIC', 'Medicaid', 'LIHEAP', 'And more'];

const BADGE_TONES = {
  green: { bg: '#E8F5E9', fg: '#2E7D32' },
  orange: { bg: '#FFF3E0', fg: '#E65100' },
  pink: { bg: '#FCE4EC', fg: '#C2185B' },
  blue: { bg: '#E3F2FD', fg: '#1565C0' },
} as const;

export function HomeScreen({ nav }: { nav: Navigation }) {
  const app = useAppState();
  const firstName = app.profile.firstName || 'there';

  async function pickAndSavePhoto() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
    });
    if (!result.canceled && result.assets[0]) {
      const uri = result.assets[0].uri;
      await app.saveProfile({ profileImageUri: uri });
      app.setLocalProfileImage(uri);
    }
  }

  async function removePhoto() {
    await app.saveProfile({ profileImageUri: null });
    app.setLocalProfileImage(undefined);
  }

  /** The header avatar opens profile-photo change/update ONLY. */
  function onAvatarPress() {
    const options: { text: string; style?: 'destructive' | 'cancel'; onPress?: () => void }[] = [
      { text: 'Change Photo', onPress: () => void pickAndSavePhoto() },
    ];
    if (app.profile.profileImageUri) {
      options.push({ text: 'Remove Photo', style: 'destructive', onPress: () => void removePhoto() });
    }
    options.push({ text: 'Cancel', style: 'cancel' });
    Alert.alert('Profile Photo', 'Update your profile photo.', options);
  }

  return (
    <View style={sharedStyles.tabScreen}>
      <ScrollView contentContainerStyle={styles.homeContent} showsVerticalScrollIndicator={false}>
        <View style={styles.homeHeader}>
          <View style={styles.greetingRow}>
            <Text style={styles.homeGreeting}>Hi {firstName},</Text>
            <Image source={pennyWaveHomeSource} style={styles.pennyWave} resizeMode="contain" />
          </View>
          <Text style={styles.homeSubGreeting}>Let&apos;s get you the help you need.</Text>
        </View>
        <View style={styles.avatarWrap}>
          <AvatarButton imageUri={app.profile.profileImageUri} onPress={onAvatarPress} accessibilityLabel="Change profile photo" />
        </View>

        <ExpiringSoonBanner onPress={() => nav.push('pantry')} />

        <Text style={styles.homeQuestion}>What would you like to do first?</Text>

        <View style={styles.actionStack}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Apply for Benefits"
            onPress={() => nav.push('government')}
            style={({ pressed }) => [styles.card, styles.greenCard, pressed && sharedStyles.pressed]}>
            <View style={styles.cardTopRow}>
              <View style={[styles.cardIconCircle, styles.greenCircle]}>
                <HiveIcon name="doc" size={24} color={HiveColors.white} />
              </View>
              <Text style={styles.cardTitle}>Apply for Benefits</Text>
              <HiveIcon name="bank" size={40} color="rgba(0,0,0,0.22)" />
              <HiveIcon name="next" size={18} color="rgba(255,255,255,0.9)" />
            </View>
            <View style={styles.pillRow}>
              {BENEFIT_PILLS.map((pill) => (
                <View key={pill} style={styles.benefitPill}>
                  <Text style={styles.benefitPillText}>{pill}</Text>
                </View>
              ))}
            </View>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Budget your meal plan for the week"
            onPress={() => router.push('/meals/questionnaire')}
            style={({ pressed }) => [styles.card, styles.blueCard, pressed && sharedStyles.pressed]}>
            <View style={styles.cardTopRow}>
              <View style={[styles.cardIconCircle, styles.blueCircle]}>
                <HiveIcon name="fork" size={24} color={HiveColors.white} />
              </View>
              <Text style={styles.cardTitle}>Budget your meal plan for{'\n'}the week</Text>
              <View style={sharedStyles.flexOne} />
              <HiveIcon name="next" size={18} color="rgba(255,255,255,0.9)" />
            </View>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Cook what I have"
            onPress={() => nav.push('pantry')}
            style={({ pressed }) => [styles.card, styles.orangeCard, pressed && sharedStyles.pressed]}>
            <View style={styles.cardTopRow}>
              <View style={[styles.cardIconCircle, styles.orangeCircle]}>
                <HiveIcon name="fridge" size={24} color={HiveColors.white} />
              </View>
              <View style={sharedStyles.flexOne}>
                <Text style={styles.cardTitle}>Cook what I have</Text>
                <Text style={styles.cardSubtitle}>
                  See recipes based on what{'\n'}you already have at home
                </Text>
              </View>
              <HiveIcon name="carrot" size={34} color="rgba(255,255,255,0.30)" />
              <HiveIcon name="next" size={18} color="rgba(255,255,255,0.9)" />
            </View>
          </Pressable>
        </View>

        <View style={styles.resourcesHeaderRow}>
          <Text style={styles.resourcesTitle}>Resources Near You</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="See all resources"
            onPress={() => nav.push('resources')}
            style={({ pressed }) => [styles.seeAllPill, pressed && sharedStyles.pressed]}>
            <Text style={styles.seeAllText}>See all</Text>
          </Pressable>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.resourceCarousel}
          snapToInterval={264}
          decelerationRate="fast">
          {getHomeResources().map((resource) => (
            <HomeResourceCard
              key={resource.id}
              resource={resource}
              onPress={() => nav.push('resourceDetails', { resource })}
            />
          ))}
        </ScrollView>
      </ScrollView>

      {app.cart.length > 0 ? (
        <View pointerEvents="box-none" style={styles.cartPillRow}>
          <FloatingPill
            icon="cart"
            tone="light"
            align="left"
            label={`${app.cart.length} item cart · Clear`}
            onPress={app.clearCart}
          />
        </View>
      ) : null}

      {/* TODO (Section 7 audit): Penny AI does not accept screen context yet.
          Pass e.g. { source: 'home' } here once the Penny service supports it,
          so Penny knows the user is asking from the Home screen. */}
      <AskPennyFab onPress={() => app.setSelectedTab(2)} />
    </View>
  );
}

/**
 * "Use It Soon" banner — shows when pantry items expire within 5 days.
 * Marcos's HomeView design; taps through to the pantry.
 */
function ExpiringSoonBanner({ onPress }: { onPress: () => void }) {
  const { expiringItems } = usePantry();
  const expiringCount = expiringItems.length;
  if (expiringCount === 0) {
    return null;
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Use it soon, ${expiringCount} pantry items expiring`}
      onPress={onPress}
      style={({ pressed }) => [styles.expiringBanner, pressed && sharedStyles.pressed]}>
      <View style={styles.expiringIconCircle}>
        <Text style={styles.expiringIcon}>🐝</Text>
      </View>
      <View style={sharedStyles.flexOne}>
        <Text style={styles.expiringTitle}>Use It Soon 🐝</Text>
        <Text style={styles.expiringSubtitle}>
          {expiringCount} pantry item{expiringCount === 1 ? '' : 's'} expiring in the next 5 days
        </Text>
      </View>
      <HiveIcon name="next" size={16} color={HiveColors.orange} />
    </Pressable>
  );
}

function HomeResourceCard({ resource, onPress }: { resource: ResourceItem; onPress: () => void }) {
  const badge = BADGE_TONES[resource.badgeTone ?? 'green'];
  const [days, time] = resource.hours.split('·').map((part) => part.trim());
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={resource.name}
      onPress={onPress}
      style={({ pressed }) => [styles.resCard, pressed && sharedStyles.pressed]}>
      <View style={[styles.resBadge, { backgroundColor: badge.bg }]}>
        <Text style={[styles.resBadgeText, { color: badge.fg }]}>{resource.tag}</Text>
      </View>
      <Text style={styles.resName} numberOfLines={2}>{resource.name}</Text>
      <View style={styles.resMetaRow}>
        <HiveIcon name="map" size={13} color={HiveColors.green} />
        <Text style={styles.resMetaText}>
          {resource.distance} · {days}
        </Text>
      </View>
      <View style={styles.resMetaRow}>
        <HiveIcon name="bell" size={13} color={HiveColors.green} />
        <Text style={styles.resMetaText}>{time}</Text>
      </View>
      <Text style={styles.resDescription} numberOfLines={3}>{resource.description}</Text>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={`Learn more about ${resource.name}`}
        onPress={(event) => {
          event.stopPropagation();
          openResourceWebsite(resource.website);
        }}
        style={({ pressed }) => [styles.learnMoreButton, pressed && sharedStyles.pressed]}>
        <Text style={styles.learnMoreText}>Learn More</Text>
      </Pressable>
    </Pressable>
  );
}

/** Marcos: Learn More goes straight to the resource's website. */
function openResourceWebsite(website?: string) {
  if (!website) {
    return;
  }
  const url = website.startsWith('http') ? website : `https://${website}`;
  void Linking.openURL(url);
}

/**
 * Draggable "Ask Penny" floating button (Marcos: "moveable and is in a circle").
 * Drag anywhere; a tap (no drag) opens Penny AI directly.
 */
function AskPennyFab({ onPress }: { onPress: () => void }) {
  const barSpace = useFloatingTabBarSpace();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const initial = { x: screenWidth - 208, y: screenHeight - barSpace - 92 };
  // Mutable drag state lives in a plain container (not a React ref): it is only
  // touched from the PanResponder's event handlers, never during render.
  const [drag] = useState(() => ({ base: initial, moved: false }));
  const [pan] = useState(() => new Animated.ValueXY(initial));

  const minX = 12;
  const maxX = screenWidth - 208;
  const minY = insets.top + 60;
  const maxY = screenHeight - barSpace - 96;
  const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

  const [responder] = useState(() =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        drag.moved = false;
      },
      onPanResponderMove: (_, gesture) => {
        if (Math.abs(gesture.dx) + Math.abs(gesture.dy) > 8) {
          drag.moved = true;
        }
        pan.setValue({
          x: clamp(drag.base.x + gesture.dx, minX, maxX),
          y: clamp(drag.base.y + gesture.dy, minY, maxY),
        });
      },
      onPanResponderRelease: (_, gesture) => {
        const next = {
          x: clamp(drag.base.x + gesture.dx, minX, maxX),
          y: clamp(drag.base.y + gesture.dy, minY, maxY),
        };
        drag.base = next;
        Animated.spring(pan, { toValue: next, useNativeDriver: false, speed: 20 }).start();
        if (!drag.moved) {
          onPress();
        }
      },
    }),
  );

  return (
    <Animated.View
      {...responder.panHandlers}
      style={[styles.askPenny, { transform: pan.getTranslateTransform() }]}>
      <View style={styles.askPennyPill}>
        <Text style={styles.askPennyText}>Ask Penny</Text>
      </View>
      <Image source={askPennySource} style={styles.askPennyCircle} resizeMode="cover" />
    </Animated.View>
  );
}

const CARD_GREEN = '#2C5731';
const CARD_BLUE = '#3B73ED';
const CARD_ORANGE = '#BD7136';

const styles = StyleSheet.create({
  homeContent: {
    paddingBottom: FLOATING_TAB_BAR_HEIGHT + 120,
  },
  homeHeader: {
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  greetingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  homeGreeting: {
    color: HiveColors.text,
    fontSize: 28,
    fontWeight: '800',
  },
  pennyWave: {
    width: 46,
    height: 46,
  },
  avatarWrap: {
    position: 'absolute',
    top: 16,
    right: 20,
  },
  homeSubGreeting: {
    color: HiveColors.textSecondary,
    fontSize: 15,
    marginTop: 6,
  },
  homeQuestion: {
    color: HiveColors.text,
    fontSize: 19,
    fontWeight: '800',
    paddingHorizontal: 20,
    marginTop: 18,
    marginBottom: 14,
  },
  actionStack: {
    gap: 12,
    paddingHorizontal: 20,
  },
  card: {
    borderRadius: 20,
    padding: 16,
    gap: 14,
  },
  greenCard: { backgroundColor: CARD_GREEN },
  blueCard: { backgroundColor: CARD_BLUE },
  orangeCard: { backgroundColor: CARD_ORANGE },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  cardIconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.22)',
  },
  greenCircle: {},
  blueCircle: {},
  orangeCircle: {},
  cardTitle: {
    color: HiveColors.white,
    fontSize: 19,
    fontWeight: '800',
    flex: 1,
    lineHeight: 24,
  },
  cardSubtitle: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 14,
    lineHeight: 19,
    marginTop: 4,
  },
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  benefitPill: {
    backgroundColor: 'rgba(255,255,255,0.20)',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  benefitPillText: {
    color: HiveColors.white,
    fontSize: 13,
    fontWeight: '700',
  },
  resourcesHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    marginTop: 24,
    marginBottom: 12,
  },
  resourcesTitle: {
    color: HiveColors.text,
    fontSize: 19,
    fontWeight: '800',
  },
  seeAllPill: {
    backgroundColor: '#EDF7EC',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  seeAllText: {
    color: HiveColors.green,
    fontSize: 14,
    fontWeight: '700',
  },
  resourceCarousel: {
    paddingHorizontal: 20,
    gap: 12,
    paddingBottom: 8,
  },
  resCard: {
    width: 252,
    backgroundColor: HiveColors.white,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: HiveColors.border,
    padding: 14,
    gap: 8,
  },
  resBadge: {
    alignSelf: 'flex-start',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  resBadgeText: {
    fontSize: 13,
    fontWeight: '700',
  },
  resName: {
    color: HiveColors.text,
    fontSize: 17,
    fontWeight: '800',
    lineHeight: 22,
  },
  resMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  resMetaText: {
    color: HiveColors.textSecondary,
    fontSize: 13,
  },
  resDescription: {
    color: HiveColors.textSecondary,
    fontSize: 14,
    lineHeight: 19,
  },
  learnMoreButton: {
    backgroundColor: CARD_GREEN,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 4,
  },
  learnMoreText: {
    color: HiveColors.white,
    fontSize: 15,
    fontWeight: '700',
  },
  expiringBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginHorizontal: 20,
    marginTop: 16,
    marginBottom: 4,
    padding: 14,
    backgroundColor: '#FFF0CC',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,149,0,0.4)',
  },
  expiringIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,149,0,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  expiringIcon: {
    fontSize: 22,
  },
  expiringTitle: {
    color: '#8C4700',
    fontSize: 15,
    fontWeight: '800',
  },
  expiringSubtitle: {
    color: '#8C5900',
    fontSize: 13,
    marginTop: 3,
  },
  cartPillRow: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 170,
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  askPenny: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    width: 196,
    height: 64,
  },
  askPennyPill: {
    backgroundColor: '#FBF0C9',
    borderRadius: 20,
    paddingLeft: 18,
    paddingRight: 44,
    paddingVertical: 12,
    ...Shadows.soft,
  },
  askPennyText: {
    color: HiveColors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  askPennyCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    marginLeft: -36,
    borderWidth: 2,
    borderColor: HiveColors.green,
  },
});
