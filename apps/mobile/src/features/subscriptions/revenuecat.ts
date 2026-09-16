/**
 * RevenueCat wiring for Hive Plus.
 *
 * - SDK key comes from the build environment, never from the repo:
 *   EXPO_PUBLIC_REVENUECAT_IOS_KEY / EXPO_PUBLIC_REVENUECAT_ANDROID_KEY.
 *   These are RevenueCat *public* SDK keys (appl_… / goog_…) — safe to ship
 *   in the app binary. The secret API key is never used client-side.
 * - When the keys are missing (or the offering can't be fetched), every
 *   function degrades gracefully to static package data so the paywall UI
 *   still renders and can be screenshotted.
 * - Entitlement identifier in the RevenueCat dashboard: `plus`.
 */
import { Platform } from 'react-native';
import Purchases, {
  PURCHASES_ERROR_CODE,
  type PurchasesPackage,
} from 'react-native-purchases';

/** Entitlement identifier configured in the RevenueCat dashboard. */
export const PLUS_ENTITLEMENT_ID = 'plus';

const IOS_KEY = process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY;
const ANDROID_KEY = process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY;

let configured = false;

/** True once Purchases.configure has succeeded this session. */
export function isRevenueCatConfigured(): boolean {
  return configured;
}

/**
 * Configure the RevenueCat SDK. Safe to call at startup: missing keys or an
 * unsupported platform just log a warning and leave the paywall in preview
 * mode — the app still runs.
 */
export function initRevenueCat(): boolean {
  if (configured) return true;
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') return false;
  const apiKey = Platform.OS === 'ios' ? IOS_KEY : ANDROID_KEY;
  if (!apiKey) {
    console.warn(
      '[revenuecat] EXPO_PUBLIC_REVENUECAT_IOS_KEY / EXPO_PUBLIC_REVENUECAT_ANDROID_KEY not set — ' +
        'skipping Purchases.configure; the paywall runs in preview mode.'
    );
    return false;
  }
  try {
    Purchases.configure({ apiKey });
    configured = true;
    return true;
  } catch (error) {
    console.warn('[revenuecat] Purchases.configure failed:', error);
    return false;
  }
}

export type PlusPlanId = 'monthly' | 'annual';

export type PlusPackage = {
  id: PlusPlanId;
  /** "Monthly" / "Annual". */
  title: string;
  /** Localized price from the store, e.g. "$4.99". */
  priceLabel: string;
  /** "per month" / "per year". */
  cadenceLabel: string;
  /** e.g. "Save 33%" on annual. */
  badge?: string;
  /** The live RevenueCat package, or null in preview mode. */
  rcPackage: PurchasesPackage | null;
};

/** Static plans shown when the SDK isn't configured — matches the store setup. */
const STATIC_PACKAGES: PlusPackage[] = [
  { id: 'monthly', title: 'Monthly', priceLabel: '$4.99', cadenceLabel: 'per month', rcPackage: null },
  {
    id: 'annual',
    title: 'Annual',
    priceLabel: '$39.99',
    cadenceLabel: 'per year',
    badge: 'Save 33%',
    rcPackage: null,
  },
];

/** Both plans carry a 7-day free trial (configured in App Store Connect). */
export const PLUS_TRIAL_LABEL = '7-day free trial';

function toPlusPackage(pkg: PurchasesPackage): PlusPackage | null {
  const id: PlusPlanId | null =
    pkg.packageType === 'MONTHLY' ? 'monthly' : pkg.packageType === 'ANNUAL' ? 'annual' : null;
  if (!id) return null;
  return {
    id,
    title: id === 'monthly' ? 'Monthly' : 'Annual',
    priceLabel: pkg.product.priceString || (id === 'monthly' ? '$4.99' : '$39.99'),
    cadenceLabel: id === 'monthly' ? 'per month' : 'per year',
    badge: id === 'annual' ? 'Save 33%' : undefined,
    rcPackage: pkg,
  };
}

export type PlusOffering = {
  packages: PlusPackage[];
  /** False when showing static preview data (no keys / fetch failed). */
  live: boolean;
};

/** Default offering's monthly + annual packages, or static data in preview mode. */
export async function getPlusOffering(): Promise<PlusOffering> {
  if (!configured) return { packages: STATIC_PACKAGES, live: false };
  try {
    const offerings = await Purchases.getOfferings();
    const current = offerings.current;
    if (!current || current.availablePackages.length === 0) {
      return { packages: STATIC_PACKAGES, live: false };
    }
    const mapped = current.availablePackages
      .map(toPlusPackage)
      .filter((p): p is PlusPackage => p !== null)
      .sort((a, b) => (a.id === 'monthly' ? -1 : 1));
    if (mapped.length === 0) return { packages: STATIC_PACKAGES, live: false };
    return { packages: mapped, live: true };
  } catch (error) {
    console.warn('[revenuecat] getOfferings failed, using static packages:', error);
    return { packages: STATIC_PACKAGES, live: false };
  }
}

/** True when the `plus` entitlement is active on the current customer. */
export async function isPlusActive(): Promise<boolean> {
  if (!configured) return false;
  try {
    const info = await Purchases.getCustomerInfo();
    return info.entitlements.active[PLUS_ENTITLEMENT_ID] != null;
  } catch (error) {
    console.warn('[revenuecat] getCustomerInfo failed:', error);
    return false;
  }
}

export type PurchaseOutcome = 'purchased' | 'cancelled' | 'unavailable' | 'error';

/** Buy the selected package. 'unavailable' = preview mode (no SDK keys yet). */
export async function purchasePlus(pkg: PlusPackage): Promise<PurchaseOutcome> {
  if (!configured || !pkg.rcPackage) return 'unavailable';
  try {
    const { customerInfo } = await Purchases.purchasePackage(pkg.rcPackage);
    return customerInfo.entitlements.active[PLUS_ENTITLEMENT_ID] != null ? 'purchased' : 'error';
  } catch (error) {
    const code = (error as { code?: unknown } | null)?.code;
    if (code === PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR) return 'cancelled';
    console.warn('[revenuecat] purchasePackage failed:', error);
    return 'error';
  }
}

/** Restore previous purchases; returns whether Plus is now active. */
export async function restorePlus(): Promise<boolean> {
  if (!configured) return false;
  try {
    const info = await Purchases.restorePurchases();
    return info.entitlements.active[PLUS_ENTITLEMENT_ID] != null;
  } catch (error) {
    console.warn('[revenuecat] restorePurchases failed:', error);
    return false;
  }
}
