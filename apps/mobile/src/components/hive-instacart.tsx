/**
 * Instacart handoff button, matching `MealPlanTabView.InstacartButton`.
 *
 * Instacart's brand colours are fixed by their partner guidelines, so they are
 * literals here rather than theme tokens — this is deliberately not themeable.
 */
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

const INSTACART = {
  background: '#003D29',
  foreground: '#FAF1E5',
  carrot: '#FF7009',
  leaf: '#0AAD0A',
} as const;

export function InstacartButton({
  title,
  onPress,
  style,
}: {
  title: string;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={onPress}
      style={({ pressed }) => [styles.button, pressed && styles.pressed, style]}>
      <CarrotMark />
      <Text style={styles.label} numberOfLines={2}>
        {title}
      </Text>
    </Pressable>
  );
}

/** Simple carrot mark. Stands in for Instacart's logo asset until we ship it. */
function CarrotMark() {
  return (
    <View style={styles.carrot}>
      <View style={styles.carrotLeaf} />
      <View style={styles.carrotBody} />
    </View>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    minHeight: 46,
    paddingHorizontal: 18,
    borderRadius: 10,
    backgroundColor: INSTACART.background,
  },
  label: { color: INSTACART.foreground, fontSize: 15, fontWeight: '600', flexShrink: 1 },
  pressed: { opacity: 0.85 },
  carrot: { width: 22, height: 22, alignItems: 'center', justifyContent: 'center' },
  carrotLeaf: {
    position: 'absolute',
    top: 1,
    width: 8,
    height: 7,
    borderRadius: 3,
    backgroundColor: INSTACART.leaf,
  },
  carrotBody: {
    position: 'absolute',
    bottom: 1,
    width: 0,
    height: 0,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderTopWidth: 14,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: INSTACART.carrot,
  },
});
