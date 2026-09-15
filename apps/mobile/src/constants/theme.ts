import '@/global.css';

import { Platform } from 'react-native';

/**
 * Raw brand primitives. Green is the primary and honey is the accent, matching
 * the Xcode app's `Theme.swift` and the navigation map's stated conventions.
 * Prefer semantic colors from `Colors` in UI code.
 */
export const BrandColors = {
  primaryGreen: '#1B5E20',
  midGreen: '#2E8B3A',
  darkGreen: '#1C3D1C',
  lightGreen: '#EBF7EB',
  /** Neutral card surface (hiveCardBg). Not cream — the Xcode app uses grey. */
  surface: '#F4F5F6',
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
 *
 * This is the canonical color layer: new code reads these tokens (or the
 * semantic `Colors` roles via `useTheme()`), never raw hex. A few tints that
 * used to be hardcoded in screens live here with names so they stay
 * discoverable: `ink`, `placeholder`, `greenSoft`, `blueSoft`.
 */
export const HiveColors = {
  green: BrandColors.primaryGreen,
  greenMid: BrandColors.midGreen,
  greenDark: BrandColors.darkGreen,
  greenLight: BrandColors.lightGreen,
  /** Light green tint — budget donut ring. */
  greenSoft: '#9CD39D',
  border: BrandColors.border,
  card: BrandColors.surface,
  yellow: BrandColors.primaryYellow,
  yellowDark: BrandColors.darkYellow,
  yellowLight: BrandColors.lightYellow,
  cream: BrandColors.cream,
  blue: BrandColors.infoBlue,
  /** Pale blue-grey tint — auth result icon circle. */
  blueSoft: '#F1F7FB',
  /** Warm orange banner tint — from Marcos's SwiftUI pantry design. */
  orangeBanner: '#FFF5E0',
  /** Warm orange card tint — from Marcos's SwiftUI generate-a-meal design. */
  orangeSoft: '#FFF8EB',
  /** Dark-green gradient pair — the Generate a Meal card in the SwiftUI design. */
  greenGradientStart: '#216B38',
  greenGradientEnd: '#0F4521',
  text: BrandColors.darkText,
  textSecondary: BrandColors.secondaryText,
  white: BrandColors.white,
  black: '#000000',
  /** Near-black surface — video thumbs/hero, Penny suggestion cards, dark buttons. */
  ink: '#232629',
  /** Input placeholder text. */
  placeholder: '#9AA0A6',
  warningBg: '#FFF0CC',
  warningText: '#8C4700',
  warning: BrandColors.warningOrange,
  danger: BrandColors.errorRed,
  info: BrandColors.infoBlue,
  success: BrandColors.primaryGreen,
  purple: '#3E2495',
  orange: BrandColors.warningOrange,
} as const;

/**
 * Accent per meal category, echoing the reference app's colour-coded cards.
 * Kept here (exact Xcode values) so screens never hardcode hex.
 */
export const MealAccents: Record<string, string> = {
  breakfast: '#F0A81E',
  lunch: '#3887FF',
  dinner: '#1F8C38',
  snack: '#8E5BD8',
};

const brandTheme = {
  text: BrandColors.darkText,
  textSecondary: BrandColors.secondaryText,
  textInverse: BrandColors.white,
  background: BrandColors.white,
  backgroundElement: BrandColors.surface,
  backgroundSelected: BrandColors.lightGreen,
  border: BrandColors.border,
  primary: BrandColors.primaryGreen,
  primaryPressed: BrandColors.darkGreen,
  primarySubtle: BrandColors.lightGreen,
  brand: BrandColors.primaryGreen,
  success: BrandColors.primaryGreen,
  warning: BrandColors.warningOrange,
  danger: BrandColors.errorRed,
  info: BrandColors.infoBlue,
} as const;

/** Semantic theme roles. Widened to `string` so both the light and dark
 * palettes satisfy it (the light object stays `as const` for exact values). */
export type AppTheme = {
  [K in keyof typeof brandTheme]: string;
};

/**
 * Real dark palette, derived from the brand greens and neutrals: near-black
 * green-tinted surfaces, lightened greens/reds/blues so status colors keep
 * their meaning on dark backgrounds. `useTheme()` switches on the device
 * scheme, so dark-mode devices now get a dark UI instead of a silent light one.
 *
 * Note: most screens still read the static `HiveColors` tokens, which are
 * light-mode values. Full dark-mode coverage means migrating screens to
 * `useTheme()`; this palette makes that migration correct on day one.
 */
const darkTheme: AppTheme = {
  text: '#E9EDE9',
  textSecondary: '#A7B3A7',
  textInverse: '#101510',
  background: '#101510',
  backgroundElement: '#1A211A',
  backgroundSelected: '#24402A',
  border: '#2C362C',
  primary: '#63B267',
  primaryPressed: '#4A8F4E',
  primarySubtle: '#1E3524',
  brand: '#63B267',
  success: '#63B267',
  warning: '#FBBC05',
  danger: '#F07163',
  info: '#7FA8F5',
};

// Semantic roles, resolved per device color scheme. Components that want to be
// themeable read these through `useTheme()`; one-off screens keep using
// `HiveColors` until they migrate.
export const Colors: Record<'light' | 'dark', AppTheme> = {
  light: brandTheme,
  dark: darkTheme,
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

/**
 * Canonical type scale. Every role carries size, weight and line height, wired
 * to the `Fonts` families — new text styles should compose from these instead
 * of inventing ad-hoc sizes per screen.
 */
export const Type = {
  display: { fontFamily: Fonts.sans, fontSize: 34, fontWeight: '800', lineHeight: 41 },
  title1: { fontFamily: Fonts.sans, fontSize: 28, fontWeight: '800', lineHeight: 34 },
  title2: { fontFamily: Fonts.sans, fontSize: 22, fontWeight: '700', lineHeight: 28 },
  headline: { fontFamily: Fonts.sans, fontSize: 17, fontWeight: '700', lineHeight: 22 },
  body: { fontFamily: Fonts.sans, fontSize: 16, fontWeight: '400', lineHeight: 22 },
  callout: { fontFamily: Fonts.sans, fontSize: 15, fontWeight: '400', lineHeight: 21 },
  subhead: { fontFamily: Fonts.sans, fontSize: 14, fontWeight: '400', lineHeight: 20 },
  footnote: { fontFamily: Fonts.sans, fontSize: 13, fontWeight: '400', lineHeight: 18 },
  caption: { fontFamily: Fonts.sans, fontSize: 12, fontWeight: '400', lineHeight: 16 },
} as const;

/**
 * Spacing convention (decided 2026-09-09, design-system consolidation): layout
 * values are plain numeric literals colocated with each stylesheet — that is
 * what every feature screen already does, and a t-shirt scale nobody adopts is
 * worse than literals everyone reads. `Spacing` stays exported for the rare
 * value genuinely shared across screens (e.g. EmptyState's padding).
 */
export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

/**
 * Card surfaces across hive-ui and hive-cards use ONE radius: `lg` (14).
 * Badges, pills and sheets keep their own smaller/larger radii — this rule is
 * about cards only, so a screen never has to guess which radius a card gets.
 */
export const Radii = {
  sm: 8,
  md: 12,
  lg: 14,
  xl: 18,
  pill: 999,
} as const;

/**
 * The one shared shadow. Card and floating-surface components spread this and
 * only override `shadowColor` when a tinted shadow is intentional (gradient
 * cards, the green pill) — geometry stays identical everywhere.
 */
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
