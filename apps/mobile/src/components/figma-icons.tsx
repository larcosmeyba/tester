/**
 * Marcos Leyba's final Figma icon artwork (delivered 2026-09-10).
 *
 * His 24x24 stroke SVGs are rendered to @1x/@2x/@3x PNGs (white strokes on
 * transparent) and recolored at runtime with `tintColor`, so one asset serves
 * every theme color on both iOS and Android — no native dependency, no icon
 * font, artwork stays pixel-faithful to the Figma originals.
 */

import { Image, type ImageStyle, type StyleProp } from 'react-native';

const ICON_SOURCES = {
  user: require('../../assets/icons/user.png'),
  cart: require('../../assets/icons/cart.png'),
  cartMealplan: require('../../assets/icons/cart-mealplan.png'),
  map: require('../../assets/icons/map.png'),
  doc: require('../../assets/icons/doc.png'),
  card: require('../../assets/icons/card.png'),
  fork: require('../../assets/icons/fork.png'),
  forkMealplan: require('../../assets/icons/fork-mealplan.png'),
  fridge: require('../../assets/icons/fridge.png'),
} as const;

export type FigmaIconName = keyof typeof ICON_SOURCES;

type FigmaIconProps = {
  name: FigmaIconName;
  size?: number;
  color: string;
  style?: StyleProp<ImageStyle>;
};

export function FigmaIcon({ name, size = 24, color, style }: FigmaIconProps) {
  return (
    <Image
      source={ICON_SOURCES[name]}
      resizeMode="contain"
      style={[{ width: size, height: size, tintColor: color }, style]}
    />
  );
}
