/**
 * Pending grocery purchases (Audit Section 5).
 *
 * When a grocery list is fully checked off and the user taps "Done shopping",
 * the shop screen stashes what was purchased here. The pantry screen consumes
 * it and offers "Add the groceries you just purchased?" — one tap adds them
 * all to the inventory. A module-level holder (not route params) because the
 * shop screen routes with expo-router while the pantry screen lives in
 * AppRoot's custom stack.
 */
export type PurchasedItem = {
  displayName: string;
  neededQty: number;
  unit: string;
  packageLabel?: string | null;
};

let pending: PurchasedItem[] | null = null;

type Listener = (items: PurchasedItem[] | null) => void;
const listeners = new Set<Listener>();

function notify(): void {
  listeners.forEach((listener) => listener(pending));
}

export function setPendingPurchases(items: PurchasedItem[]): void {
  pending = items.length > 0 ? items : null;
  notify();
}

export function consumePendingPurchases(): PurchasedItem[] | null {
  const items = pending;
  pending = null;
  notify();
  return items;
}

export function peekPendingPurchases(): PurchasedItem[] | null {
  return pending;
}

export function subscribePendingPurchases(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
