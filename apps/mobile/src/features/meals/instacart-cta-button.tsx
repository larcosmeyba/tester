import { Image, Pressable, StyleSheet, Text } from 'react-native';

import { HiveIcon } from '@/components/hive-ui';

/**
 * Instacart's partner call-to-action button, built to their approved spec:
 *
 * - Copy: "Shop ingredients" (their A/B-tested winner; "Shop on Instacart"
 *   is the approved alternate)
 * - Height 46, pill, dynamic width; horizontal padding 18
 * - Background #003D29, text #FAF1E5
 * - Full-color carrot logo (22px) on the left, external-link glyph at right
 *
 * The carrot asset is Instacart's approved mark, shipped as a transparent
 * PNG. The typeface is the system semibold — Instacart's brand font files
 * are not bundled, so this is the closest available weight.
 *
 * Only this button wears Instacart's branding. Everything else on the
 * screen stays in the Hive design language.
 */
export function InstacartCtaButton({
  onPress,
  disabled,
  label = 'Shop ingredients',
}: {
  onPress: () => void;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label} on Instacart`}
      accessibilityState={{ disabled: !!disabled }}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        disabled && styles.disabled,
        pressed && !disabled && styles.pressed,
      ]}
    >
      <Image
        source={require('@/assets/images/instacart-carrot.png')}
        style={styles.logo}
        resizeMode="contain"
        accessibilityIgnoresInvertColors
      />
      <Text style={styles.label}>{label}</Text>
      <HiveIcon name="share" size={14} color={styles.label.color} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    height: 46,
    borderRadius: 23,
    backgroundColor: '#003D29',
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    alignSelf: 'center',
  },
  logo: {
    width: 22,
    height: 22,
  },
  label: {
    color: '#FAF1E5',
    fontSize: 16,
    fontWeight: '600',
  },
  disabled: {
    opacity: 0.5,
  },
  pressed: {
    opacity: 0.85,
  },
});
