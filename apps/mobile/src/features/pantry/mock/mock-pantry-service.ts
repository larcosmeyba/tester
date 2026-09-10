/**
 * DEVELOPMENT ONLY — a local stand-in for the pantry GraphQL operations.
 *
 * Mirrors the shape of `features/pantry/pantry-repository.ts` (same function
 * names and signatures) against an in-memory list, so the pantry screens can
 * be built and tested with no backend running. `pantry-context.tsx` routes
 * here when `env.useMockServices` is true, which it never is in production.
 *
 * The seed is a plausible household pantry, not fixture trivia: the screens
 * under test are the loading/empty/error/list/add flows, and a realistic
 * list exercises the expiry sorting and waste stats honestly.
 */
import { expirationDateInDays, type PantryItem } from '@/features/pantry/pantry-model';
import type {
  AddPantryItemInput,
  UpdatePantryItemInput,
  WasteStats,
} from '@/features/pantry/pantry-repository';

const LATENCY_MS = 250;
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const today = (): string => expirationDateInDays(0);
const nowIso = (): string => new Date().toISOString();

let sequence = 0;
const nextId = (): string => `mock-pantry-${Date.now()}-${(sequence += 1)}`;

function seedItem(overrides: Partial<PantryItem> & { name: string }): PantryItem {
  const stamp = nowIso();
  return {
    id: nextId(),
    quantity: '1',
    location: 'PANTRY',
    expirationDate: expirationDateInDays(7),
    category: 'Other',
    status: 'ACTIVE',
    dateAdded: today(),
    dateUsed: null,
    createdAt: stamp,
    updatedAt: stamp,
    ...overrides,
  };
}

/** The session's list. Reset by `resetMockPantry` (tests) or a fresh reload. */
let items: PantryItem[] = [];
let totalUsed = 0;

function seed(): void {
  sequence = 0;
  totalUsed = 0;
  items = [
    seedItem({ name: 'Milk', quantity: '1 gallon', location: 'REFRIGERATOR', category: 'Dairy', expirationDate: expirationDateInDays(5) }),
    seedItem({ name: 'Eggs', quantity: '1 dozen', location: 'REFRIGERATOR', category: 'Dairy', expirationDate: expirationDateInDays(12) }),
    seedItem({ name: 'Bread', quantity: '1 loaf', location: 'PANTRY', category: 'Bakery', expirationDate: expirationDateInDays(3) }),
    seedItem({ name: 'Chicken breast', quantity: '2 lbs', location: 'FREEZER', category: 'Meat', expirationDate: expirationDateInDays(60) }),
    seedItem({ name: 'Apples', quantity: '6', location: 'PANTRY', category: 'Produce', expirationDate: expirationDateInDays(9) }),
  ];
}

seed();

/** Tests (and only tests) reset the session list back to the seed. */
export function resetMockPantry(): void {
  seed();
}

function statsFor(list: PantryItem[]): WasteStats {
  return {
    totalAdded: list.length + totalUsed,
    totalUsed,
    totalExpired: list.filter((item) => item.status === 'EXPIRED').length,
    estimatedWasteValue: 0,
    mostWastedCategories: [],
  };
}

export async function fetchPantryItems(): Promise<PantryItem[]> {
  await delay(LATENCY_MS);
  return [...items];
}

export async function fetchWasteStats(): Promise<WasteStats> {
  await delay(LATENCY_MS);
  return statsFor(items);
}

export async function addPantryItem(input: AddPantryItemInput): Promise<PantryItem> {
  await delay(LATENCY_MS);
  const created = seedItem({
    name: input.name,
    quantity: input.quantity,
    location: input.location,
    category: input.category ?? 'Other',
    expirationDate: input.expirationDate,
  });
  items = [...items, created];
  return created;
}

export async function updatePantryItem(id: string, input: UpdatePantryItemInput): Promise<PantryItem> {
  await delay(LATENCY_MS);
  const existing = items.find((item) => item.id === id);
  if (!existing) throw new Error('Pantry item not found.');
  const updated: PantryItem = {
    ...existing,
    name: input.name ?? existing.name,
    quantity: input.quantity ?? existing.quantity,
    location: input.location ?? existing.location,
    category: input.category ?? existing.category,
    expirationDate: input.expirationDate ?? existing.expirationDate,
    updatedAt: nowIso(),
  };
  items = items.map((item) => (item.id === id ? updated : item));
  return updated;
}

export async function markPantryItemUsed(id: string): Promise<PantryItem> {
  await delay(LATENCY_MS);
  const existing = items.find((item) => item.id === id);
  if (!existing) throw new Error('Pantry item not found.');
  const updated: PantryItem = { ...existing, status: 'USED', dateUsed: today(), updatedAt: nowIso() };
  items = items.map((item) => (item.id === id ? updated : item));
  totalUsed += 1;
  return updated;
}

/** Returns false when there was nothing to delete. */
export async function deletePantryItem(id: string): Promise<boolean> {
  await delay(LATENCY_MS);
  const found = items.some((item) => item.id === id);
  items = items.filter((item) => item.id !== id);
  return found;
}
