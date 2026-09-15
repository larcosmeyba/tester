// The Home tab — rebuilt from Marcos's SwiftUI HomeView
// (6_-_HomeView__home_page-2.swift). Design truth is the Swift file plus the
// approved Home screenshot; every data surface below is real backend state.
//
// Layout: greeting header → "Use It Soon" pantry banner (when items expire)
// → three quick-action cards → "Resources Near You" fed by the real
// GET /resources/nearby endpoint (coordinates when location is granted,
// profile ZIP fallback, honest loading/unavailable/empty states — never
// demo listings, never invented distances).

import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Image,
  PanResponder,
  Pressable,
  ScrollView,
  Text,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AvatarButton, HiveIcon } from '@/components/hive-ui';
import { FloatingPill, useFloatingTabBarSpace, FLOATING_TAB_BAR_HEIGHT } from '@/components/hive-navigation';
import { useAppState } from '@/state/app-state';
import { usePantry } from '@/features/pantry/pantry-context';
import { setPennyContext } from '@/features/penny/penny-context';
import { sharedStyles } from '@/features/app/app-shared';
import { type Navigation } from '@/features/app/navigation-types';
import { HiveColors, Shadows } from '@/constants/theme';
import { useResponsive } from '@/constants/responsive';
import {
  formatResourceDistance,
  useHomeResources,
  type HomeResourceLookupState,
} from './use-home-resources';
import type { NearbyResource } from '@/features/resources/resource-service';

const pennyWaveHomeSource = require('@/assets/images/hive/penny-wave-home.png');
const askPennySource = require('@/assets/images/hive/ask-penny.png');

const BENEFIT_PILLS = ['SNAP', 'WIC', 'Medicaid', 'LIHEAP', 'And more'];

const BADGE_TONES = {
  green: { bg: '#E8F5E9', fg: '#2E7D32' },
  orange: { bg: '#FFF3E0', fg: '#E65100' },
  pink: { bg: '#FCE4EC', fg: '#C2185B' },
  blue: { bg: '#E3F2FD', fg: '#1565C0' },
} as const;

function badgeToneFor(tag: string): keyof typeof BADGE_TONES {
  const lowered = tag.toLowerCase();
  if (lowered.includes('wic')) return 'pink';
  if (lowered.includes('snap') || lowered.includes('calfresh')) return 'orange';
  if (lowered.includes('health') || lowered.includes('clinic') || lowered.includes('medicaid')) return 'blue';
  return 'green';
}

