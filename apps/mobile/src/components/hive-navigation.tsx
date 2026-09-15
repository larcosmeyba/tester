/**
 * Bottom navigation and floating action pills.
 *
 * The Xcode app uses a plain SwiftUI `TabView`, which on iOS 26 renders as an
 * inset floating bar. React Native gets no such thing for free, so the shape is
 * rebuilt here — and using it on Android too keeps the two platforms looking
 * like the same product, which the migration brief asks for.
 */
import { Image, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { HiveIcon, type HiveIconName } from '@/components/hive-ui';
import { FOOTER_TABS, SELECTED_PILL, type FooterTabAsset } from '@/components/footer-tabs';
import { HiveColors, Shadows } from '@/constants/theme';

export type { FooterTabAsset };
export { FOOTER_TABS };
/** Back-compat alias: tabs are now the exact Figma footer assets. */
export type TabItem = FooterTabAsset;

/**
 * Inset, rounded tab bar — Marcos's approved Figma footer, built from the
 * exact Section 2 ZIP assets (see footer-tabs.ts for the verified mapping).
 * Icons only, no text labels. Selected tab shows the grey rounded pill behind
 * the green glyph, exactly as designed.
 *
 * The bar floats: it sits above the bottom safe area with visible space
 * underneath, never attached to the bottom edge.
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

  return (
    <View
      pointerEvents="box-none"
      style={[styles.tabBarWrap, { paddingBottom: Math.max(insets.bottom, 12) }]}>
      <View style={styles.tabBar}>
        {tabs.map((tab, index) => {
          const selected = index === selectedIndex;
          return (
            <Pressable
              key={tab.id}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              accessibilityLabel={tab.label}
              onPress={() => onSelect(index)}
              style={styles.tabButton}>
              {selected && tab.drawsSelectedPill ? (
                <View style={styles.pennySelectedPill}>
                  <Image
                    source={tab.selected}
                    style={{ width: 32, height: 32 }}
                    resizeMode="contain"
                  />
                </View>
              ) : (
                <Image
                  source={selected ? tab.selected : tab.unselected}
                  style={
                    selected
                      ? { width: tab.selectedSize.width, height: tab.selectedSize.height }
                      : { width: tab.unselectedSize.width, height: tab.unselectedSize.height }
                  }
                  resizeMode="contain"
                />
              )}
              <Text style={[styles.tabLabel, selected && styles.tabLabelSelected]}>{tab.label}</Text>
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
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.pill,
        isGreen ? styles.pillGreen : styles.pillLight,
        align === 'left' ? styles.pillLeft : styles.pillRight,
        pressed && styles.pressed,
        style,
      ]}>
      {icon ? (
        <HiveIcon name={icon} size={15} color={isGreen ? HiveColors.white : HiveColors.green} />
      ) : null}
      <Text style={[styles.pillText, !isGreen && styles.pillTextLight]}>{label}</Text>
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
export const FLOATING_TAB_BAR_HEIGHT = 84;

/**
 * Total space the tab bar occupies, inset included. Anything pinned above the
 * bar must offset by this, or it ends up hidden behind it on devices with a
 * home indicator.
 */
export function useFloatingTabBarSpace(): number {
  const insets = useSafeAreaInsets();
  return FLOATING_TAB_BAR_HEIGHT + Math.max(insets.bottom, 12);
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
  tabLabel: {
    color: HiveColors.textSecondary,
    fontSize: 10,
    fontWeight: '600',
    marginTop: 2,
  },
  tabLabelSelected: {
    color: HiveColors.green,
  },
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
