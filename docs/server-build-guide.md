# Help The Hive Server Build Guide

This guide is for the engineer who builds the future server. It explains where API code should live, what not to put in the mobile app, and the integration risks to watch closely.

## Current Workspace Layout

```txt
apps/
  mobile/                 Expo React Native app
packages/
  api-contract/           Future shared GraphQL schema/types/codegen package
  config/                 Future shared tooling/config package
docs/
  server-api-inventory.md Existing API inventory
  server-build-guide.md   This guide
```

The server has not been scaffolded yet. When it is added, put it here:

```txt
apps/server/
```

Do not put server code inside `apps/mobile`.

## Where API Calls Should Live

### Mobile App

Mobile app route files live in:

```txt
apps/mobile/src/app/
```

Mobile feature UI should live in:

```txt
apps/mobile/src/features/
```

Future mobile GraphQL client code should live in:

```txt
apps/mobile/src/graphql/
```

Rules for mobile:

- Mobile calls only the Help The Hive GraphQL API.
- Mobile must not call Instacart, Carrot Ads, Impact, Plaid, Mux, or the LLM provider directly.
- Mobile must not contain provider API keys, Plaid access tokens, Mux signing keys, or LLM credentials.
- Mobile can hold short-lived public/client tokens only when a provider requires it, such as a Plaid Link token.
- Mobile should import generated GraphQL operation types from `packages/api-contract` once codegen exists.

### Shared API Contract

Shared schema, operation documents, and generated types should live in:

```txt
packages/api-contract/
```

Use this package for:

- GraphQL schema artifacts or source schema.
- Shared scalar conventions.
- Generated TypeScript types.
- Generated operation types for mobile.
- Common API naming conventions.

Do not put provider SDKs or provider credentials in this package.

### Server

Create the future server here:

```txt
apps/server/
```

Recommended shape:

```txt
apps/server/src/
  graphql/
    schema/
    resolvers/
    context.ts
  modules/
    users/
    pantry/
    meals/
    instacart/
    ads/
    plaid/
    mux/
    penny/
    resources/
    benefits/
  providers/
    instacart/
    carrot-ads/
    impact/
    plaid/
    mux/
    llm/
  webhooks/
  jobs/
  db/
  config/
```

Rules for server:

- GraphQL resolvers should call internal module services.
- Module services should call provider adapters.
- Provider adapters should be the only code that knows third-party request/response details.
- Webhook handlers should be plain HTTP routes, not GraphQL mutations.
- Background jobs should call module services, not GraphQL resolvers.

## GraphQL Boundary

The app-facing API should be GraphQL. Provider-facing APIs will mostly be REST or provider SDK calls.

Client-facing GraphQL examples:

- `viewer`
- `completeOnboarding`
- `pantryItems`
- `generateMealPlan`
- `createInstacartShoppingListLink`
- `adPlacements`
- `createPlaidLinkToken`
- `exchangePlaidPublicToken`
- `transactions`
- `videos`
- `sendPennyMessage`
- `resourcesNearUser`
- `updateBenefitsProfile`

Keep GraphQL operations app-specific. Avoid generic operations like:

- `callProvider`
- `runPrompt`
- `proxyRequest`
- `rawPlaidRequest`

Those make security, auditing, and mobile compatibility harder.

## Provider Integration Locations

### Instacart Developer Platform

Put provider code in:

```txt
apps/server/src/providers/instacart/
apps/server/src/modules/instacart/
```

Use for:

- Nearby retailer lookup.
- Recipe page links.
- Shopping list links.
- Product or shopping links if enabled for the account.

Watch out for:

- Generated shopping URLs may be reusable. Cache them when the linked content has not changed.
- Do not assume full checkout/fulfillment APIs are available. Start with Developer Platform links.
- Track redirect intent before sending users to Instacart.

### Instacart Carrot Ads

Put provider code in:

```txt
apps/server/src/providers/carrot-ads/
apps/server/src/modules/ads/
```

Use for:

- Sponsored products.
- Display ads.
- Brand placements.
- Impression, click, add-to-cart, and conversion tracking.

Watch out for:

- Ad event tracking often requires provider metadata from the ad response. Persist it.
- Do not let the client invent tracking payloads.
- Enforce premium/ad-free logic before requesting ads.

### Impact.com

Put provider code in:

```txt
apps/server/src/providers/impact/
apps/server/src/modules/ads/
```

Use for:

- Affiliate ad inventory.
- Tracking links.
- Attribution and conversion reporting.

Watch out for:

- Preserve click IDs and attribution params through redirects.
- Deduplicate impression/click/conversion events.
- Normalize Impact ads into the same internal `AdPlacement` model used by Carrot Ads.

### Plaid

Put provider code in:

```txt
apps/server/src/providers/plaid/
apps/server/src/modules/plaid/
apps/server/src/modules/finance/
```

Use for:

- Link token creation.
- Public token exchange.
- Account and balance reads.
- Transaction sync.
- Identity reads if needed.
- Item removal.

Watch out for:

- Plaid access tokens must be encrypted at rest.
- Mobile should only see a Link token and normalized account/transaction data.
- Use transaction sync cursors instead of full transaction refreshes.
- EBT support must be validated with Plaid before promising production coverage.
- Handle Item errors and repair flows from webhooks.

### Mux

