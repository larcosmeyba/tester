/**
 * Card and surface components matching the Xcode app's design system.
 *
 * These are the shapes the reference app uses everywhere — gradient action
 * cards, soft tinted panels, and the neutral "coming soon" card. Keeping them
 * here means a spacing or radius change happens once rather than on every
 * screen, and iOS and Android stay identical.
 *
 * Measurements are taken from the Swift source, not eyeballed: `HomeView.swift`
 * (QuickActionRow, SmallActionCard) and `Theme.swift`.
 */
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { HiveIcon, type HiveIconName } from '@/components/hive-ui';
import { HiveColors, Radii } from '@/constants/theme';

type PressHandler = () => void;

/**
 * The gradient pairs the reference app uses for its action cards. Named by role
 * rather than colour so a screen asks for `benefits`, not "purple".
 */
export const ActionGradients = {
  benefits: ['#472CAE', '#2E1A85'],
  meals: ['#FFC72E', '#F28C0D'],
  pantry: ['#3887FF', '#0061EB'],
  resources: ['#1F8C38', '#146629'],
  finance: ['#1B5E20', '#2E8B3A'],
} as const;

export type ActionGradient = keyof typeof ActionGradients;

/**
 * Full-width gradient action row — the "Start Government Assistance
 * Applications" and "Create this week's meal plan" cards.
 */
export function GradientActionRow({
  icon,
  title,
  subtitle,
  gradient,
  onPress,
  style,
}: {
  icon: HiveIconName;
  title: string;
  subtitle?: string;
  gradient: ActionGradient;
  onPress: PressHandler;
  style?: StyleProp<ViewStyle>;
}) {
  const colors = ActionGradients[gradient];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={subtitle ? `${title}. ${subtitle}` : title}
      onPress={onPress}
      style={({ pressed }) => [styles.rowShadow, { shadowColor: colors[1] }, pressed && styles.pressed, style]}>
      <LinearGradient
        colors={colors}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={styles.row}>
        <View style={styles.rowIcon}>
          <HiveIcon name={icon} size={22} color={HiveColors.white} />
        </View>
        <View style={styles.rowText}>
          <Text style={styles.rowTitle}>{title}</Text>
          {subtitle ? <Text style={styles.rowSubtitle}>{subtitle}</Text> : null}
        </View>
        <HiveIcon name="next" size={13} color="rgba(255,255,255,0.65)" />
      </LinearGradient>
    </Pressable>
  );
}

/**
 * Half-width gradient card — "Cook what I have" and "Find Resources near me"
 * sit side by side in a row of two.
 */
export function GradientActionCard({
  icon,
  title,
  gradient,
  onPress,
  style,
}: {
  icon: HiveIconName;
  title: string;
  gradient: ActionGradient;
  onPress: PressHandler;
  style?: StyleProp<ViewStyle>;
}) {
  const colors = ActionGradients[gradient];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={onPress}
      style={({ pressed }) => [styles.cardShadow, { shadowColor: colors[1] }, pressed && styles.pressed, style]}>
      <LinearGradient
        colors={colors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.card}>
        <View style={styles.cardIcon}>
          <HiveIcon name={icon} size={16} color={HiveColors.white} />
        </View>
        <Text style={styles.cardTitle}>{title}</Text>
      </LinearGradient>
    </Pressable>
  );
}

/**
 * Neutral card for a feature that isn't live yet. The reference app is candid
 * about this rather than showing fake content, and so is this.
 */
