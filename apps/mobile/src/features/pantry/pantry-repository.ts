/**
 * PantryRepository — the pantry's calls into the Help The Hive GraphQL server.
 *
 * The backend already existed in full: internal/modules/pantry, the store's
 * ownership-scoped queries, and the six operations in
 * packages/api-contract/operations/pantry.graphql. Nothing here re-implements
 * any of it; this file only calls it.
 *
 * Ownership is the server's job. Every query and mutation resolves the viewer
 * from the bearer token and scopes to that user, so this file never filters by
 * user and never sends a user id — there is no field for one.
 *
 * Follows the same shape as features/profile/profile-repository.ts.
 */
import type {
  AddPantryItemMutationVariables,
  PantryWasteStatsQuery,
  UpdatePantryItemMutationVariables,
} from '@helpthehive/api-contract';

import { graphqlClient } from '@/graphql/client';
import {
  AddPantryItemDocument,
  DeletePantryItemDocument,
  MarkPantryItemUsedDocument,
  PantryItemsDocument,
  PantryWasteStatsDocument,
  UpdatePantryItemDocument,
} from '@/graphql/operations';
import { toApiError } from '@/services/graphql-error';
import type { PantryItem } from '@/features/pantry/pantry-model';

export type AddPantryItemInput = AddPantryItemMutationVariables['input'];
export type UpdatePantryItemInput = UpdatePantryItemMutationVariables['input'];
export type WasteStats = PantryWasteStatsQuery['pantryWasteStats'];

/**
 * Every item the viewer owns, in every status.
 *
 * No `filter` argument is sent. EXPIRED is computed by the server at read time
 * from the expiration date, while the query's filter compares the stored
 * column — so filtering server-side for EXPIRED would quietly miss every item
 * that simply lapsed. The screens partition the full list instead.
 */
export async function fetchPantryItems(): Promise<PantryItem[]> {
  try {
    const result = await graphqlClient.request(PantryItemsDocument);
    return result.pantryItems;
  } catch (error) {
    throw toApiError(error);
  }
}

export async function fetchWasteStats(): Promise<WasteStats> {
  try {
    const result = await graphqlClient.request(PantryWasteStatsDocument);
    return result.pantryWasteStats;
  } catch (error) {
    throw toApiError(error);
  }
}

export async function addPantryItem(input: AddPantryItemInput): Promise<PantryItem> {
  try {
    const result = await graphqlClient.request(AddPantryItemDocument, { input });
    return result.addPantryItem;
  } catch (error) {
    throw toApiError(error);
  }
}

export async function updatePantryItem(id: string, input: UpdatePantryItemInput): Promise<PantryItem> {
  try {
    const result = await graphqlClient.request(UpdatePantryItemDocument, { id, input });
    return result.updatePantryItem;
  } catch (error) {
    throw toApiError(error);
  }
}

export async function markPantryItemUsed(id: string): Promise<PantryItem> {
  try {
    const result = await graphqlClient.request(MarkPantryItemUsedDocument, { id });
    return result.markPantryItemUsed;
  } catch (error) {
    throw toApiError(error);
  }
}

/** Returns false when there was nothing to delete. */
export async function deletePantryItem(id: string): Promise<boolean> {
  try {
    const result = await graphqlClient.request(DeletePantryItemDocument, { id });
    return result.deletePantryItem;
  } catch (error) {
    throw toApiError(error);
  }
}
