# Codebase ownership and wiring audit

**Nothing was changed to produce this.** Read-only inspection of git history,
the backend source, and the app's runtime call paths.

## Method

- Authorship comes from `git log` on `larcosmeyba/helpthehive`, the original
  repository. Where git can answer, git answered.
- "Is the UI using it?" was determined by counting real call sites, excluding
  generated files.
- The Xcode app was compared as a separate extracted archive.

## The headline correction

**Every commit in the monorepo is Padraic's** — 19 commits, 14–26 August 2026,
all authored `Padraic O'Neill <pconeill@gmail.com>`. There is no second author.

That means the React Native app itself is his work, not a separate "redesign" by
someone else. My changes sit on top of it and are listed at the end.

## What Padraic actually built

### `apps/auth` — Better Auth service (TypeScript, Hono)

Email/password, email verification via Resend, password reset, Apple Sign In
(with `.p8` client-secret generation), Google OAuth, JWT plugin, session
invalidation, Postgres migrations.

### `apps/server` — Go GraphQL API (gqlgen + sqlc)

Seven tables (`users`, `profiles`, `profile_handles`, `preferences`,
`onboarding_state`, `pantry_items`, `push_tokens`), JWKS-verifying auth
middleware, and **15 resolvers, all implemented** — no stubs.

### Infrastructure

Terraform (`infra/terraform`), Cloud Build pipelines, Dockerfiles for both
services, EAS environments.

---

## Feature-by-feature

| Feature | Padraic code exists? | Exact files | Is current UI using it? | What UI uses instead | Status |
|---|---|---|---|---|---|
| **Authentication** | Yes | `apps/auth/src/auth.ts`, `server.ts`, `env.ts`; `apps/server/internal/auth/{jwks,middleware,context}.go` | **Yes** | — | ✅ ACTIVELY USED |
| **Signup / login** | Yes | `apps/auth/src/auth.ts`; RN `auth/auth-context.tsx` | **Yes** — `authClient.signUp.email`, `signIn.email` | — | ✅ ACTIVELY USED |
| **Apple login** | Yes | `apps/auth/src/apple.ts` (+ test) | **Yes** — `signIn.social({provider:'apple'})` | — | ✅ ACTIVELY USED (untested without credentials) |
| **Google login** | Yes | `apps/auth/src/auth.ts` socialProviders | **Yes** — `signIn.social({provider:'google'})` | — | ✅ ACTIVELY USED (untested without credentials) |
| **User profiles** | Yes | `internal/modules/users/service.go`, `queries/users.sql`, resolvers | **Yes** — `ViewerDocument`, `UpdateProfileDocument`, `UpdateHandleDocument` | — | ✅ ACTIVELY USED |
| **Onboarding** | Yes | `onboarding_state` table, `CompleteOnboarding` resolver | **Yes** — 1 call site | — | ✅ ACTIVELY USED |
| **Pantry CRUD** | **Yes — complete** | `internal/modules/pantry/service.go`, `queries/pantry.sql`, `db/sqlc/pantry.sql.go`, 5 resolvers, `operations/pantry.graphql` | **NO — 0 call sites** | `data/mock-data.ts` → `initialPantryItems`, local state + AsyncStorage | 🔴 **EXISTS BUT NOT CALLED** |
| **Expiration tracking** | Partial | `pantry_items.expires_on`, `PantryWasteStats` resolver | **NO — 0 call sites** | Local `isExpired()` in `app-state.tsx` | 🔴 EXISTS BUT NOT CALLED |
| **Cook From What I Have** | No | — | n/a | Routes to local pantry screen | ⚪ NEVER EXISTED |
| **Meal planning** | **No** | Only `lastMealPlanDate` + `weeklyMealPlanNotificationsEnabled` preference fields | n/a | Claude's `features/meals/` + dev mock | 🟡 MOCKED |
| **Grocery lists** | No | — | n/a | Claude's mock consolidation engine | 🟡 MOCKED |
| **Resources / benefits** | **No** (not in this repo) | Separate `help-the-hive-benefits-engine` prototype | No | `mock-data.ts` → `nearbyResources` | ⚪ NEVER EXISTED HERE |
| **Questionnaires** | No (benefits engine is separate) | — | No | Claude's meal questionnaire only | ⚪ NEVER EXISTED HERE |
| **PDF autofill** | No (separate prototype) | — | No | — | ⚪ NEVER EXISTED HERE |
| **Finance** | No | — | n/a | Coming Soon hub | ⚪ NEVER EXISTED |
| **Plaid** | **No — zero files** | — | n/a | Coming Soon hub | ⚪ NEVER EXISTED |
| **Penny / Hive AI** | **No — zero files** | — | n/a | `features/penny/penny-service.ts` (rejects) | ⚪ NEVER EXISTED |
| **Chat history** | No | — | n/a | Local state only | ⚪ NEVER EXISTED |
| **AI streaming** | No | — | n/a | `stream?()` declared, unimplemented | ⚪ NEVER EXISTED |
| **Voice / transcript** | No | — | n/a | Mic icon only, no handler | ⚪ NEVER EXISTED |
| **Instacart** | **No — zero files** | — | n/a | `grocery-service.ts` (rejects) | ⚪ NEVER EXISTED |
| **Kroger** | **No — zero files** | — | n/a | — | ⚪ NEVER EXISTED |
| **Subscriptions** | **No — zero files** | — | n/a | Paywall sheet, unwired | ⚪ NEVER EXISTED |
| **Analytics** | **No — zero files** | — | n/a | — | ⚪ NEVER EXISTED |
| **Notifications** | Yes | `queries/push_tokens.sql`, `db/sqlc/push_tokens.sql.go`, 2 resolvers, `notification_preferences` migration | **Yes** — `RegisterPushToken` / `DeletePushToken` called from `notification-service.ts` | — | ✅ ACTIVELY USED |
| **Database** | Yes | 4 migrations, 7 tables, sqlc-generated layer | **Partially** — users/profiles/preferences/onboarding/push_tokens used; `pantry_items` unused | — | 🟠 PARTIALLY CONNECTED |
| **Backend API** | Yes | `internal/graphql/schema.resolvers.go` — 15 resolvers | **9 of 15 called** | — | 🟠 PARTIALLY CONNECTED |
| **Cloud Run / deployment** | Yes | `infra/terraform/`, `cloudbuild.{auth,server}.yaml`, `Dockerfile.{auth,server}` | Not exercised locally | — | ⚪ EXISTS, UNVERIFIED HERE |
| **Config / env** | Yes | `internal/config/config.go`, `apps/auth/src/env.ts`, EAS environments | **Yes** | Claude added `constants/env.ts` for REST base URL | ✅ ACTIVELY USED |

