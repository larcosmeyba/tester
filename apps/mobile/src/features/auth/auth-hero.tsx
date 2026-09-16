// Penny hero + Log In / Sign Up toggle for the redesigned auth screens.
//
// The toggle lets users switch between the two forms without leaving the
// page; the money-bee hero artwork and the headline follow the selected mode.
// Headlines are the screenshot designs ("Welcome Back" / "Welcome to Help The
// Hive") — they intentionally replace the earlier emoji versions.

import { useMemo } from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import { StyleSheet } from 'react-native';
import { HiveColors } from '@/constants/theme';
import { useResponsive } from '@/constants/responsive';

export type AuthMode = 'login' | 'signup';

const pennyMoneySource = require('@/assets/images/hive/penny-money.png');

const COPY: Record<AuthMode, { headline: string }> = {
  login: {
    headline: 'Welcome Back',
  },
  signup: {
    headline: 'Welcome to Help The Hive',
  },
};

export function AuthModeToggle({
  mode,
  onSelect,
}: {
  mode: AuthMode;
  onSelect: (mode: AuthMode) => void;
}) {
  const styles = useAuthHeroStyles();
  // Screenshot order: Sign Up on the left, Log In on the right.
  return (
    <View style={styles.toggleTrack} accessibilityRole="tablist">
      {(['signup', 'login'] as AuthMode[]).map((option) => {
        const active = option === mode;
        return (
          <Pressable
            key={option}
            onPress={() => {
              if (!active) onSelect(option);
            }}
            style={[styles.toggleOption, active && styles.toggleOptionActive]}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}>
            <Text style={[styles.toggleLabel, active && styles.toggleLabelActive]}>
              {option === 'login' ? 'Log In' : 'Sign Up'}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function AuthHero({ mode }: { mode: AuthMode }) {
  const styles = useAuthHeroStyles();
  const copy = COPY[mode];
  return (
    <View style={styles.hero}>
      <Image
        source={pennyMoneySource}
        style={styles.penny}
        resizeMode="contain"
        accessibilityLabel="Penny the Bee with money"
      />
      <Text style={styles.headline}>{copy.headline}</Text>
    </View>
  );
}

function useAuthHeroStyles() {
  const { s, vs, ms } = useResponsive();
  return useMemo(
    () =>
      StyleSheet.create({
      toggleTrack: {
      flexDirection: 'row',
      backgroundColor: HiveColors.border,
      borderRadius: s(999),
      padding: 4,
      },
      toggleOption: {
      flex: 1,
      paddingVertical: vs(10),
      borderRadius: s(999),
      alignItems: 'center',
      },
      toggleOptionActive: {
      backgroundColor: HiveColors.greenDark,
      },
      toggleLabel: {
      color: HiveColors.textSecondary,
      fontSize: ms(15),
      fontWeight: '600',
      },
      toggleLabelActive: {
      color: HiveColors.white,
      },
      hero: {
      alignItems: 'center',
      gap: s(12),
      marginVertical: vs(8),
      },
      penny: {
      width: s(132),
      height: vs(132),
      },
      headline: {
      color: HiveColors.greenDark,
      fontSize: ms(28),
      fontWeight: '800',
      textAlign: 'center',
      letterSpacing: -0.5,
      },
      }),
    [s, vs, ms],
  );
}
