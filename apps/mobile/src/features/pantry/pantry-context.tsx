/**
 * Pantry state, backed by the server.
 *
 * The pantry used to live in app-state.tsx as a locally-persisted array seeded
 * from mock-data.ts. It now comes from the Help The Hive backend, which means
 * it survives a reinstall, follows the user to a new device, and is the same
 * data the meal generator reads when it decides what a household already has.
 *
 * Load state is explicit — `status` is what the screens render — because the
 * honest states of a networked list are "loading", "empty", "failed" and
 * "here", and collapsing them into an empty array shows a person "no items"
 * when the truth is "we could not reach the server".
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { useAuth } from '@/auth/auth-context';
import { ApiError } from '@/services/api-error';
import { useMockServices } from '@/constants/env';
import {
  addPantryItem as addRemote,
  deletePantryItem as deleteRemote,
  fetchPantryItems,
  fetchWasteStats,
  markPantryItemUsed as markUsedRemote,
  updatePantryItem as updateRemote,
  type AddPantryItemInput,
  type UpdatePantryItemInput,
  type WasteStats,
} from '@/features/pantry/pantry-repository';
import {
  addPantryItem as addMock,
  deletePantryItem as deleteMock,
  fetchPantryItems as fetchMockItems,
  fetchWasteStats as fetchMockStats,
  markPantryItemUsed as markUsedMock,
  updatePantryItem as updateMock,
} from '@/features/pantry/mock/mock-pantry-service';
import { byExpiry, byRecentlyUsed, expiringSoon, itemsMatching, type PantryItem } from '@/features/pantry/pantry-model';

export type PantryStatus = 'idle' | 'loading' | 'ready' | 'error';

type PantryContextValue = {
  items: PantryItem[];
  status: PantryStatus;
  /** Safe to show a user. Empty unless status is 'error'. */
  error: string;
  /** True while a mutation is in flight, so a screen can disable its buttons. */
  isMutating: boolean;

  activeItems: PantryItem[];
  usedItems: PantryItem[];
  expiredItems: PantryItem[];
  expiringItems: PantryItem[];
  wasteStats: WasteStats;

  /** Re-fetch. This is what a retry button calls. */
  refresh: () => Promise<void>;
  addItem: (input: AddPantryItemInput) => Promise<void>;
  updateItem: (id: string, input: UpdatePantryItemInput) => Promise<void>;
  markUsed: (id: string) => Promise<void>;
  removeItem: (id: string) => Promise<void>;
};

const EMPTY_STATS: WasteStats = {
  totalAdded: 0,
  totalUsed: 0,
  totalExpired: 0,
  estimatedWasteValue: 0,
  mostWastedCategories: [],
};

const PantryContext = createContext<PantryContextValue | null>(null);

/**
 * The pantry's data source. Developer preview and `EXPO_PUBLIC_USE_MOCK_SERVICES`
 * builds route to the in-memory mock, so the screens render seeded data (and
 * writes work) instead of a network error when no backend is reachable. Real
 * builds always use the GraphQL repository. `useMockServices` is never true
 * in production (see constants/env.ts).
 */
const repository = useMockServices
  ? {
      fetchPantryItems: fetchMockItems,
      fetchWasteStats: fetchMockStats,
      addPantryItem: addMock,
      updatePantryItem: updateMock,
      markPantryItemUsed: markUsedMock,
      deletePantryItem: deleteMock,
    }
  : {
      fetchPantryItems,
      fetchWasteStats,
      addPantryItem: addRemote,
      updatePantryItem: updateRemote,
      markPantryItemUsed: markUsedRemote,
      deletePantryItem: deleteRemote,
    };

function messageFor(error: unknown): string {
  if (error instanceof ApiError) return error.userMessage;
  return 'Something went wrong loading your pantry. Please try again.';
}