export function HomeScreen({ nav }: { nav: Navigation }) {
  const app = useAppState();
  const styles = useHomeStyles();
  const firstName = app.profile.firstName.trim();
  // Never a dangling comma: fall back to a neutral greeting, not "Hi ,".
  const greeting = firstName ? `Hi ${firstName},` : 'Hi there,';

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
            <Text style={styles.homeGreeting}>{greeting}</Text>
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
            onPress={() => nav.push('benefitsState')}
            style={({ pressed }) => [styles.card, pressed && sharedStyles.pressed]}>
            <LinearGradient
              colors={['#216B38', '#0F441F']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.cardGradient}>
              <View style={styles.cardTopRow}>
                <View style={styles.cardIconCircle}>
                  <HiveIcon name="doc" size={24} color={HiveColors.white} />
                </View>
                <Text style={styles.cardTitle}>Apply for Benefits</Text>
                <HiveIcon name="bank" size={34} color="rgba(255,255,255,0.30)" />
                <HiveIcon name="next" size={14} color="rgba(255,255,255,0.65)" />
              </View>
              <View style={styles.pillRow}>
                {BENEFIT_PILLS.map((pill) => (
                  <View key={pill} style={styles.benefitPill}>
                    <Text style={styles.benefitPillText}>{pill}</Text>
                  </View>
                ))}
              </View>
            </LinearGradient>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Budget your meal plan for the week"
            onPress={() => router.push('/meals/source')}
            style={({ pressed }) => [styles.card, pressed && sharedStyles.pressed]}>
            <LinearGradient
              colors={['#3887FF', '#0061EB']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.cardGradient}>
              <View style={styles.cardTopRow}>
                <View style={styles.cardIconCircle}>
                  <HiveIcon name="fork" size={24} color={HiveColors.white} />
                </View>
                <Text style={styles.cardTitle}>Budget your meal plan for{'\n'}the week</Text>
                <View style={sharedStyles.flexOne} />
                <HiveIcon name="next" size={14} color="rgba(255,255,255,0.65)" />
              </View>
            </LinearGradient>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Cook what I have"
            onPress={() => nav.push('cookWhatIHave')}
            style={({ pressed }) => [styles.card, pressed && sharedStyles.pressed]}>
            <LinearGradient
              colors={['#D9772A', '#B85F1D']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.cardGradient}>
              <View style={styles.cardTopRow}>
                <View style={styles.cardIconCircle}>
                  <HiveIcon name="fridge" size={24} color={HiveColors.white} />
                </View>
                <View style={sharedStyles.flexOne}>
                  <Text style={styles.cardTitle}>Cook what I have</Text>
                  <Text style={styles.cardSubtitle}>
                    See recipes based on what you already have at home
                  </Text>
                </View>
                <HiveIcon name="carrot" size={30} color="rgba(255,255,255,0.30)" />
                <HiveIcon name="next" size={14} color="rgba(255,255,255,0.65)" />
              </View>
            </LinearGradient>
          </Pressable>
        </View>

        <HomeResourcesSection nav={nav} />
      </ScrollView>

      {app.cart.length > 0 ? (
        <View pointerEvents="box-none" style={styles.cartPillRow}>
          <FloatingPill
            icon="cart"
            tone="light"
            align="left"
            label={`${app.cart.length} item${app.cart.length === 1 ? '' : 's'} · Send to Instacart`}
            onPress={() => router.push('/meals/instacart')}
          />
        </View>
      ) : null}

      <AskPennyFab
        onPress={() => {
          setPennyContext({ source: 'home' });
          app.setSelectedTab(2);
        }}
      />
    </View>
  );
}

/**
 * "Use It Soon" banner — shows when pantry items expire within 5 days.
 * Marcos's HomeView design; taps through to the pantry.
 */
function ExpiringSoonBanner({ onPress }: { onPress: () => void }) {
  const styles = useHomeStyles();
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

function HomeResourcesSection({ nav }: { nav: Navigation }) {
  const styles = useHomeStyles();
  const lookup = useHomeResources();

  const header = (title: string, caption: string | null) => (
    <>
      <View style={styles.resourcesHeaderRow}>
        <View style={styles.resourcesTitleWrap}>
          <Text style={styles.resourcesTitle}>{title}</Text>
          {caption ? <Text style={styles.resourcesSubtitle}>{caption}</Text> : null}
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="See all resources"
          onPress={() => nav.push('resources')}
          style={({ pressed }) => [styles.seeAllPill, pressed && sharedStyles.pressed]}>
          <Text style={styles.seeAllText}>See all</Text>
        </Pressable>
      </View>
    </>
  );

  const body = (state: HomeResourceLookupState) => {
    switch (state.status) {
      case 'loading':
        return (
          <View style={styles.lookupCentered}>
            <ActivityIndicator size="large" color={HiveColors.green} />
          </View>
        );
      case 'unavailable':
        return (
          <View style={styles.lookupCentered}>
            <HiveIcon name="map" size={36} color={HiveColors.border} />
            <Text style={styles.lookupUnavailable}>{state.message}</Text>
          </View>
        );
      case 'empty':
        return (
          <View style={styles.lookupCentered}>
            <Text style={styles.lookupUnavailable}>No resources found nearby right now.</Text>
          </View>
        );
      case 'ready':
        return (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.resourceCarousel}>
            {state.resources.map((resource) => (
              <HomeResourceCard
                key={resource.id}
                resource={resource}
                onPress={() => nav.push('resourceDetails', { resource })}
              />
            ))}
          </ScrollView>
        );
    }
  };

  const title = lookup.status === 'ready' || lookup.status === 'empty' ? lookup.title : 'Resources Near You';
  const caption = lookup.status === 'ready' || lookup.status === 'empty' ? lookup.caption : null;

  return (
    <View>
      {header(title, caption)}
      {body(lookup)}
    </View>
  );
}

