/**
 * Pantry inventory.
 *
 * The engine's pantry match is binary and keyed on canonical ingredient ids
 * (Doc 03 §4) — `ingredientIds` is what gets sent to `PUT /pantry` and included
 * in every plan request. Quantity, expiration and "use first" are richer
 * user-facing fields layered on top; they do not change the match.
 *
 * There is exactly one pantry store in the app. Meal generation, the grocery
 * list and the Pantry screen all read from it — never their own copy.
 */
import { z } from 'zod';

const maybe = <T extends z.ZodTypeAny>(schema: T) => schema.nullish().transform((v) => v ?? null);

export const pantryItemSchema = z
  .object({
    id: z.string(),
    ingredient_id: z.string(),
    display_name: z.string(),
    quantity: maybe(z.number()),
    unit: maybe(z.string()),
    /** ISO-8601 date. */
    expires_on: maybe(z.string()),
    use_first: z.boolean().default(false),
    added_at: maybe(z.string()),
  })
  .transform((v) => ({
    id: v.id,
    ingredientId: v.ingredient_id,
    displayName: v.display_name,
    quantity: v.quantity,
    unit: v.unit,
    expiresOn: v.expires_on,
    useFirst: v.use_first,
    addedAt: v.added_at,
  }));

export type PantryItem = z.infer<typeof pantryItemSchema>;
export const pantryListSchema = z.array(pantryItemSchema);

/** Days until expiry, or null when no expiry is recorded. */
export const daysUntilExpiry = (item: PantryItem, now: Date = new Date()): number | null => {
  if (!item.expiresOn) return null;
  const expires = new Date(item.expiresOn);
  if (Number.isNaN(expires.getTime())) return null;
  const startOfDay = (d: Date) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.round((startOfDay(expires) - startOfDay(now)) / 86_400_000);
};

export const EXPIRING_SOON_DAYS = 5;

export const isExpiringSoon = (item: PantryItem, now: Date = new Date()): boolean => {
  const days = daysUntilExpiry(item, now);
  return days !== null && days <= EXPIRING_SOON_DAYS;
};

export const isExpired = (item: PantryItem, now: Date = new Date()): boolean => {
  const days = daysUntilExpiry(item, now);
  return days !== null && days < 0;
};

/**
 * Items to surface first: explicit "use first" flags, then soonest to expire.
 * Feeds both the Pantry screen and the `use_what_i_have` cooking style.
 */
export const useFirstOrder = (items: PantryItem[], now: Date = new Date()): PantryItem[] =>
  [...items].sort((a, b) => {
    if (a.useFirst !== b.useFirst) return a.useFirst ? -1 : 1;
    const aDays = daysUntilExpiry(a, now);
    const bDays = daysUntilExpiry(b, now);
    if (aDays === null && bDays === null) return a.displayName.localeCompare(b.displayName);
    if (aDays === null) return 1;
    if (bDays === null) return -1;
    return aDays - bDays;
  });

/** The canonical ingredient ids the planner needs. Deduplicated. */
export const toIngredientIds = (items: PantryItem[]): string[] => [
  ...new Set(items.map((item) => item.ingredientId)),
];
