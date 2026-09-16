/**
 * Responsive sizing system.
 *
 * Designs are authored at a 390pt baseline (iPhone 14/15 Pro). These helpers
 * scale dimensions proportionally so the UI keeps the same look and feel on
 * smaller and larger phones instead of only looking right at one size.
 *
 * Usage:
 *   const { s, vs, ms } = useResponsive();
 *   <View style={{ paddingHorizontal: s(20), borderRadius: s(16) }}>
 *   <Text style={{ fontSize: ms(17) }}>Hello</Text>
 *
 * - `s(n)` — width-based scale. Use for horizontal spacing, icon sizes,
 *   border radii, and most component dimensions.
 * - `vs(n)` — height-based scale. Use for vertical spacing on screens where
 *   vertical rhythm matters (tall vs short devices).
 * - `ms(n)` — moderate scale (half-strength). Use for font sizes so text
 *   stays readable without swinging wildly between devices.
 *
 * The factor is clamped to [0.85, 1.2]: phones live in a narrow band around
 * the baseline, and clamping keeps tablets and unusually small devices sane.
 * Prefer flexbox, percentages, and `flex: 1` for layout structure — reach for
 * these scalers only for fixed dimensions (sizes, radii, spacing, type).
 */
import { useMemo } from 'react';
import { useWindowDimensions } from 'react-native';

/** Design baseline width in points (iPhone 14/15 Pro). */
export const BASE_WIDTH = 390;
/** Design baseline height in points. */
export const BASE_HEIGHT = 844;

const MIN_FACTOR = 0.85;
const MAX_FACTOR = 1.2;

function clampFactor(factor: number): number {
  return Math.min(MAX_FACTOR, Math.max(MIN_FACTOR, factor));
}

/** Width-proportional scale of a baseline dimension. */
export function scaleSize(size: number, windowWidth: number): number {
  return size * clampFactor(windowWidth / BASE_WIDTH);
}

/** Height-proportional scale of a baseline dimension. */
export function verticalScaleSize(size: number, windowHeight: number): number {
  return size * clampFactor(windowHeight / BASE_HEIGHT);
}

/**
 * Moderate scale: moves only `factor` (default 0.5) of the way toward the
 * full width-based size. Best for font sizes.
 */
export function moderateScaleSize(size: number, windowWidth: number, factor = 0.5): number {
  const full = scaleSize(size, windowWidth);
  return size + (full - size) * factor;
}

export type ResponsiveScalers = {
  /** Width-based scale. */
  s: (size: number) => number;
  /** Height-based scale. */
  vs: (size: number) => number;
  /** Moderate (half-strength) scale — for font sizes. */
  ms: (size: number, factor?: number) => number;
  /** Current window dimensions in points. */
  width: number;
  height: number;
  /** True on compact phones (width < 375). */
  isSmallScreen: boolean;
  /** True on large phones (width >= 414). */
  isLargeScreen: boolean;
};

export function useResponsive(): ResponsiveScalers {
  const { width, height } = useWindowDimensions();
  return useMemo(
    () => ({
      s: (size: number) => scaleSize(size, width),
      vs: (size: number) => verticalScaleSize(size, height),
      ms: (size: number, factor = 0.5) => moderateScaleSize(size, width, factor),
      width,
      height,
      isSmallScreen: width < 375,
      isLargeScreen: width >= 414,
    }),
    [width, height],
  );
}