---

## Your specific questions

### AUTH — would removing the dev bypass make login work?

**Padraic's implementation is real and complete.** Better Auth in `apps/auth`,
with a Go middleware in `apps/server/internal/auth/` that verifies its JWTs via
JWKS.

**The UI does call it.** `auth-context.tsx` calls `authClient.signUp.email`,
`signIn.email`, `signIn.social` (Apple and Google), `resetPassword`, and
`sendVerificationEmail`. Nothing is stubbed.

**What the dev-preview bypass skips:** it forces `isAuthenticated: true` with a
fake user and short-circuits the GraphQL `viewer` fetch, so the tabs render. It
holds no token — any real request still fails.

**Would removing it make login work?** It would make login *attempt* to work
and fail, because nothing is running: no Postgres, no auth server. The bypass
isn't masking broken code — it is standing in for absent infrastructure. Start
Postgres and `pnpm auth:dev` and real login should work; the bypass is then
removable. Apple and Google additionally need credentials that are not in the
repo (`.env.example` shows the placeholders).

### MEAL PLAN — did Padraic ever build meal endpoints?

**No.** The only "meal" strings in the backend are two preference fields:
`lastMealPlanDate` and `weeklyMealPlanNotificationsEnabled`. There are no meal
tables, resolvers, queries, or unfinished meal files. The GraphQL schema has no
meal types.

`docs/meal-plan-backend-contract.md` describes work that **still needs to be
built**. It is a specification, not documentation of something existing.

### RESOURCES — did Padraic build resource/benefit APIs?

**Not in this repository.** No resource APIs, benefit storage, questionnaire
APIs, PDF backend, or state-specific logic.

Those exist in a **separate** Go prototype — the `help-the-hive-benefits-engine`
in your MASTER archive, which is not referenced by this monorepo at all. That
prototype's own README says it has no authentication or encryption and must not
be deployed. So the UI isn't ignoring a working backend; there is no connected
one.

### PENNY — where does the chain stop?

```
Penny UI (app-root.tsx)                    ✅ exists
  → PennyService (features/penny/…)        ✅ exists — interface only
    → API client                           ❌ STOPS HERE
      → backend route                      ❌ does not exist
        → backend service                  ❌ does not exist
          → provider                       ❌ does not exist
```

