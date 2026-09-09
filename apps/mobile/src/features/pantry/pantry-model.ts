/**
 * Pantry domain types.
 *
 * The wire vocabulary is the GraphQL contract's — StorageLocation is PANTRY /
 * REFRIGERATOR / FREEZER and ItemStatus is ACTIVE / USED / EXPIRED. Those are
 * what this app stores and compares on. The title-case strings the screens
 * render are display labels produced here, so the Xcode-derived design is
 * unchanged while the data underneath is the server's.
 *
 * Status is NOT computed here. The server decides whether an item has lapsed
 * (db.EffectiveStatus) and sends the answer; a second opinion on the client
 * would only be a way for the two to disagree.
 */
import type { PantryItemsQuery } from '@helpthehive/api-contract';

/** One pantry item, exactly as the contract defines it. */
export type PantryItem = PantryItemsQuery['pantryItems'][number];

export type StorageLocation = PantryItem['location'];
export type ItemStatus = PantryItem['status'];

export const STORAGE_LOCATIONS: StorageLocation[] = ['PANTRY', 'REFRIGERATOR', 'FREEZER'];

const LOCATION_LABELS: Record<StorageLocation, string> = {
  PANTRY: 'Pantry',
  REFRIGERATOR: 'Refrigerator',
  FREEZER: 'Freezer',
};

export const locationLabel = (location: StorageLocation): string => LOCATION_LABELS[location] ?? location;

const LOCATION_ICONS: Record<StorageLocation, string> = {
  PANTRY: 'box',
  REFRIGERATOR: 'fridge',
  FREEZER: 'snow',
};

export const locationIconFor = (location: StorageLocation): string => LOCATION_ICONS[location] ?? 'box';

/** The three tabs on the pantry screen. */
export type PantryFilter = 'active' | 'used' | 'expired';

const FILTER_STATUS: Record<PantryFilter, ItemStatus> = {
  active: 'ACTIVE',
  used: 'USED',
  expired: 'EXPIRED',
};

/**
 * Partitions a fetched list by the status the server reported.
 *
 * This is deliberately done after the fetch rather than through the query's
 * `filter` argument. EXPIRED is computed on read from the expiration date,
 * while the filter compares the stored column — so asking the server for
 * EXPIRED returns only rows explicitly marked that way and silently misses
 * every item that simply lapsed.
 */
export const itemsMatching = (items: PantryItem[], filter: PantryFilter): PantryItem[] =>
  items.filter((item) => item.status === FILTER_STATUS[filter]);

/**
 * Parses the contract's YYYY-MM-DD as a LOCAL calendar date.
 *
 * `new Date('2026-09-10')` is UTC midnight, while a date built from local
 * components is local midnight. Comparing the two puts anywhere west of UTC a
 * few hours out — enough to report an item as expiring a day early. Both sides
 * of every comparison here are local midnight.
 */
const startOfLocalDay = (value: string): number => {
  const [year, month, day] = value.slice(0, 10).split('-').map(Number);
  return new Date(year, (month ?? 1) - 1, day ?? 1).getTime();
};

/** Days until an item expires. Negative once it has lapsed. */
export const daysUntilExpiry = (item: PantryItem, now: Date = new Date()): number => {
  const expires = startOfLocalDay(item.expirationDate);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return Math.round((expires - today) / (24 * 3600 * 1000));
};

/** Active items expiring within `withinDays`, soonest first. Drives the home banner. */
export const expiringSoon = (items: PantryItem[], withinDays = 5, now: Date = new Date()): PantryItem[] =>
  itemsMatching(items, 'active')
    .filter((item) => daysUntilExpiry(item, now) <= withinDays)
    .sort((a, b) => a.expirationDate.localeCompare(b.expirationDate));

/**
 * The date `days` from now, as the YYYY-MM-DD the contract expects.
 *
 * Built from local calendar parts rather than toISOString(), which would shift
 * the date across midnight for anyone west of UTC.
 */
export const expirationDateInDays = (days: number, now: Date = new Date()): string => {
  const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + days);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
};

/**
 * Sort order for the list: soonest to expire first, so the thing a person needs
 * to deal with is at the top.
 */
export const byExpiry = (a: PantryItem, b: PantryItem): number =>
  a.expirationDate.localeCompare(b.expirationDate);

/** Most recently used first — a used item is history, not a task. */
export const byRecentlyUsed = (a: PantryItem, b: PantryItem): number =>
  (b.dateUsed ?? '').localeCompare(a.dateUsed ?? '');
