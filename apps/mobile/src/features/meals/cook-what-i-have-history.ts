/**
 * Cook What I Have history (Audit Section 5).
 *
 * Every successful single-meal generation is saved here — the audit requires
 * generated meals to be kept in the Cook What I Have history. Client-side
 * only (AsyncStorage), newest first, capped so the list can't grow without
 * bound. Only recipe ids, titles, and slot labels are stored — never prompts.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

export type CookedMealRecord = {
  recipeId: string;
  title: string;
  slot: 'breakfast' | 'lunch' | 'dinner';
  /** Canonical ingredient ids the generation prioritized. */
  pantryIngredientIds: string[];
  createdAt: string;
};

const STORAGE_KEY = 'hth:cook_what_i_have:history';
const MAX_RECORDS = 20;

async function readAll(): Promise<CookedMealRecord[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as CookedMealRecord[]) : [];
  } catch {
    // History must never break the feature; fail open with an empty list.
    return [];
  }
}

export async function loadCookHistory(): Promise<CookedMealRecord[]> {
  return readAll();
}

export async function saveCookedMeal(record: Omit<CookedMealRecord, 'createdAt'>): Promise<CookedMealRecord[]> {
  const next: CookedMealRecord[] = [
    { ...record, createdAt: new Date().toISOString() },
    ...(await readAll()),
  ].slice(0, MAX_RECORDS);
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Best effort — the meal was already generated and shown.
  }
  return next;
}

export async function clearCookHistory(): Promise<void> {
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch {
    // Best effort.
  }
}