Put provider code in:

```txt
apps/server/src/providers/mux/
apps/server/src/modules/videos/
apps/server/src/webhooks/mux.ts
```

Use for:

- Direct uploads.
- Asset tracking.
- Playback metadata.
- Signed playback tokens if videos become private.

Watch out for:

- The app should receive playback metadata, not Mux management credentials.
- Webhooks should update video status when assets are ready or failed.
- Direct upload URLs should be short-lived.

### LLM Provider

Put provider code in:

```txt
apps/server/src/providers/llm/
apps/server/src/modules/penny/
apps/server/src/modules/meals/
apps/server/src/modules/benefits/
apps/server/src/modules/pantry/
```

Use for:

- Penny chat.
- Meal plan generation.
- Pantry item extraction from images.
- Benefits explanations.
- Application draft preparation.

Watch out for:

- Do not expose generic model access to mobile.
- Use structured outputs when responses become saved data.
- Log model inputs/outputs carefully because prompts may contain PII.
- Add guardrails for finance, healthcare, government benefits, and nutrition topics.
- Treat Penny output as guidance/drafts, not authoritative professional advice.

## Webhooks

Add webhook handlers outside GraphQL:

```txt
apps/server/src/webhooks/plaid.ts
apps/server/src/webhooks/mux.ts
apps/server/src/webhooks/instacart.ts
apps/server/src/webhooks/impact.ts
```

Webhook rules:

- Verify provider signatures where supported.
- Store raw event payloads for audit/debugging.
- Make handlers idempotent.
- Do the minimum work in the request handler.
- Enqueue jobs for slow processing.
- Never trust webhook payloads without looking up related internal records.

## Background Jobs

Put job code in:

```txt
apps/server/src/jobs/
```

Likely jobs:

- Sync Plaid transactions.
- Refresh balances.
- Process Mux asset readiness.
- Expire pantry items.
- Refresh ad cache.
- Aggregate ad events.
- Recompute meal recommendations.
- Send reminders.
- Enforce Penny usage limits.

Jobs should call module services directly. They should not call GraphQL resolvers.

## Database And Persistence

Put database code in:

```txt
apps/server/src/db/
```

Data that likely needs persistence:

- Users and auth identities.
- Profiles and preferences.
- Pantry items.
- Meal plans and recipes.
- Grocery lists and Instacart links.
- Plaid Items, accounts, balances, and transactions.
- Mux assets and videos.
- Ad placements and ad tracking events.
- Impact attribution IDs.
- Resources and benefit programs.
- Benefits profiles and application drafts.
- Penny conversations and messages.
- Provider webhook events.

Security-sensitive fields:

- Plaid access tokens.
- Provider API keys.
- Mux signing secrets.
- LLM API keys.
- Bank/account identifiers.
- Benefits profile PII.

Encrypt sensitive tokens at rest and keep provider credentials out of logs.

## Environment Variables

Server-only environment variables should stay in the server deployment environment:

- `INSTACART_API_KEY`
- `CARROT_ADS_API_KEY`
- `IMPACT_ACCOUNT_SID`
- `IMPACT_AUTH_TOKEN`
- `PLAID_CLIENT_ID`
- `PLAID_SECRET`
- `PLAID_ENV`
- `MUX_TOKEN_ID`
- `MUX_TOKEN_SECRET`
- `MUX_WEBHOOK_SECRET`
- `LLM_API_KEY`
- `DATABASE_URL`
- `SESSION_SECRET`

Mobile-safe variables must be explicitly prefixed and reviewed. Do not copy server `.env` files into `apps/mobile`.

## Testing Expectations

For each server module, add:

- Unit tests for business rules.
- Provider adapter tests with mocked HTTP/SDK responses.
- GraphQL resolver tests for authorization and input validation.
- Webhook tests for signature verification and idempotency.
- Job tests for retry behavior.

Important scenarios:

- Plaid Link token created only for authenticated users.
- Plaid public token exchange stores the access token server-side only.
- Ads are not returned for premium/ad-free users.
- Ad tracking rejects events without known placement metadata.
- Mux webhook updates only matching internal assets.
- Penny usage limits are enforced server-side.
- Benefits drafts are never submitted automatically.

## Common Mistakes To Avoid

- Calling provider APIs directly from mobile.
- Mixing provider-specific response shapes into GraphQL types.
- Storing Plaid access tokens or LLM keys in client state.
- Putting slow provider calls inside webhook request handlers.
- Allowing mobile to send arbitrary prompt text to a generic LLM endpoint without context, limits, or logging.
- Treating ad impressions/clicks as trustworthy client-only events.
- Using full transaction refreshes instead of Plaid transaction sync.
- Adding server code under `apps/mobile`.
- Letting route files in `apps/mobile/src/app` become data/business-logic files.

## First Server Milestone Recommendation

Before integrating all providers, build a thin vertical slice:

1. Authenticated `viewer`.
2. Profile and onboarding mutations.
3. Pantry CRUD backed by the database.
4. GraphQL codegen into `packages/api-contract`.
5. Mobile GraphQL client under `apps/mobile/src/graphql`.
6. One provider integration behind the server, preferably Mux or Instacart shopping links.

This proves the GraphQL contract, mobile integration pattern, database model, env handling, and deployment path before adding Plaid, ads, and LLM complexity.