`pennyService.send()` rejects with `BackendIntegrationRequiredError`. Before my
change it returned strings from a hardcoded array — the appearance of AI with
none behind it. No provider is named anywhere, deliberately.

### FINANCE — is Coming Soon hiding something?

**No.** Zero files matching plaid, link-token, transaction, bank, or budget in
the backend. No finance schemas, no tables. The Coming Soon screen is accurate.

What it *did* replace was a dashboard drawing invented transactions and spending
charts from `mock-data.ts`.

### PANTRY — real or mocked?

**The backend is real and complete. The UI ignores it.**

```
Pantry UI (app-root.tsx)
  → useAppState()                          ← local React state
    → initialPantryItems (mock-data.ts)    ← hardcoded seed
      → AsyncStorage                       ← persists on device only

    Padraic's stack, fully built, 0 call sites:
    PantryItemsDocument / AddPantryItem / UpdatePantryItem /
    MarkPantryItemUsed / DeletePantryItem / PantryWasteStats
      → GraphQL resolvers                  ✅ implemented
        → internal/modules/pantry/service.go ✅ implemented (with tests)
          → queries/pantry.sql             ✅ implemented
            → pantry_items table           ✅ migrated
```

Git confirms this was **never** connected: both the pantry backend and the
mock-backed UI arrive in the same commit (`b7268c1`), and no later commit wires
them. **This predates my work — I did not disconnect it.**

This is the single highest-value reconnection in the codebase: a complete
backend sitting one layer away from a UI that already has the right shape.

---

## Padraic code that currently exists but the app is not using

1. **Pantry GraphQL operations** — all six, 0 call sites
   (`packages/api-contract/operations/pantry.graphql`)
2. **Pantry service** — `apps/server/internal/modules/pantry/service.go` + tests
3. **Pantry SQL layer** — `queries/pantry.sql`, `db/sqlc/pantry.sql.go`
4. **`pantry_items` table** — `migrations/00001_app_owned_tables.sql`
5. **`PantryWasteStats` resolver** — waste analytics, never queried
6. **pgvector extension** — `migrations/00003_pgvector.sql`, enabled but unused
   (likely groundwork for AI features that were never built)
7. **`invalidate-sessions.ts`** — operational script, no caller
8. **Terraform / Cloud Build** — complete, not exercised in local development

**None of this should be deleted.** Items 1–5 are a working feature waiting to
be plugged in.

---

## What Claude added

**New files (43)** — all under `features/meals/` (models, engines, screens,
tests), `features/penny/penny-service.ts`, `components/hive-{cards,navigation,calendar,instacart}.tsx`,
`services/api-error.ts`, `constants/env.ts`, `auth/dev-preview.ts`.

**Padraic files modified (11)** — `app-root.tsx`, `theme.ts`, `hive-ui.tsx`,
`auth-context.tsx`, `app-state.tsx`, `_layout.tsx`, and five meal route stubs.

---

## Plain English

**Fully working today:** authentication (email/password, Apple, Google, verification,
reset), user profiles and handles, preferences, onboarding, and push tokens.
Real Go API, real Postgres, real Better Auth. This is solid work.

**Built but disconnected:** the entire pantry feature. Backend, database and
generated client operations all exist and are unused. Reconnecting it is
plumbing, not new development.

**Replaced with mocks or frontend logic by me:** the meal-plan system (never
existed), Penny's replies (were hardcoded strings, now an honest service seam),
and the Finance dashboard (was fabricated numbers, now Coming Soon).

**Never existed in Padraic's backend:** meal planning, recipes, grocery lists,
Penny/AI of any kind, Instacart, Kroger, Plaid, finance, subscriptions,
analytics, resources, benefits, questionnaires, PDF autofill.

**Needs reconnecting (no new backend work):** pantry — six operations, one
screen.

**Needs new backend development:** meals (spec written), Penny orchestration,
resources, benefits/PDF (or productionising the separate prototype), finance/Plaid,
Instacart.

**Safe to remove later — but only once replaced:** `data/mock-data.ts` once real
data lands; `auth/dev-preview.ts` once auth runs locally; the `.env.local` flag.

**Do not touch:** `apps/auth` entirely; `apps/server/internal/auth/`; the
migrations; the sqlc-generated layer (regenerate, never hand-edit); Terraform and
Cloud Build; and the unused pantry backend — it is the next thing to connect,
not dead code.
