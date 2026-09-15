/**
 * Bottom navigation and floating action pills.
 *
 * The Xcode app uses a plain SwiftUI `TabView`, which on iOS 26 renders as an
 * inset floating bar. React Native gets no such thing for free, so the shape is
 * rebuilt here — and using it on Android too keeps the two platforms looking
 * like the same product, which the migration brief asks for.
 */
import { Image, Platform, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { HiveIcon, type HiveIconName } from '@/components/hive-ui';
import { FOOTER_TABS, SELECTED_PILL, type FooterTabAsset } from '@/components/footer-tabs';
import { HiveColors, Shadows } from '@/constants/theme';
import { useResponsive } from '@/constants/responsive';

export type { FooterTabAsset };
export { FOOTER_TABS };
/** Back-compat alias: tabs are now the exact Figma footer assets. */
export type TabItem = FooterTabAsset;

/**
 * Gap between the bottom edge of the screen and the tab bar. On iOS the bar
 * hugs the bottom — just enough clearance for the home indicator, without
 * the large dead space the full safe-area inset created. On Android the full
 * bottom inset is kept so the bar never sits under the system navigation.
 */
const TAB_BAR_BOTTOM_GAP_IOS = 10;
const TAB_BAR_BOTTOM_GAP_ANDROID_FLOOR = 12;

function tabBarBottomGap(insetsBottom: number): number {
  if (Platform.OS === 'ios') {
    return TAB_BAR_BOTTOM_GAP_IOS;
  }
  return Math.max(insetsBottom, TAB_BAR_BOTTOM_GAP_ANDROID_FLOOR);
}

/**
 * Inset, rounded tab bar — Marcos's approved Figma footer, built from the
 * exact Section 2 ZIP assets (see footer-tabs.ts for the verified mapping).
 * Icons only, no text labels. Selected tab shows the grey rounded pill behind
 * the green glyph, exactly as designed.
 *
 * The bar sits low, anchored near the bottom edge with just enough clearance
 * for the home indicator / system navigation.
 */
export function FloatingTabBar({
  tabs,
  selectedIndex,
  onSelect,
}: {
  tabs: readonly FooterTabAsset[];
  selectedIndex: number;
  onSelect: (index: number) => void;
}) {
  const insets = useSafeAreaInsets();
  const { s } = useResponsive();
  const barHeight = s(FLOATING_TAB_BAR_HEIGHT);

  return (
    <View
      pointerEvents="box-none"
      style={[styles.tabBarWrap, { paddingBottom: tabBarBottomGap(insets.bottom), paddingHorizontal: s(12) }]}>
      <View style={[styles.tabBar, { height: barHeight, borderRadius: barHeight / 2, paddingHorizontal: s(6) }]}>
        {tabs.map((tab, index) => {
          const selected = index === selectedIndex;
          return (
            <Pressable
              key={tab.id}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              accessibilityLabel={tab.label}
              onPress={() => onSelect(index)}
              style={[styles.tabButton, { paddingVertical: s(8) }]}>
              {selected && tab.drawsSelectedPill ? (
                <View
                  style={[
                    styles.pennySelectedPill,
                    { width: s(SELECTED_PILL.width), height: s(SELECTED_PILL.height), borderRadius: s(SELECTED_PILL.borderRadius) },
                  ]}>
                  <Image
                    source={tab.selected}
                    style={{ width: s(32), height: s(32) }}
                    resizeMode="contain"
                  />
                </View>
              ) : (
                <Image
                  source={selected ? tab.selected : tab.unselected}
                  style={
                    selected
                      ? { width: s(tab.selectedSize.width), height: s(tab.selectedSize.height) }
                      : { width: s(tab.unselectedSize.width), height: s(tab.unselectedSize.height) }
                  }
                  resizeMode="contain"
                />
              )}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/**
 * Floating pill button that hovers above the tab bar — "+ Add to Pantry" on
 * Home, and the Instacart cart pill when the cart has items.
 */
export function FloatingPill({
  icon,
  label,
  onPress,
  tone = 'green',
  align = 'right',
  style,
}: {
  icon?: HiveIconName;
  label: string;
  onPress: () => void;
  tone?: 'green' | 'light';
  align?: 'left' | 'right';
  style?: StyleProp<ViewStyle>;
}) {
  const isGreen = tone === 'green';
  const { s, ms } = useResponsive();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.pill,
        {
          gap: s(8),
          paddingHorizontal: s(20),
          paddingVertical: s(13),
          borderRadius: s(30),
        },
        isGreen ? styles.pillGreen : styles.pillLight,
        align === 'left' ? styles.pillLeft : styles.pillRight,
        pressed && styles.pressed,
        style,
      ]}>
      {icon ? (
        <HiveIcon name={icon} size={s(15)} color={isGreen ? HiveColors.white : HiveColors.green} />
      ) : null}
      <Text style={[styles.pillText, { fontSize: ms(14) }, !isGreen && styles.pillTextLight]}>{label}</Text>
    </Pressable>
  );
}

/** Row that holds floating pills above the tab bar without blocking scroll. */
export function FloatingPillRow({ children }: { children: React.ReactNode }) {
  const barSpace = useFloatingTabBarSpace();
  return (
    <View pointerEvents="box-none" style={[styles.pillRow, { bottom: barSpace + 16 }]}>
      {children}
    </View>
  );
}

/** Height of the bar itself, excluding the safe-area inset beneath it. */
export const FLOATING_TAB_BAR_HEIGHT = 68;

/**
 * Total space the tab bar occupies, inset included. Anything pinned above the
 * bar must offset by this, or it ends up hidden behind it on devices with a
 * home indicator.
 */
export function useFloatingTabBarSpace(): number {
  const insets = useSafeAreaInsets();
  const { s } = useResponsive();
  return s(FLOATING_TAB_BAR_HEIGHT) + tabBarBottomGap(insets.bottom);
}

const styles = StyleSheet.create({
  tabBarWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 12,
  },
  tabBar: {
    flexDirection: 'row',
    alignItems: 'center',
    height: FLOATING_TAB_BAR_HEIGHT,
    borderRadius: 34,
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: HiveColors.border,
    paddingHorizontal: 6,
    ...Shadows.soft,
  },
  tabButton: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 8 },
  pennySelectedPill: {
    width: SELECTED_PILL.width,
    height: SELECTED_PILL.height,
    borderRadius: SELECTED_PILL.borderRadius,
    backgroundColor: SELECTED_PILL.backgroundColor,
    alignItems: 'center',
    justifyContent: 'center',
  },

  pillRow: {
    position: 'absolute',
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 13,
    borderRadius: 30,
    // Geometry comes from the shared soft shadow; the green tint is intentional.
    ...Shadows.soft,
    shadowColor: HiveColors.green,
  },
  pillGreen: { backgroundColor: HiveColors.green },
  pillLight: { backgroundColor: HiveColors.white, borderWidth: 1.5, borderColor: HiveColors.green },
  pillLeft: { marginRight: 'auto' },
  pillRight: { marginLeft: 'auto' },
  pillText: { color: HiveColors.white, fontSize: 14, fontWeight: '600' },
  pillTextLight: { color: HiveColors.green },
  pressed: { opacity: 0.85 },
});
