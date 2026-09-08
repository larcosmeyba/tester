/**
 * GroceryService — saving a list and handing it to Instacart.
 *
 * Saving is `acceptMealPlan`: the server rebuilds the list from the plan and
 * stores it, so the list a user shops from is the one the server computed, not
 * one the client assembled.
 */
import { graphqlClient } from '@/graphql/client';
import {
  AcceptMealPlanDocument,
  GroceryListDocument,
  SetGroceryItemCheckedDocument,
} from '@/graphql/meal-operations';
import { BackendIntegrationRequiredError } from '@/services/api-error';
import { toApiError } from '@/services/graphql-error';
import { toWireShape } from '@/features/meals/graphql-wire';
import { groceryListSchema, type GroceryList } from '@/features/meals/meal-plan-model';

export type InstacartHandoff = {
  /** The URL the app opens so the user can review their cart on Instacart. */
  checkoutUrl: string;
  /** Items Instacart could not match, so the user is told rather than surprised. */
  unmatchedIngredientIds: string[];
};

export type GroceryService = {
  /**
   * "Shop on my own" — keeps the list inside Help The Hive. The server
   * recomputes and stores the list for the plan; nothing is uploaded.
   */
  saveList(planId: string): Promise<GroceryList>;
  /** The saved list for a plan, or null before the plan has been accepted. */
  getSavedList(planId: string): Promise<GroceryList | null>;
  /** Ticks one line off. Returns false when there is nothing to tick. */
  setItemChecked(planId: string, ingredientId: string, checked: boolean): Promise<boolean>;
  /** Builds the Instacart cart server-side and returns where to send the user. */
  prepareInstacartOrder(planId: string): Promise<InstacartHandoff>;
};

export const groceryService: GroceryService = {
  async saveList(planId) {
    try {
      const result = await graphqlClient.request(AcceptMealPlanDocument, { planId });
      return groceryListSchema.parse(toWireShape(result.acceptMealPlan.sections));
    } catch (error) {
      throw toApiError(error);
    }
  },

  async getSavedList(planId) {
    try {
      const result = await graphqlClient.request(GroceryListDocument, { planId });
      return result.groceryList
        ? groceryListSchema.parse(toWireShape(result.groceryList.sections))
        : null;
    } catch (error) {
      throw toApiError(error);
    }
  },

  async setItemChecked(planId, ingredientId, checked) {
    try {
      const result = await graphqlClient.request(SetGroceryItemCheckedDocument, {
        planId,
        ingredientId,
        checked,
      });
      return result.setGroceryItemChecked;
    } catch (error) {
      throw toApiError(error);
    }
  },

  /**
   * BACKEND INTEGRATION REQUIRED. The Instacart handoff needs the partner
   * credentials, which live on the server and must never reach this app. There
   * is no endpoint for it yet, so this reports the feature as pending rather
   * than opening a cart that does not exist.
   */
  prepareInstacartOrder: () =>
    Promise.reject(new BackendIntegrationRequiredError('Instacart cart handoff')),
};
