# Help The Hive Server API Inventory

This document lists the backend API surface the mobile app is likely to need before choosing a server stack. The assumption is that the app talks to a Help The Hive GraphQL API, while the server owns all provider credentials and calls Instacart, Instacart Carrot Ads, Impact.com, Mux, Plaid, and the LLM provider.

## Goals

- Keep mobile clients off provider APIs directly.
- Expose stable app-specific GraphQL operations.
- Store and normalize provider data on the server where needed.
- Support mock/local app flows first, then replace each mock with a real resolver.
- Leave room for provider webhooks and background jobs outside GraphQL.

## Client-Facing GraphQL API

### Viewer, Profile, And Preferences

- `viewer`
- `updateProfile(input)`
- `completeOnboarding(input)`
- `updatePreferences(input)`
- `deleteAccount`
- `sendFeedback(input)`

Likely types:

- `User`
- `Profile`
- `AppPreferences`
- `OnboardingState`
- `FeedbackSubmission`

### Pantry

- `pantryItems(filter)`
- `pantryWasteStats`
- `addPantryItem(input)`
- `updatePantryItem(id, input)`
- `markPantryItemUsed(id)`
- `deletePantryItem(id)`

Likely types:

- `PantryItem`
- `StorageLocation`
- `ItemStatus`
- `WasteStats`

Notes:

- Server can own expiration rules and waste stats.
- Pantry scan from photo should be a separate LLM-assisted mutation once image upload exists.

### Meal Plans, Recipes, And Grocery Lists

- `mealPlan(weekOf)`
- `generateMealPlan(input)`
- `customizeMealPlan(id, input)`
- `recipe(id)`
- `groceryList(mealPlanId)`
- `markMealPlanGenerated(id)`

Likely types:

- `MealPlan`
- `MealPlanDay`
- `MealRecipe`
- `GroceryList`
- `GroceryItem`
- `DietaryPreference`
- `BudgetPreference`

Notes:

- Meal generation can use pantry contents, household size, budget, preferences, and store/product availability.
- Server should store generated plans so they are not regenerated every app launch.

### Instacart Shopping And Deals

- `nearbyRetailers(postalCode, lat, lng)`
- `createInstacartRecipeLink(recipeId)`
- `createInstacartShoppingListLink(input)`
- `dealsForUser(context)`
- `addDealToCart(dealId)`
- `clearCart`

Likely types:

- `Retailer`
- `ShoppingLink`
- `Deal`
- `Cart`
- `CartItem`

Notes:

- The first implementation should likely use Instacart Developer Platform shopping links rather than full checkout/fulfillment.
- Cache generated Instacart recipe or shopping list URLs where provider docs recommend reuse.

Sources:

