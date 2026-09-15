/**
 * Pending grocery purchases (Audit Section 5): the shop screen stashes a
 * finished run; the pantry screen consumes it exactly once.
 */
import {
  consumePendingPurchases,
  peekPendingPurchases,
  setPendingPurchases,
  subscribePendingPurchases,
} from '@/features/pantry/pending-purchases';

const buys = [
  { displayName: 'Milk', neededQty: 1, unit: 'gallon', packageLabel: null },
  { displayName: 'Eggs', neededQty: 12, unit: 'count', packageLabel: '1 dozen' },
];

afterEach(() => {
  consumePendingPurchases();
});

describe('pending purchases', () => {
  it('starts empty', () => {
    expect(peekPendingPurchases()).toBeNull();
  });

  it('stashes a finished grocery run for the pantry screen', () => {
    setPendingPurchases(buys);
    expect(peekPendingPurchases()).toEqual(buys);
  });

  it('consumes exactly once — the prompt does not repeat', () => {
    setPendingPurchases(buys);
    expect(consumePendingPurchases()).toEqual(buys);
    expect(peekPendingPurchases()).toBeNull();
  });

  it('treats an empty run as no prompt', () => {
    setPendingPurchases([]);
    expect(peekPendingPurchases()).toBeNull();
  });

  it('notifies subscribers when the stash changes', () => {
    const seen: unknown[] = [];
    const unsubscribe = subscribePendingPurchases((items) => seen.push(items));
    setPendingPurchases(buys);
    consumePendingPurchases();
    unsubscribe();
    expect(seen).toEqual([buys, null]);
  });
});
