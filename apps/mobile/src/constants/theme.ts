import '@/global.css';

import { Platform } from 'react-native';

/** Raw brand primitives from Figma. Prefer semantic colors from `Colors` in UI code. */
export const BrandColors = {
  primaryYellow: '#FFC220',
  darkYellow: '#E5AD00',
  lightYellow: '#FFE082',
  cream: '#FFF4D6',
  white: '#FFFFFF',
  darkText: '#20242A',
  secondaryText: '#555A64',
  border: '#EDEDED',
  successGreen: '#1B5E20',
  warningOrange: '#FBBC05',
  errorRed: '#EB4335',
  infoBlue: '#4285F4',
} as const;

/**
 * Compatibility palette for existing screens.
 * New components should use `useTheme()` so color intent remains themeable.
 */
export const HiveColors = {
  green: BrandColors.successGreen,
  greenMid: '#2E8B3A',
  greenDark: '#1C3D1C',
  greenLight: '#EBF7EB',
  border: BrandColors.border,
  card: BrandColors.cream,
  yellow: BrandColors.primaryYellow,
  yellowDark: BrandColors.darkYellow,
  yellowLight: BrandColors.lightYellow,
  cream: BrandColors.cream,
  blue: BrandColors.infoBlue,
  text: BrandColors.darkText,
  textSecondary: BrandColors.secondaryText,
  white: BrandColors.white,
  black: '#000000',
  warningBg: '#FFF0CC',
  warningText: '#8C4700',
  warning: BrandColors.warningOrange,
  danger: BrandColors.errorRed,
  info: BrandColors.infoBlue,
  success: BrandColors.successGreen,
  purple: '#3E2495',
  orange: BrandColors.warningOrange,
} as const;

const brandTheme = {
  text: BrandColors.darkText,
  textSecondary: BrandColors.secondaryText,
  textInverse: BrandColors.white,
  background: BrandColors.white,
  backgroundElement: BrandColors.cream,
  backgroundSelected: BrandColors.lightYellow,
  border: BrandColors.border,
  primary: BrandColors.primaryYellow,
  primaryPressed: BrandColors.darkYellow,
  primarySubtle: BrandColors.lightYellow,
  brand: BrandColors.successGreen,
  success: BrandColors.successGreen,
  warning: BrandColors.warningOrange,
  danger: BrandColors.errorRed,
  info: BrandColors.infoBlue,
} as const;

export type AppTheme = typeof brandTheme;

// Figma currently specifies one light brand palette. Keeping both scheme keys behind
// semantic roles prevents components from depending on that implementation detail.
export const Colors: Record<'light' | 'dark', AppTheme> = {
  light: brandTheme,
  dark: brandTheme,
};

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    sans: 'system-ui',
    serif: 'ui-serif',
    rounded: 'ui-rounded',
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const Radii = {
  sm: 8,
  md: 12,
  lg: 14,
  xl: 18,
  pill: 999,
} as const;

export const Shadows = {
  soft: Platform.select({
    web: {
      boxShadow: '0 8px 24px rgba(0, 0, 0, 0.08)',
    },
    default: {
      shadowColor: '#000000',
      shadowOpacity: 0.08,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 5 },
      elevation: 2,
    },
  }),
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 74, web: 0 }) ?? 0;
export const MaxContentWidth = 820;