export function PantryProvider({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const isSignedIn = Boolean(auth.user);

  const [items, setItems] = useState<PantryItem[]>([]);
  const [wasteStats, setWasteStats] = useState<WasteStats>(EMPTY_STATS);
  const [status, setStatus] = useState<PantryStatus>('idle');
  const [error, setError] = useState('');
  const [isMutating, setIsMutating] = useState(false);

  const load = useCallback(async () => {
    setStatus('loading');
    setError('');
    try {
      // Both in one round trip: the stats are the server's own count, not a
      // number derived from the page of items that happened to load.
      const [nextItems, nextStats] = await Promise.all([
        repository.fetchPantryItems(),
        repository.fetchWasteStats(),
      ]);
      setItems(nextItems);
      setWasteStats(nextStats);
      setStatus('ready');
    } catch (caught) {
      setError(messageFor(caught));
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    if (!isSignedIn) {
      // Signing out must not leave one person's pantry on screen for the next.
      setItems([]);
      setWasteStats(EMPTY_STATS);
      setStatus('idle');
      setError('');
      return;
    }
    void load();
  }, [isSignedIn, load]);

  /**
   * Runs a mutation and applies the server's answer.
   *
   * The server's returned item replaces the local one rather than the local
   * guess being kept: it carries the computed status and the timestamps, and
   * those are the values the rest of the app reasons about. Waste stats are
   * re-read because they are the server's aggregate, not something to
   * recalculate here and hope it matches.
   */
  const mutate = useCallback(
    async (run: () => Promise<PantryItem[] | null>) => {
      setIsMutating(true);
      setError('');
      try {
        const next = await run();
        if (next) setItems(next);
        setWasteStats(await repository.fetchWasteStats());
        setStatus('ready');
      } catch (caught) {
        setError(messageFor(caught));
        // The list is left as it was. A failed write must not look like it
        // worked, and it must not blank the list either.
        throw caught;
      } finally {
        setIsMutating(false);
      }
    },
    [],
  );

  const addItem = useCallback(
    async (input: AddPantryItemInput) => {
      await mutate(async () => {
        const created = await repository.addPantryItem(input);
        return [...items, created];
      });
    },
    [items, mutate],
  );

  const updateItem = useCallback(
    async (id: string, input: UpdatePantryItemInput) => {
      await mutate(async () => {
        const updated = await repository.updatePantryItem(id, input);
        return items.map((item) => (item.id === id ? updated : item));
      });
    },
    [items, mutate],
  );

  const markUsed = useCallback(
    async (id: string) => {
      await mutate(async () => {
        const updated = await repository.markPantryItemUsed(id);
        return items.map((item) => (item.id === id ? updated : item));
      });
    },
    [items, mutate],
  );

  const removeItem = useCallback(
    async (id: string) => {
      await mutate(async () => {
        // A false result means the row was already gone, which is the same
        // end state the caller wanted. Either way the item leaves the list.
        await repository.deletePantryItem(id);
        return items.filter((item) => item.id !== id);
      });
    },
    [items, mutate],
  );

  const value = useMemo<PantryContextValue>(() => {
    const activeItems = itemsMatching(items, 'active').sort(byExpiry);
    return {
      items,
      status,
      error,
      isMutating,
      activeItems,
      usedItems: itemsMatching(items, 'used').sort(byRecentlyUsed),
      expiredItems: itemsMatching(items, 'expired').sort((a, b) => byExpiry(b, a)),
      expiringItems: expiringSoon(items),
      wasteStats,
      refresh: load,
      addItem,
      updateItem,
      markUsed,
      removeItem,
    };
  }, [items, status, error, isMutating, wasteStats, load, addItem, updateItem, markUsed, removeItem]);

  return <PantryContext.Provider value={value}>{children}</PantryContext.Provider>;
}

export function usePantry(): PantryContextValue {
  const value = useContext(PantryContext);
  if (!value) {
    throw new Error('usePantry must be used inside a PantryProvider');
  }
  return value;
}