export function ComingSoonCard({
  icon,
  emoji,
  title,
  subtitle,
  onPress,
  showChevron = false,
  style,
}: {
  icon?: HiveIconName;
  emoji?: string;
  title: string;
  subtitle: string;
  onPress?: PressHandler;
  showChevron?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const content = (
    <View style={[styles.comingSoon, style]}>
      <View style={styles.softCircle}>
        {emoji ? (
          <Text style={styles.emoji}>{emoji}</Text>
        ) : (
          <HiveIcon name={icon ?? 'box'} size={20} color={HiveColors.green} />
        )}
      </View>
      <View style={styles.rowText}>
        <Text style={styles.softTitle}>{title}</Text>
        <Text style={styles.softSubtitle}>{subtitle}</Text>
      </View>
      {showChevron ? <HiveIcon name="next" size={13} color={HiveColors.textSecondary} /> : null}
    </View>
  );

  if (!onPress) return content;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${subtitle}`}
      onPress={onPress}
      style={({ pressed }) => [pressed && styles.pressed]}>
      {content}
    </Pressable>
  );
}

/**
 * Soft green panel with a tinted border — the EBT card in its not-yet-connected
 * state, and any other "this is about your benefits" surface.
 */
export function SoftGreenPanel({
  icon,
  title,
  subtitle,
  badge,
  onPress,
  style,
}: {
  icon: HiveIconName;
  title: string;
  subtitle: string;
  badge?: string;
  onPress?: PressHandler;
  style?: StyleProp<ViewStyle>;
}) {
  const content = (
    <View style={[styles.softPanel, style]}>
      <View style={styles.softCircle}>
        <HiveIcon name={icon} size={20} color={HiveColors.green} />
      </View>
      <View style={styles.rowText}>
        <Text style={styles.softTitle}>{title}</Text>
        <Text style={styles.softSubtitle}>{subtitle}</Text>
      </View>
      {badge ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{badge}</Text>
        </View>
      ) : null}
    </View>
  );

  if (!onPress) return content;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${subtitle}`}
      onPress={onPress}
      style={({ pressed }) => [pressed && styles.pressed]}>
      {content}
    </Pressable>
  );
}

/** Amber attention banner — "Use It Soon" for pantry items about to expire. */
export function AlertBanner({
  emoji,
  title,
  subtitle,
  onPress,
  style,
}: {
  emoji: string;
  title: string;
  subtitle: string;
  onPress?: PressHandler;
  style?: StyleProp<ViewStyle>;
}) {
  const content = (
    <View style={[styles.alert, style]}>
      <View style={styles.alertCircle}>
        <Text style={styles.emoji}>{emoji}</Text>
      </View>
      <View style={styles.rowText}>
        <Text style={styles.alertTitle}>{title}</Text>
        <Text style={styles.alertSubtitle}>{subtitle}</Text>
      </View>
      <HiveIcon name="next" size={13} color={HiveColors.warning} />
    </View>
  );

  if (!onPress) return content;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${subtitle}`}
      onPress={onPress}
      style={({ pressed }) => [pressed && styles.pressed]}>
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.85 },
  rowText: { flex: 1, gap: 2 },
  emoji: { fontSize: 22 },

  // --- Full-width gradient row (QuickActionRow) ---
  rowShadow: {
    borderRadius: 16,
    shadowOpacity: 0.3,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 14,
    borderRadius: 16,
  },
  rowIcon: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 0.5,
    borderColor: 'rgba(255,255,255,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowTitle: { color: HiveColors.white, fontSize: 15, fontWeight: '600' },
  rowSubtitle: { color: 'rgba(255,255,255,0.80)', fontSize: 11, lineHeight: 15 },

  // --- Half-width gradient card (SmallActionCard) ---
  cardShadow: {
    flex: 1,
    borderRadius: 14,
    shadowOpacity: 0.25,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  card: {
    minHeight: 90,
    borderRadius: 14,
    padding: 12,
    gap: 8,
    alignItems: 'flex-start',
  },
  cardIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 0.5,
    borderColor: 'rgba(255,255,255,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: { color: HiveColors.white, fontSize: 13, fontWeight: '600' },

  // --- Neutral / soft surfaces ---
  comingSoon: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 16,
    borderRadius: 16,
    backgroundColor: HiveColors.card,
    borderWidth: 1,
    borderColor: HiveColors.border,
  },
  softPanel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 16,
    borderRadius: 16,
    backgroundColor: HiveColors.greenLight,
    borderWidth: 1,
    borderColor: 'rgba(27,94,32,0.3)',
  },
  softCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: HiveColors.greenLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  softTitle: { color: HiveColors.text, fontSize: 15, fontWeight: '600' },
  softSubtitle: { color: HiveColors.textSecondary, fontSize: 13, lineHeight: 18 },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: Radii.sm,
    backgroundColor: 'rgba(27,94,32,0.12)',
  },
  badgeText: { color: HiveColors.green, fontSize: 11, fontWeight: '600' },

  // --- Alert banner ---
  alert: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 14,
    borderRadius: 16,
    backgroundColor: '#FFF0CC',
    borderWidth: 1,
    borderColor: 'rgba(255,165,0,0.4)',
  },
  alertCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,165,0,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  alertTitle: { color: '#8C4700', fontSize: 15, fontWeight: '700' },
  alertSubtitle: { color: '#8C5900', fontSize: 13, lineHeight: 18 },
});