- [Instacart Developer Platform](https://docs.instacart.com/developer_platform_api)
- [Create recipe page](https://docs.instacart.com/developer_platform_api/api/products/create_recipe_page/)
- [Create shopping list page](https://docs.instacart.com/developer_platform_api/api/products/create_shopping_list_page)

### Ads

- `adPlacements(context)`
- `trackAdImpression(input)`
- `trackAdClick(input)`
- `trackAdAddToCart(input)`
- `trackAdConversion(input)`

Likely types:

- `AdPlacement`
- `AdCreative`
- `AdProvider`
- `AdTrackingEvent`

Notes:

- Server should request ads by placement, user context, screen, search query, and product context.
- Server should proxy event tracking so client does not hold ad credentials.
- Premium/ad-free account settings should be enforced server-side.

Sources:

- [Carrot Ads API overview](https://docs.instacart.com/ads/api/ads/overview)
- [Implement Carrot Ads API](https://docs.instacart.com/ads/ads_guide/tutorials/implement_carrot_ads_api/)
- [Impact ads overview](https://integrations.impact.com/impact-publisher/reference/ads-overview)
- [Impact list ads](https://integrations.impact.com/impact-publisher/reference/list-ads)
- [Impact tracking integration](https://integrations.impact.com/impact-brand/docs/api-tracking-integration)

### Finance, Plaid, And EBT

- `createPlaidLinkToken`
- `exchangePlaidPublicToken(publicToken)`
- `financialAccounts`
- `ebtBalance`
- `transactions(input)`
- `disconnectFinancialItem(itemId)`

Likely types:

- `PlaidLinkToken`
- `FinancialItem`
- `FinancialAccount`
- `AccountBalance`
- `Transaction`

Notes:

- Mobile should never receive Plaid access tokens.
- Plaid public tokens should be exchanged server-side immediately.
- EBT support and coverage must be validated during Plaid production onboarding. Plaid schemas include an `ebt` depository subtype, but product availability needs confirmation.
- Transactions should use a sync model with cursors rather than full refreshes on every app open.

Sources:

- [Plaid Link API](https://plaid.com/docs/api/link/)
- [Plaid Items API](https://plaid.com/docs/api/items/)
- [Plaid Accounts API](https://plaid.com/docs/api/accounts/)
- [Plaid Transactions API](https://plaid.com/docs/api/products/transactions/)

### Mux Video

- `videos(filter)`
- `video(id)`
- `createMuxUpload(input)`
- `videoPlayback(id)`
- `saveVideoProgress(input)`

Likely types:

- `Video`
- `VideoCategory`
- `MuxAsset`
- `MuxPlayback`
- `VideoProgress`

Notes:

- Admin/editor tools can request direct upload URLs.
- App playback should use server-issued metadata and signed playback tokens if videos become private.
- Mux webhooks should update asset readiness and error states.

Sources:

- [Mux Video guide](https://www.mux.com/docs/guides/video)
- [Mux direct upload / uploader](https://www.mux.com/docs/guides/mux-uploader)
- [Mux webhooks](https://www.mux.com/docs/core/listen-for-webhooks)

### Penny / LLM

- `pennyConversation(id)`
- `sendPennyMessage(input)`
- `streamPennyMessage(input)`
- `generateBenefitsDraft(input)`
- `explainBenefitsQuestion(input)`
- `extractPantryItemsFromImage(input)`
- `generateMealPlan(input)`

Likely types:

- `PennyConversation`
- `PennyMessage`
- `LLMRun`
- `BenefitsDraft`
- `PantryExtractionResult`
- `MealPlanGenerationResult`

Notes:

- Use app-specific GraphQL mutations, not a generic "call model" endpoint.
- Use structured outputs for meal plans, pantry item extraction, benefit drafts, and resource summaries.
- Use streaming for Penny chat where the client needs a responsive typing experience.
- Add moderation/safety logging because Penny discusses financial, health, benefits, and household topics.

Sources:

- [OpenAI API quickstart](https://platform.openai.com/docs/quickstart/make-your-first-api-request)
- [OpenAI Responses API reference](https://platform.openai.com/docs/api-reference/responses)

### Resources And Benefits

- `resourcesNearUser(input)`
- `resourceSearch(input)`
- `resource(id)`
- `benefitPrograms(input)`
- `benefitsProfile`
- `updateBenefitsProfile(input)`
- `applicationDraft(programId)`
- `updateApplicationDraft(input)`

Likely types:

- `Resource`
- `ResourceCategory`
- `BenefitProgram`
- `BenefitsProfile`
- `ApplicationDraft`
- `ApplicationRequirement`

Notes:

- Resource data may come from a CMS, partner feed, manual admin tool, or public datasets.
- Benefit application preparation should be explicit: AI can explain and draft, but the user reviews all answers before anything is submitted.
- Actual government application submission should be treated as a later separate project.

## Server-To-Provider APIs

### Instacart Developer Platform

Use for:

- Nearby retailer lookup.
- Recipe page links.
- Shopping list/product links.
- Future product matching if available for the account.

Likely server calls:

- `GET /idp/v1/retailers`
- `POST /idp/v1/products/recipe`
- `POST /idp/v1/products/products_link`

Server responsibilities:

- Store Instacart API credentials.
- Normalize retailer and shopping link responses.
- Cache generated shopping links when valid.
- Track user intent events before redirecting to Instacart.

### Instacart Carrot Ads

Use for:

- Sponsored product placements.
- Display placements.
- Brand page placements.
- Ad impression/click/conversion tracking.

Likely server calls:

- `/v2/ian/sp`
- `/v2/ian/dp`
- `/v2/ian/bp`
- `/v2/ian/bp_block`
- `/v2/ian/track`
- `/v2/ian/order/log`

Server responsibilities:

- Decide which screen placements request ads.
- Pass user/search/product context without exposing private user data unnecessarily.
- Persist returned placement IDs and tracking metadata.
- Proxy all tracking events.

### Impact.com

Use for:

- Affiliate ad inventory.
- Tracking links.
- Impression/click/conversion attribution.
- Reporting, if needed.

Likely server calls:

- Publisher ads list/retrieve endpoints under `/Mediapartners/:AccountSID/Ads`.
- Tracking link or ad-code endpoints, depending on campaign setup.
- Conversion tracking endpoints if Help The Hive reports conversions server-side.

Server responsibilities:

- Store Impact credentials.
- Normalize Impact ads into the same `AdPlacement` GraphQL type as Carrot Ads.
- Capture and persist click IDs or attribution params such as `im_ref` where applicable.
- Deduplicate ad events.

### Mux

Use for:

- Uploading videos.
- Video asset processing.
- Playback metadata.
- Optional signed playback.

Likely server calls:

- Create direct upload.
- Create/read/update assets.
- Read playback IDs.
- Sign playback tokens if private.

Server responsibilities:

- Store Mux asset IDs and playback IDs.
- Receive Mux webhooks.
- Update video status when assets are ready or fail.
- Keep mobile clients away from Mux signing secrets.

### Plaid

Use for:

- Plaid Link token creation.
- Public token exchange.
- Account and balance data.
- Transaction sync.
- Identity data if required for benefits or account matching.

Likely server calls:

- `/link/token/create`
- `/item/public_token/exchange`
- `/accounts/get`
- `/accounts/balance/get`
- `/transactions/sync`
- `/identity/get`
- `/item/remove`

Server responsibilities:

- Store Plaid access tokens encrypted.
- Rotate/update Item status from webhooks.
- Avoid exposing sensitive account identifiers to the client.
- Provide normalized balances and transactions to GraphQL.

### LLM Provider

Use for:

- Penny chat.
- Meal plan generation.
- Pantry photo extraction.
- Benefits explanation.
- Benefits draft preparation.
- Resource summarization and ranking.

Server responsibilities:

- Store LLM API keys.
- Enforce rate limits and free/premium usage limits.
- Stream responses to clients where needed.
- Store conversation history and citations/context.
- Use structured schemas for any output that drives UI or stored data.
- Add guardrails for medical, financial, legal, and public-benefits-adjacent advice.

## Webhook Endpoints

These should be plain HTTP endpoints, not GraphQL operations:

- `POST /webhooks/plaid`
- `POST /webhooks/mux`
- `POST /webhooks/instacart`
- `POST /webhooks/impact`

Webhook responsibilities:

- Verify provider signatures where available.
- Store raw event payloads for audit/debugging.
- Convert provider events into internal jobs.
- Make handlers idempotent.

## Background Jobs

Likely jobs:

- Sync Plaid transactions.
- Refresh account balances.
- Refresh or expire ad placement cache.
- Process Mux asset readiness.
- Expire pantry items daily.
- Recompute pantry waste stats.
- Generate weekly meal-plan reminders.
- Refresh nearby resources if using external feeds.
- Aggregate ad and shopping analytics.
- Enforce Penny free-chat limits.

## Storage Needs

Core tables/collections:

- users
- profiles
- preferences
- onboarding_state
- pantry_items
- meal_plans
- recipes
- grocery_lists
- carts
- feedback
- resources
- benefit_programs
- benefits_profiles
- application_drafts
- penny_conversations
- penny_messages

Provider tables/collections:

- plaid_items
- plaid_accounts
- plaid_transactions
- mux_assets
- mux_uploads
- videos
- ad_placements
- ad_events
- instacart_links
- impact_attribution
- provider_webhook_events

Security-sensitive fields:

- Plaid access tokens.
- Provider API keys.
- Mux signing secrets.
- LLM API keys.
- Account identifiers.
- Potential benefits/profile PII.

## Unresolved Backend Decisions

- GraphQL server/runtime: Node, Go, Rails, Elixir, or another stack.
- Database: likely Postgres, but final choice depends on hosting and team comfort.
- Auth: managed auth provider versus first-party auth.
- Realtime/streaming: GraphQL subscriptions, Server-Sent Events, or a separate streaming endpoint for Penny.
- Admin/CMS: custom admin, headless CMS, or direct database-backed tools.
- Resource data source: manual seed data, partner feeds, public datasets, or paid API.
- Ads mediation: whether Carrot Ads and Impact are queried independently or through one internal ad-selection service.
- Analytics pipeline: app events only in primary DB versus warehouse/event stream.

## Assumptions

- The first backend exposes GraphQL for app traffic.
- Provider webhooks are REST endpoints outside GraphQL.
- Mobile never receives provider API keys, Plaid access tokens, Mux signing keys, or LLM credentials.
- Instacart shopping starts with Developer Platform links, not full checkout/fulfillment.
- Auth is not implemented yet, but server APIs should be designed around an authenticated `viewer`.
- Real government application submission is out of scope for the first server.
