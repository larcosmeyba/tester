/**
 * Bottom navigation and floating action pills.
 *
 * The Xcode app uses a plain SwiftUI `TabView`, which on iOS 26 renders as an
 * inset floating bar. React Native gets no such thing for free, so the shape is
 * rebuilt here — and using it on Android too keeps the two platforms looking
 * like the same product, which the migration brief asks for.
 */
import { Platform, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { HiveIcon, type HiveIconName } from '@/components/hive-ui';
import { HiveColors } from '@/constants/theme';

export type TabItem = { label: string; icon: HiveIconName };

/**
 * Inset, rounded tab bar. Sits above the home indicator with its own shadow,
 * rather than spanning the full width like a stock Android bar.
 */
export function FloatingTabBar({
  tabs,
  selectedIndex,
  onSelect,
}: {
  tabs: readonly TabItem[];
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
              key={tab.label}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              accessibilityLabel={tab.label}
              onPress={() => onSelect(index)}
              style={styles.tabButton}>
              <View style={[styles.tabIcon, selected && styles.tabIconSelected]}>
                <HiveIcon
                  name={tab.icon}
                  size={21}
                  color={selected ? HiveColors.green : HiveColors.textSecondary}
                />
              </View>
              <Text
                numberOfLines={1}
                style={[styles.tabLabel, selected && styles.tabLabelSelected]}>
                {tab.label}
              </Text>
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
export const FLOATING_TAB_BAR_HEIGHT = 68;

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
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOpacity: 0.1,
        shadowRadius: 16,
        shadowOffset: { width: 0, height: 6 },
      },
      android: { elevation: 12 },
      default: {},
    }),
  },
  tabButton: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2, paddingVertical: 6 },
  tabIcon: {
    width: 42,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabIconSelected: { backgroundColor: HiveColors.greenLight },
  tabLabel: { fontSize: 10, fontWeight: '600', color: HiveColors.textSecondary },
  tabLabelSelected: { color: HiveColors.green },

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
    ...Platform.select({
      ios: {
        shadowColor: HiveColors.green,
        shadowOpacity: 0.35,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 4 },
      },
      android: { elevation: 6 },
      default: {},
    }),
  },
  pillGreen: { backgroundColor: HiveColors.green },
  pillLight: { backgroundColor: HiveColors.white, borderWidth: 1.5, borderColor: HiveColors.green },
  pillLeft: { marginRight: 'auto' },
  pillRight: { marginLeft: 'auto' },
  pillText: { color: HiveColors.white, fontSize: 14, fontWeight: '600' },
  pillTextLight: { color: HiveColors.green },
  pressed: { opacity: 0.85 },
});
