/**
 * Missing ingredients added to the grocery list from Cook What I Have
 * (Audit Section 5: "Missing items one-tap-added to the grocery list").
 *
 * The plan's grocery list is server-derived, and the backend exposes no
 * mutation for appending arbitrary items — so additions live here,
 * client-side, and the grocery list screen renders them as an additive
 * "From Cook What I Have" section. They never alter the plan's own data.
 * TODO(backend): a real add-grocery-item mutation would make these first-class.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

export type CookGroceryAddition = {
  ingredientId: string;
  displayName: string;
  neededQty: number;
  unit: string;
};

const STORAGE_KEY = 'hth:cook_what_i_have:grocery_additions';

type Listener = (items: CookGroceryAddition[]) => void;
const listeners = new Set<Listener>();

async function readAll(): Promise<CookGroceryAddition[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as CookGroceryAddition[]) : [];
  } catch {
    return [];
  }
}

async function writeAll(items: CookGroceryAddition[]): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    // Best effort — the UI already updated optimistically.
  }
  listeners.forEach((listener) => listener(items));
}

export async function loadCookGroceryAdditions(): Promise<CookGroceryAddition[]> {
  return readAll();
}

/** One tap on "Add to grocery list". Idempotent on ingredient id. */
export async function addCookGroceryAddition(item: CookGroceryAddition): Promise<CookGroceryAddition[]> {
  const current = await readAll();
  if (current.some((existing) => existing.ingredientId === item.ingredientId)) return current;
  const next = [...current, item];
  await writeAll(next);
  return next;
}

export async function removeCookGroceryAddition(ingredientId: string): Promise<CookGroceryAddition[]> {
  const next = (await readAll()).filter((item) => item.ingredientId !== ingredientId);
  await writeAll(next);
  return next;
}

export async function clearCookGroceryAdditions(): Promise<CookGroceryAddition[]> {
  await writeAll([]);
  return [];
}

export function subscribeCookGroceryAdditions(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
