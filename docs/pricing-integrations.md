# Pricing & recipe-image integrations

Two third-party integrations power numbers and images the app shows:

| Integration | What it provides | Package | Env vars |
| --- | --- | --- | --- |
| Spoonacular | Recipe images + price-per-serving for the Recipe Database | `apps/server/internal/modules/spoonacular` | `SPOONACULAR_API_KEY` |
| Kroger | Live per-store grocery prices | `apps/server/internal/modules/kroger` | `KROGER_CLIENT_ID`, `KROGER_CLIENT_SECRET` |

Both are **optional**. The server runs correctly with neither configured: the
recipe database answers from its own library and reports enrichment as
unavailable, and pricing falls back to USDA national-average estimates, each
labeled **"Est."** so the UI can say "estimated" without guessing. A missing
key is a normal state (`ErrNotConfigured`), never a crash or a start-up
failure.

## Environment variables

All three vars are **server secrets**. They live in the server's `.env`
(which is gitignored) or the deploy environment — never in the repo, never
in a `EXPO_PUBLIC_*` variable, and never in the mobile bundle, which anyone
who installs the app can read. They are stubbed (`<redacted>`) in
`apps/server/.env.example`.

- `SPOONACULAR_API_KEY` — the Spoonacular API key, read by
  `spoonacular.ConfigFromEnv()`.
- `KROGER_CLIENT_ID` / `KROGER_CLIENT_SECRET` — the Help The Hive developer
  app's OAuth credentials, read by `kroger.ConfigFromEnv()`.

## Where keys plug in at deploy time

The code reads the environment directly (`ConfigFromEnv` in each package, the
same pattern `transcriber` uses) — there is nothing else to wire. Deploying
is:

1. Add the vars to the deployment's secret store (Cloud Run / Secret Manager /
   `.env` for local dev).
2. Restart the server.

No GraphQL schema change, no migration, no mobile rebuild is needed to turn
either integration on or off.

## Kroger developer-app application (do this once)

1. Create an account at **developer.kroger.com** and register the Help The
   Hive application.
2. Request the `product.compact` scope (product search, pricing, locations —
   all we use; no user data scopes).
3. Copy the issued **client ID** and **client secret** into the deploy secret
   store as `KROGER_CLIENT_ID` / `KROGER_CLIENT_SECRET`.

Review typically takes **~1–2 weeks**. Until approval, the Kroger client
returns `ErrNotConfigured` and every quote serves the USDA fallback. This
repo holds no credentials for the application — there is nothing to rotate or
revoke here.

## Users do NOT need Kroger accounts — by design

Kroger pricing uses **OAuth2 client credentials**: the token authorizes Help
The Hive's app, not a shopper, and the mobile client never sees the
credentials. The store that prices a basket is picked from the phone's
location:

1. The app sends a zip code (or coordinates) to the server.
2. `kroger.NearbyStores` resolves it to a Kroger-family `locationId`
   (Ralphs, Fred Meyer, Harris Teeter, … — whichever chain is nearby).
3. Product searches carry `filter.locationId`, so every price is that store's
   price, including promos.

Nobody signs in, nobody links a loyalty account, and no user credential ever
touches this code path.

## Rate limits & quotas

| Limit | Value | Where it is enforced |
| --- | --- | --- |
| Kroger requests | ≤ 1 per second | `kroger.Client` rate gate (`MinRequestInterval`) |
| Kroger daily calls | 10,000/day (free tier) | The 1/sec gate plus the caches below keep us far inside this |
| Kroger OAuth token | cached ~30 min (refreshes 2 min under provider expiry) | `kroger.Client.token` |
| Kroger store prices | cached 4 hours per store × term | `kroger.Client.Quote` |
| Spoonacular calls | daily quota (plan-dependent) | 6-hour in-memory cache on search + detail; the mock exists so UI work never spends quota |

The USDA fallback table (`internal/modules/kroger/usda.go`) covers ~30
staple foods with national-average prices. It is a degradation path, not a
data source: every price it produces carries `source: "usda-estimate"`,
`estimated: true`, `label: "Est."`.

## For the mobile client

Both packages export the response types the mobile app should mirror:

- `spoonacular.Recipe` — id, title, image URL, `readyInMinutes`, `servings`,
  `pricePerServingUsd` (dollars; `null` = Spoonacular had no price data),
  `dishTypes`/`cuisines`/`diets`, `extendedIngredients`, `instructions`,
  `provenance`. This is the same shape as the mobile app's `SpoonacularRecipe`
  interface (`apps/mobile/src/features/meals/spoonacular-types.ts`) — kept in
  sync deliberately so the GraphQL wiring later is a copy, not a translation.
- `kroger.Quote` / `kroger.Price` / `kroger.Store` — see
  `internal/modules/kroger/types.go`.

And both ship a `Mock` seeded by `SampleRecipes()` / `SampleProducts()` /
`SampleStores()` so the mobile UI can be built and screenshotted against
real-shaped data before any key or approval exists.
