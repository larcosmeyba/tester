/**
 * Exact footer tab assets — Section 2, Marcos's approved Figma footer.
 *
 * Source: the "Icons for footer" folder in Marcos's Section 2 ZIP. The file
 * names in that ZIP are misleading (e.g. "tab-MealPlan.svg" is actually the
 * calendar glyph, "tab-Budget.svg" is actually the person glyph), so this map
 * is the VISUALLY VERIFIED SVG -> tab assignment, checked against
 * "Footer /Floating Navigation.png" in all five selected states. Do not
 * re-derive it from the file names.
 *
 * Tab order: Home | Meal Plan (book) | Penny (bee) | Budget (calendar) |
 * Profile (person). Selected state = grey rounded pill (#E9E9EC) behind a
 * green (#1B5E20) glyph; unselected = dark (#3C4043) glyph, no pill.
 * The Penny SVGs ship no pill, so its selected pill is drawn in RN with the
 * exact same geometry (56x36, rx 18, #E9E9EC).
 */
import type { ImageSourcePropType } from 'react-native';

export type FooterTabId = 'home' | 'mealplan' | 'penny' | 'budget' | 'profile';

export type FooterTabAsset = {
  id: FooterTabId;
  /** Accessibility label. The approved footer shows icons only, no text. */
  label: string;
  unselected: ImageSourcePropType;
  selected: ImageSourcePropType;
  /** Display size in points, taken from the source SVG viewBox. */
  unselectedSize: { width: number; height: number };
  selectedSize: { width: number; height: number };
  /** Penny's selected pill is drawn in RN (its SVGs ship no pill). */
  drawsSelectedPill?: boolean;
};

export const SELECTED_PILL = {
  width: 56,
  height: 36,
  borderRadius: 18,
  backgroundColor: '#E9E9EC',
} as const;

export const FOOTER_TABS: readonly FooterTabAsset[] = [
  {
    id: 'home',
    label: 'Home',
    unselected: require('@/assets/images/footer/tab-home-unselected.png'),
    selected: require('@/assets/images/footer/tab-home-selected.png'),
    unselectedSize: { width: 62, height: 36 },
    selectedSize: { width: 56, height: 36 },
  },
  {
    id: 'mealplan',
    label: 'Meal Plan',
    unselected: require('@/assets/images/footer/tab-mealplan-unselected.png'),
    selected: require('@/assets/images/footer/tab-mealplan-selected.png'),
    unselectedSize: { width: 62, height: 36 },
    selectedSize: { width: 62, height: 36 },
  },
  {
    id: 'penny',
    label: 'Penny',
    unselected: require('@/assets/images/footer/tab-penny-unselected.png'),
    selected: require('@/assets/images/footer/tab-penny-selected.png'),
    unselectedSize: { width: 37, height: 37 },
    selectedSize: { width: 37, height: 37 },
    drawsSelectedPill: true,
  },
  {
    id: 'budget',
    label: 'Budget',
    unselected: require('@/assets/images/footer/tab-budget-unselected.png'),
    selected: require('@/assets/images/footer/tab-budget-selected.png'),
    unselectedSize: { width: 62, height: 36 },
    selectedSize: { width: 56, height: 36 },
  },
  {
    id: 'profile',
    label: 'Profile',
    unselected: require('@/assets/images/footer/tab-profile-unselected.png'),
    selected: require('@/assets/images/footer/tab-profile-selected.png'),
    unselectedSize: { width: 62, height: 32 },
    selectedSize: { width: 62, height: 32 },
  },
];
