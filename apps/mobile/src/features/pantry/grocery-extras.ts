/**
 * GROCERY LIST SEAM.
 *
 * "Cook what I have" lets a person one-tap the missing ingredients of a
 * pantry-based recipe onto a grocery list. The meals-owned grocery service
 * (`features/meals/grocery-service.ts`) has no add-one-item API — its lists
 * are rebuilt server-side from an accepted meal plan — so the pantry feature
 * keeps its own local extras list here.
 *
 * CONTRACT FOR THE SEAM: this list holds free-text ingredient names the user
 * explicitly added from the pantry. When a real add-item endpoint (or the
 * meals grocery list screen) exists, it should merge these extras into the
 * displayed list and clear them once synced. Until then the list lives only
 * in memory, which is fine for preview builds and honest in production: it
 * never claims to be the server's list.
 */
import { useSyncExternalStore } from 'react';

let extras: string[] = [];
const listeners = new Set<() => void>();

function emit(): void {
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** One-tap add from the "Missing ingredients" section. Dedupes case-insensitively. */
export function addGroceryExtra(name: string): void {
  const trimmed = name.trim();
  if (!trimmed) return;
  const lowered = trimmed.toLowerCase();
  if (extras.some((existing) => existing.toLowerCase() === lowered)) return;
  extras = [...extras, trimmed];
  emit();
}

/** Remove a single extra (the meals list screen can call this after syncing). */
export function removeGroceryExtra(name: string): void {
  const lowered = name.trim().toLowerCase();
  const next = extras.filter((existing) => existing.toLowerCase() !== lowered);
  if (next.length !== extras.length) {
    extras = next;
    emit();
  }
}

/** Clear the whole extras list. Test-only entry point; production never calls it. */
export function clearGroceryExtras(): void {
  extras = [];
  emit();
}

/** Current snapshot of the extras list, oldest first. */
export function listGroceryExtras(): string[] {
  return [...extras];
}

/** React subscription for the "Added ✓" one-tap state. */
export function useGroceryExtras(): string[] {
  return useSyncExternalStore(subscribe, listGroceryExtras);
}
