/**
 * Per-slot overlays for the meal calendar (Audit Section 6).
 *
 * Two pieces of view state the backend doesn't track yet:
 * - Completed meals: the user checks a meal off as the week progresses.
 * - Removed meals: the user removes a meal from the week.
 *
 * Both are stored per planId in AsyncStorage so they survive reloads, and the
 * calendar filters/applies them over the server plan without mutating it.
 *
 * TODO(backend): a `removePlannedMeal(planId, slot)` mutation would make
 * removals first-class (the grocery list still counts a removed meal's
 * ingredients until the server knows it's gone). Until then this overlay is
 * the honest client-side behavior.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

import type { MealSlot } from '@/features/meals/meal-plan-model';

function storageKey(planId: string, kind: 'completed' | 'removed'): string {
  return `hth:meal-slots:${kind}:${planId}`;
}

/** Stable "day:mealType" key for a slot. */
export function slotKey(slot: MealSlot): string {
  return `${slot.day}:${slot.mealType}`;
}

async function readKeys(planId: string, kind: 'completed' | 'removed'): Promise<Set<string>> {
  try {
    const raw = await AsyncStorage.getItem(storageKey(planId, kind));
    if (!raw) return new Set();
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((entry): entry is string => typeof entry === 'string'));
  } catch {
    // Fail open: a broken overlay never hides the plan itself.
    return new Set();
  }
}

async function writeKeys(planId: string, kind: 'completed' | 'removed', keys: Set<string>): Promise<void> {
  try {
    await AsyncStorage.setItem(storageKey(planId, kind), JSON.stringify([...keys]));
  } catch {
    // Best effort — the in-memory UI already updated.
  }
}

export async function getCompletedSlots(planId: string): Promise<Set<string>> {
  return readKeys(planId, 'completed');
}

export async function setSlotCompleted(planId: string, slot: MealSlot, completed: boolean): Promise<Set<string>> {
  const keys = await readKeys(planId, 'completed');
  const key = slotKey(slot);
  if (completed) {
    keys.add(key);
  } else {
    keys.delete(key);
  }
  await writeKeys(planId, 'completed', keys);
  return keys;
}

export async function getRemovedSlots(planId: string): Promise<Set<string>> {
  return readKeys(planId, 'removed');
}

export async function addRemovedSlot(planId: string, slot: MealSlot): Promise<Set<string>> {
  const keys = await readKeys(planId, 'removed');
  keys.add(slotKey(slot));
  await writeKeys(planId, 'removed', keys);
  return keys;
}

/** Clears both overlays — used when a new week starts. */
export async function clearSlotOverlays(planId: string): Promise<void> {
  try {
    await AsyncStorage.multiRemove([storageKey(planId, 'completed'), storageKey(planId, 'removed')]);
  } catch {
    // Best effort.
  }
}
