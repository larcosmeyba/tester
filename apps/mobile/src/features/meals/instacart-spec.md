# Instacart Handoff Spec

## Status

Partner API **not yet approved**. The app ships with the affiliate deep-link
fallback only; the partner-gated path activates server-side once Instacart
approves the Help The Hive partner application. No Instacart key, partner id,
affiliate tag, or signing secret exists in the mobile bundle, and none should
be added.

## The two paths

### 1. Partner-gated API (gated — server only)

Instacart's cart-building API requires an approved partner application. All
credentials live server-side. The mobile client never sees them.

**Exact client payload** — the app sends only the plan id:

```
POST /api/instacart/handoff
Content-Type: application/json
Authorization: Bearer <user token>

{
  "plan_id": "plan_abc123"
}
```

**Server response:**

```json
{
  "checkout_url": "https://www.instacart.com/...",
  "unmatched_ingredient_ids": ["onion_yellow"]
}
```

The server builds the cart line items from the plan's grocery list, matches
each ingredient to an Instacart product, and returns the checkout URL plus
the ids it could not match. The app opens `checkout_url` with the OS linker
and tells the user about unmatched items — never silently dropping them.

Client contract: `groceryService.prepareInstacartOrder(planId): Promise<InstacartHandoff>`.

### 2. Affiliate deep-link fallback (live today)

Until partner approval lands, the app does not build carts. Instead it asks
the server for the affiliate deep link and opens it:

```
POST /api/instacart/fallback-link
Content-Type: application/json
Authorization: Bearer <user token>

{
  "plan_id": "plan_abc123"
}
```

```json
{
  "url": "https://www.instacart.com/<storefront>?affiliate=<tag>"
}
```

The affiliate tag is server config — the client never constructs or stores
it. The user lands on Instacart with their list beside them and shops
manually. Help The Hive earns the affiliate referral, and the user still
gets one-tap checkout.

Client contract: `groceryService.instacartFallbackUrl(planId): Promise<string>`.

## Screen behaviour (`instacart-screen.tsx`)

1. Primary button "Send my list to Instacart" tries the partner handoff.
2. On success: open `checkout_url`; show unmatched items if any.
3. On `BackendIntegrationRequiredError` (or any failure): show the fallback
   card — "Instacart checkout isn't connected yet" — with "Open Instacart
   instead", which fetches the affiliate deep link and opens it.
4. Prices and substitutions are always decided on Instacart, never in the
   app. The pricing notice renders on the screen.

## Security rules

- Instacart credentials stay server-side. Always.
- The affiliate tag is server config, never a client constant.
- The client sends `plan_id` only — no ingredient lists, no prices, no user
  data beyond the auth token.
