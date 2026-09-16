# Partner Secrets

Environment variable **names** for the Instacart and Kroger integrations.
This file lists names only — never values. Values live in the server
environment (GCP Secret Manager in production), never in code, docs, tests,
or commit messages, and never in the mobile bundle (`EXPO_PUBLIC_*`).

## Instacart (grocery-list handoff)

| Variable                 | Required | Purpose                                                                 |
|--------------------------|----------|-------------------------------------------------------------------------|
| `INSTACART_API_KEY`      | Yes      | Instacart Developer Platform API key, sent as the `Authorization: Bearer` token. Without it the handoff returns "not configured" and the app shows the affiliate fallback card. |
| `INSTACART_BASE_URL`     | No       | Connect host. Defaults to `https://connect.instacart.com`; set to `https://connect.dev.instacart.tools` while exercising the integration. Anything else is refused. |
| `INSTACART_AFFILIATE_URL`| No       | Deep link the app opens when the partner handoff is unavailable (e.g. `https://www.instacart.com/<storefront>?affiliate=<tag>`). Without it `/api/instacart/fallback-link` returns 501 and the app says the fallback is unavailable. |

## Kroger (tier-1 live price feed)

| Variable               | Required | Purpose                                                                 |
|------------------------|----------|-------------------------------------------------------------------------|
| `KROGER_CLIENT_ID`     | Yes      | OAuth client id for the Help The Hive developer app (app-level client credentials — users never need Kroger accounts). |
| `KROGER_CLIENT_SECRET` | Yes      | OAuth client secret for the same app. Must be set together with the id; a half-configured pair is a start-up failure. |
| `KROGER_LOCATION_ID`   | No       | Pins the price feed to one Kroger-family store (a `locationId` from the Kroger locations API). Without it the feed quotes the national catalogue, which may not carry store prices, so fewer ingredients get live rows. |

## Behaviour without credentials

Both integrations are optional and off by default:

- **Kroger off** → no tier-1 price rows are written; pricing serves the stored estimates (tier 3/4) with the usual "Prices are estimates" notice. Nothing fails.
- **Instacart off** → `POST /api/instacart/handoff` returns 503; the app renders the affiliate fallback card.
- **Affiliate URL off** → `POST /api/instacart/fallback-link` returns 501.

## Setting them (operator runbook)

1. Add the variables to the server environment (GCP Secret Manager in production; a local `.env` never committed for development).
2. Restart the server. The startup log says which integrations are enabled and why any is disabled.
3. The Kroger feed runs one sync pass at startup and then daily via `POST /internal/jobs/kroger-price-sync` (Cloud Scheduler with `INTERNAL_JOB_SECRET` in the `X-Job-Secret` header).

The previously exposed GitHub PAT pattern does not apply here: these are
server runtime secrets, not developer tokens, and they are never pasted into
chat.
