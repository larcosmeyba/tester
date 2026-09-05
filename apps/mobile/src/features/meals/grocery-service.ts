/**
 * GroceryService — saving a list and handing it to Instacart.
 *
 * BACKEND INTEGRATION REQUIRED for both. Saving a list needs a place to put it;
 * the Instacart handoff needs the partner credentials, which live on the server
 * and must never reach this app.
 */
import { BackendIntegrationRequiredError } from '@/services/api-error';
import type { GroceryList } from '@/features/meals/meal-plan-model';

export type InstacartHandoff = {
  /** The URL the app opens so the user can review their cart on Instacart. */
  checkoutUrl: string;
  /** Items Instacart could not match, so the user is told rather than surprised. */
  unmatchedIngredientIds: string[];
};

export type GroceryService = {
  /** "Shop on my own" — keeps the list inside Help The Hive. */
  saveList(planId: string, list: GroceryList): Promise<void>;
  getSavedList(): Promise<GroceryList | null>;
  /** Builds the Instacart cart server-side and returns where to send the user. */
  prepareInstacartOrder(planId: string): Promise<InstacartHandoff>;
};

export const groceryService: GroceryService = {
  saveList: () => Promise.reject(new BackendIntegrationRequiredError('POST /grocery-lists')),
  getSavedList: () => Promise.reject(new BackendIntegrationRequiredError('GET /grocery-lists/current')),
  prepareInstacartOrder: () =>
    Promise.reject(new BackendIntegrationRequiredError('POST /grocery-lists/{id}/instacart')),
};
