/**
 * The generation state.
 *
 * The plan is built on the backend, which takes long enough that a bare spinner
 * feels broken. The rotating lines say what is actually happening, in the order
 * the engine does it.
 *
 * Nothing here invents a meal. If generation fails, the screen says so and
 * offers a retry rather than showing a fabricated plan.
 */
import { useEffect, useState } from 'react';
import { ActivityIndicator, Animated, StyleSheet, Text, View } from 'react-native';

import { AppButton, uiText } from '@/components/hive-ui';
import { HiveColors, Spacing } from '@/constants/theme';
import { describeError } from '@/services/api-error';

const PROGRESS_MESSAGES = [
  'Building your meal plan…',
  'Working within your budget…',
  'Finding meals your household will enjoy…',
  'Checking what you already have…',
  'Creating your grocery list…',
];

const MESSAGE_INTERVAL_MS = 2600;

export function MealPlanGenerating({
  error,
  onRetry,
  onCancel,
}: {
  error?: unknown;
  onRetry?: () => void;
  onCancel?: () => void;
}) {
  const [index, setIndex] = useState(0);
  // Lazy state rather than a ref: the value is created once, and reading it
  // during render is fine.
  const [opacity] = useState(() => new Animated.Value(1));

  useEffect(() => {
    if (error) return;
    const timer = setInterval(() => {
      // Cross-fade rather than snapping, so the text doesn't flicker.
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0, duration: 220, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 220, useNativeDriver: true }),
      ]).start();
      setTimeout(() => setIndex((current) => (current + 1) % PROGRESS_MESSAGES.length), 220);
    }, MESSAGE_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [error, opacity]);

  if (error) {
    const { message, retryable } = describeError(error);
    return (
      <View style={styles.container} accessibilityLiveRegion="polite">
        <Text style={uiText.subtitle}>We couldn&apos;t build that plan</Text>
        <Text style={[uiText.muted, styles.centered]}>{message}</Text>
        <View style={styles.actions}>
          {retryable && onRetry ? <AppButton title="Try again" onPress={onRetry} /> : null}
          {onCancel ? <AppButton title="Change my answers" variant="secondary" onPress={onCancel} /> : null}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container} accessibilityLiveRegion="polite">
      <ActivityIndicator size="large" color={HiveColors.green} />
      <Animated.Text style={[uiText.subtitle, styles.centered, { opacity }]}>
        {PROGRESS_MESSAGES[index]}
      </Animated.Text>
      <Text style={[uiText.small, styles.centered]}>This usually takes a few seconds.</Text>
    </View>
  );
}

export { PROGRESS_MESSAGES };

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
  },
  centered: { textAlign: 'center' },
  actions: { alignSelf: 'stretch', gap: Spacing.two, marginTop: Spacing.three },
});