function HomeResourceCard({ resource, onPress }: { resource: NearbyResource; onPress: () => void }) {
  const styles = useHomeStyles();
  const badge = BADGE_TONES[badgeToneFor(resource.tag)];
  const distance = formatResourceDistance(resource.distanceMi);
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
      {distance ? (
        <View style={styles.resMetaRow}>
          <HiveIcon name="map" size={13} color={HiveColors.green} />
          <Text style={styles.resMetaText}>{distance}</Text>
        </View>
      ) : null}
      {resource.hours?.trim() ? (
        <View style={styles.resMetaRow}>
          <HiveIcon name="clock" size={13} color={HiveColors.green} />
          <Text style={styles.resMetaText}>{resource.hours.trim()}</Text>
        </View>
      ) : null}
      {resource.description?.trim() ? (
        <Text style={styles.resDescription} numberOfLines={3}>{resource.description.trim()}</Text>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Learn more about ${resource.name}`}
        onPress={onPress}
        style={({ pressed }) => [styles.learnMoreButton, pressed && sharedStyles.pressed]}>
        <Text style={styles.learnMoreText}>Learn More</Text>
      </Pressable>
    </Pressable>
  );
}

/**
 * Draggable "Ask Penny" floating button (Marcos: "moveable and is in a circle").
 * Drag anywhere; a tap (no drag) opens Penny AI directly.
 */
function AskPennyFab({ onPress }: { onPress: () => void }) {
  const styles = useHomeStyles();
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

function useHomeStyles() {
  const { s, vs, ms } = useResponsive();
  const tabBarSpace = useFloatingTabBarSpace();
  return useMemo(
    () =>
      StyleSheet.create({
      homeContent: {
      paddingBottom: s(FLOATING_TAB_BAR_HEIGHT) + vs(120),
      },
      homeHeader: {
      paddingHorizontal: s(20),
      paddingTop: vs(16),
      },
      greetingRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: s(10),
      },
      homeGreeting: {
      color: HiveColors.text,
      fontSize: ms(28),
      fontWeight: '800',
      },
      pennyWave: {
      width: s(46),
      height: vs(46),
      },
      avatarWrap: {
      position: 'absolute',
      top: vs(16),
      right: s(20),
      },
      homeSubGreeting: {
      color: HiveColors.textSecondary,
      fontSize: ms(15),
      marginTop: vs(6),
      },
      homeQuestion: {
      color: HiveColors.text,
      fontSize: ms(19),
      fontWeight: '800',
      paddingHorizontal: s(20),
      marginTop: vs(18),
      marginBottom: vs(14),
      },
      actionStack: {
      gap: s(12),
      paddingHorizontal: s(20),
      },
      card: {
      borderRadius: s(20),
      overflow: 'hidden',
      },
      cardGradient: {
      padding: 16,
      gap: s(14),
      },
      cardTopRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: s(12),
      },
      cardIconCircle: {
      width: s(52),
      height: vs(52),
      borderRadius: s(26),
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(255,255,255,0.22)',
      },
      cardTitle: {
      color: HiveColors.white,
      fontSize: ms(19),
      fontWeight: '800',
      flex: 1,
      lineHeight: ms(24),
      },
      cardSubtitle: {
      color: 'rgba(255,255,255,0.85)',
      fontSize: ms(14),
      lineHeight: ms(19),
      marginTop: vs(4),
      },
      pillRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: s(8),
      },
      benefitPill: {
      backgroundColor: 'rgba(255,255,255,0.20)',
      borderRadius: s(14),
      paddingHorizontal: s(12),
      paddingVertical: vs(6),
      },
      benefitPillText: {
      color: HiveColors.white,
      fontSize: ms(13),
      fontWeight: '700',
      },
      resourcesHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: s(20),
      marginTop: vs(24),
      marginBottom: vs(12),
      },
      resourcesTitleWrap: {
      flex: 1,
      },
      resourcesTitle: {
      color: HiveColors.text,
      fontSize: ms(19),
      fontWeight: '800',
      },
      resourcesSubtitle: {
      color: HiveColors.textSecondary,
      fontSize: ms(12),
      marginTop: vs(2),
      },
      seeAllPill: {
      backgroundColor: '#EDF7EC',
      borderRadius: s(14),
      paddingHorizontal: s(14),
      paddingVertical: vs(7),
      },
      seeAllText: {
      color: HiveColors.green,
      fontSize: ms(14),
      fontWeight: '700',
      },
      resourceCarousel: {
      paddingHorizontal: s(20),
      gap: s(12),
      paddingBottom: vs(8),
      },
      lookupCentered: {
      alignItems: 'center',
      gap: s(10),
      paddingHorizontal: s(40),
      paddingVertical: vs(24),
      },
      lookupUnavailable: {
      color: HiveColors.textSecondary,
      fontSize: ms(14),
      lineHeight: ms(20),
      textAlign: 'center',
      },
      resCard: {
      width: s(252),
      backgroundColor: HiveColors.card,
      borderRadius: s(16),
      padding: s(14),
      gap: s(8),
      ...Shadows.soft,
      },
      resBadge: {
      alignSelf: 'flex-start',
      borderRadius: s(8),
      paddingHorizontal: s(10),
      paddingVertical: vs(5),
      },
      resBadgeText: {
      fontSize: ms(13),
      fontWeight: '700',
      },
      resName: {
      color: HiveColors.text,
      fontSize: ms(17),
      fontWeight: '800',
      lineHeight: ms(22),
      },
      resMetaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: s(6),
      },
      resMetaText: {
      color: HiveColors.textSecondary,
      fontSize: ms(13),
      },
      resDescription: {
      color: HiveColors.textSecondary,
      fontSize: ms(14),
      lineHeight: ms(19),
      },
      learnMoreButton: {
      backgroundColor: HiveColors.green,
      borderRadius: s(12),
      paddingVertical: vs(12),
      alignItems: 'center',
      marginTop: vs(4),
      },
      learnMoreText: {
      color: HiveColors.white,
      fontSize: ms(15),
      fontWeight: '700',
      },
      expiringBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: s(14),
      marginHorizontal: s(20),
      marginTop: vs(16),
      marginBottom: vs(4),
      padding: 14,
      backgroundColor: '#FFF0CC',
      borderRadius: s(16),
      borderWidth: s(1),
      borderColor: 'rgba(255,149,0,0.4)',
      },
      expiringIconCircle: {
      width: s(44),
      height: vs(44),
      borderRadius: s(22),
      backgroundColor: 'rgba(255,149,0,0.15)',
      alignItems: 'center',
      justifyContent: 'center',
      },
      expiringIcon: {
      fontSize: ms(22),
      },
      expiringTitle: {
      color: '#8C4700',
      fontSize: ms(15),
      fontWeight: '800',
      },
      expiringSubtitle: {
      color: '#8C5900',
      fontSize: ms(13),
      marginTop: vs(3),
      },
      cartPillRow: {
      position: 'absolute',
      left: s(16),
      // Keep clear of the Ask Penny FAB (right edge, ~196pt wide).
      right: s(220),
      bottom: tabBarSpace + vs(68),
      flexDirection: 'row',
      alignItems: 'flex-end',
      },
      askPenny: {
      position: 'absolute',
      flexDirection: 'row',
      alignItems: 'center',
      width: s(196),
      height: vs(64),
      },
      askPennyPill: {
      backgroundColor: '#FBF0C9',
      borderRadius: s(20),
      paddingLeft: s(18),
      paddingRight: s(44),
      paddingVertical: vs(12),
      ...Shadows.soft,
      },
      askPennyText: {
      color: HiveColors.text,
      fontSize: ms(15),
      fontWeight: '700',
      },
      askPennyCircle: {
      width: s(64),
      height: vs(64),
      borderRadius: s(32),
      marginLeft: s(-36),
      borderWidth: s(2),
      borderColor: HiveColors.green,
      },
      }),
    [s, vs, ms, tabBarSpace],
  );
}
