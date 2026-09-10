/**
 * GroceryService — saving a list and handing it to Instacart.
 *
 * Saving is `acceptMealPlan`: the server rebuilds the list from the plan and
 * stores it, so the list a user shops from is the one the server computed, not
 * one the client assembled.
 */
import { getGraphQLAuthToken } from '@/auth/auth-client';
import { apiBaseUrl } from '@/constants/env';
import { graphqlClient } from '@/graphql/client';
import {
  AcceptMealPlanDocument,
  GroceryListDocument,
  SetGroceryItemCheckedDocument,
} from '@/graphql/meal-operations';
import { ApiError } from '@/services/api-error';
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
  /**
   * Affiliate deep-link fallback (see instacart-spec.md). The server owns the
   * affiliate tag; the client only receives the finished URL and opens it.
   */
  instacartFallbackUrl(planId: string): Promise<string>;
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
   * Builds the Instacart cart server-side and returns where to send the user.
   * The server holds the partner credentials and resolves the plan's grocery
   * list from the plan id — this app only ever sends the id and opens the URL
   * it gets back. When the server reports the integration as not connected
   * yet (501/503), the screen renders the affiliate fallback card.
   */
  prepareInstacartOrder: async (planId) => {
    const body = await instacartRequest<{ checkout_url: string; unmatched_ingredient_ids: string[] }>(
      '/handoff',
      { method: 'POST', body: JSON.stringify({ plan_id: planId }) },
    );
    if (!body.checkout_url) {
      throw new ApiError('parse', 'The server did not return a checkout link.');
    }
    return {
      checkoutUrl: body.checkout_url,
      unmatchedIngredientIds: body.unmatched_ingredient_ids ?? [],
    };
  },

  /**
   * Affiliate deep-link fallback (see instacart-spec.md). The server owns the
   * affiliate tag; the client only receives the finished URL and opens it.
   */
  instacartFallbackUrl: async (planId) => {
    const body = await instacartRequest<{ url: string }>('/fallback-link', {
      method: 'POST',
      body: JSON.stringify({ plan_id: planId }),
    });
    if (!body.url) {
      throw new ApiError('parse', 'The server did not return a link.');
    }
    return body.url;
  },
};

const instacartUrl = (path: string) => `${apiBaseUrl}/api/instacart${path}`;

async function instacartAuthHeaders(): Promise<Record<string, string>> {
  const token = await getGraphQLAuthToken();
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
}

/** Maps a response onto the error kinds the UI already knows how to render. */
function instacartErrorFor(status: number, body: string): ApiError {
  let message = '';
  try {
    const parsed = JSON.parse(body) as { error?: string };
    message = parsed.error ?? '';
  } catch {
    // Leave the message empty; the fallback below covers it.
  }

  switch (status) {
    case 401:
      return new ApiError('unauthorized', message || 'Session expired', { status });
    case 404:
      return new ApiError('not_found', message || 'Not found', { status });
    case 429:
      return new ApiError('rate_limited', message || 'Too many requests', { status });
    case 501:
    case 503:
      // The server reports the integration as not connected yet. The screen
      // treats this like the old pending state and offers the fallback card.
      return new ApiError('not_implemented', message || "That feature isn't available yet.", { status });
    default:
      return new ApiError(status >= 500 ? 'server' : 'unknown', message || 'Instacart is unavailable', { status });
  }
}

async function instacartRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(instacartUrl(path), {
      ...init,
      headers: { ...(await instacartAuthHeaders()), ...init.headers },
    });
  } catch (cause) {
    throw new ApiError('network', 'Could not reach Help The Hive', { cause });
  }

  const body = await response.text();
  if (!response.ok) {
    throw instacartErrorFor(response.status, body);
  }
  return (body ? JSON.parse(body) : null) as T;
}
