/**
 * Local-only toggles — settings rows that exist in the Figma but have no
 * backend field yet (notification rows and budget rows).
 *
 * These persist in AsyncStorage on the device so a toggle flip survives a
 * restart. When the backend gains real fields for them, this module is the
 * seam to swap out: the screens already read/write through load/save only.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'hth.localToggles.v1';

export type LocalToggles = {
  // Notification Settings (Figma-only rows)
  dailyReminders: boolean;
  newDeals: boolean;
  priceDrops: boolean;
  lowStock: boolean;
  ebtBalance: boolean;
  adFree: boolean;
  // Budget Settings (Figma-only rows)
  budgetAlerts: boolean;
  rollOver: boolean;
  roundUp: boolean;
};

export const DEFAULT_LOCAL_TOGGLES: LocalToggles = {
  dailyReminders: true,
  newDeals: true,
  priceDrops: true,
  lowStock: false,
  ebtBalance: true,
  adFree: true,
  budgetAlerts: true,
  rollOver: false,
  roundUp: false,
};

/** Loads the stored toggles, falling back to the Figma defaults. */
export async function loadLocalToggles(): Promise<LocalToggles> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_LOCAL_TOGGLES };
    const parsed = JSON.parse(raw) as Partial<LocalToggles>;
    return { ...DEFAULT_LOCAL_TOGGLES, ...parsed };
  } catch {
    return { ...DEFAULT_LOCAL_TOGGLES };
  }
}

/** Persists a partial update of the local toggles. */
export async function saveLocalToggles(patch: Partial<LocalToggles>): Promise<void> {
  try {
    const current = await loadLocalToggles();
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ ...current, ...patch }));
  } catch {
    // Best-effort on device; a failed write must not break the UI.
  }
}
