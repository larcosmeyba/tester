# Meal system — what was built

Meal Plan is now the central home for meal functionality, backed by real
persistence in PostgreSQL. This is the delivery report for that work.

## What was already there

**Padraic's backend.** Go 1.26 with gqlgen, sqlc, goose migrations and pgx
against PostgreSQL. A GraphQL schema covering viewer, profile, preferences,
onboarding, pantry and push tokens. JWT verification against Better Auth's JWKS.
A `Store` of hand-written pgx queries. All of it untouched by this work except
where noted below.

**The mobile meal feature.** The questionnaire, the plan screen, the recipe
browser, the recipe detail screen, the grocery list, "shop on my own" and the
Instacart screen, plus the runtime schemas in `recipe-model.ts` and
`meal-plan-model.ts`. All of it ran against a local development mock, because
the server had no meal schema.

**The seed library.** 35 ingredients, 35 price estimates and 10 recipes shipped
with the product spec, loaded into the app as JSON fixtures.

## What changed

### Database

`apps/server/migrations/00005_meals.sql` adds eleven tables: `ingredients`,
`ingredient_prices`, `recipes`, `recipe_ingredients`, `recipe_instructions`,
`meal_plans`, `meal_plan_meals`, `grocery_lists`, `grocery_list_items` and
`saved_recipes`.

Three product rules are enforced by the schema rather than by convention:

- `recipe_ingredients.quantity` is nullable, beside a `missing_information`
  column. A quantity the source never stated stays missing.
- Costs are stored as point, low, high and a confidence — never a bare number.
- `meal_plans_one_active_idx`, a partial unique index, gives a user at most one
  active plan.

Padraic's existing four migrations are unchanged.

### Backend

`internal/db` gains the meal domain types and their queries, written in the same
hand-rolled pgx style as the rest of the store, split across
`meals_types.go`, `ingredients_store.go`, `recipes_store.go`,
`meal_plans_store.go` and `grocery_store.go`.

`internal/modules/meals` holds the engine, one concern per file:

| File | Responsibility |
| --- | --- |
| `validate.go` | Bounds and vocabulary checks on a request |
| `catalog.go` | Allergen and diet facts, read from reviewed catalogue flags |
| `filter.go` | The hard filters: allergies, diets, equipment, time, dislikes |
| `pricing.go` | Household scaling and tier-weighted cost ranges |
| `grocery.go` | Consolidation across the week, pantry-aware |
| `score.go` | Preference ranking |
| `planner.go` | Deterministic week building |
| `narrator.go` | Penny's message, with a server-written fallback |
| `service.go` | Orchestration and ownership |
| `generator/` | The AI seam |

### API

`packages/api-contract/meals.graphql` — seven queries and nine mutations. See
[meal-plan-backend-contract.md](meal-plan-backend-contract.md) for the field
list. Resolvers are in `internal/graphql/meals.resolvers.go`, with the mapping
helpers in `meals_mapping.go` so gqlgen never rewrites them.

### Frontend

The three services — `meal-plan-service.ts`, `recipe-service.ts`,
`grocery-service.ts` — now call GraphQL instead of throwing
`BACKEND INTEGRATION REQUIRED`. **No screen or component changed.**

Responses are converted from camelCase to the product's snake_case wire shape by
`graphql-wire.ts` and parsed by the schemas that were already there, so there is
still one definition of what a recipe or a plan is, and a response that drifts
from the contract still fails at the service boundary.

## The engine

The pipeline is filter → scale → pantry → price → score → optimise →
consolidate, and every step runs on the server.

**Filtering.** Allergies and diets are decided from reviewed catalogue flags,
never from a recipe's text and never from anything a model produced. Three rules
matter:

- A recipe with an ingredient line the catalogue cannot identify is excluded
  when the user has declared an allergy or a required diet. It is not assumed
  safe.
- An allergy covers an ingredient's children: "tree nuts" excludes sliced
  almonds without almonds being listed.
- A *required* diet excludes; a *preferred* one only ranks.

**Scaling.** A recipe is sized to the household, clamped to a sane range and
left alone when it is not scalable.

**Pricing.** Packaged goods are bought whole and rounded up, because that is
what the till charges; loose goods are bought to the quantity needed. The
estimate is always a range, with the band's width weighted by which price tiers
the basket drew on. An ingredient with no price row is listed at zero, disclosed
in the plan's assumptions, and caps the confidence at low — a missing price is
never treated as free.

**Planning.** Deterministic: the same request against the same library produces
the same week, with ties broken on recipe id. A slot with no eligible recipe is
left empty and the plan is marked `partial`. It never invents a meal, and never
reuses a recipe the filters rejected.

## AI

The architecture is: app → Help The Hive backend → meal generation service → AI
provider. The app holds no key, sees no prompt, and never calls a provider.

The AI has no authority over the plan. The week is chosen, scaled and priced
before a provider is called; the provider only writes the sentence that explains
it. Its reply must:

- parse as the JSON object the prompt specifies;
- stay inside a length bound;
- contain no number the server did not compute;
- make no eligibility, approval or guarantee claim;
- carry no markup.

Anything else is discarded and the server's own deterministic message is used —
so a bad reply, a slow provider or an outage never costs a user their plan.

The fact sheet sent to a provider is aggregate and anonymous by construction: no
user id, no email, no household composition, no allergy or diet, no health
information, and none of the free text the user typed. Only meal counts, recipe
titles and the computed cost figures.

**Switching providers is configuration.** `MEAL_AI_PROVIDER`,
`MEAL_AI_BASE_URL`, `MEAL_AI_MODEL` and `MEAL_AI_API_KEY` are read server-side.
With `MEAL_AI_PROVIDER` unset — the default everywhere today — the meal system
runs entirely deterministically. Nothing is hardwired to one vendor.

## Pantry

The planner reads the pantry ingredient ids the questionnaire collects, marks
them used per meal, and keeps them on the grocery list with `inPantry: true` and
a zero estimate rather than hiding them, so nothing silently goes missing from a
shop.

**Not yet connected:** the Pantry tab still reads `initialPantryItems` from
`mock-data.ts` and does not call Padraic's pantry API. That was true before this
work and is unchanged by it. Wiring the pantry tab to `pantryItems` would also
let the questionnaire pre-fill from what the user actually has.

## Grocery list

`acceptMealPlan` consolidates the week into a saved list, grouped into store
sections in shopping order. Ticks are stored per item and survive a reload, and
are preserved when a list is rebuilt. `groceryListFromRecipes` prices an ad-hoc
selection without saving anything, because the user has not committed to a week.

## Mock data

`src/features/meals/mock/` and `src/data/meal-seed/` are unchanged and still
development-only. `useMockServices` now defaults to the **real backend**; the
mock is opt-in through `EXPO_PUBLIC_USE_MOCK_SERVICES=true`, and is also used
under developer-preview sign-in, which holds no token and would fail every call
as unauthorized. It is never on in a production build.

The same fixtures are now embedded in the server as `cmd/seed-meals`, so the
backend does not depend on the app's assets.

## Environment variables

Server (`apps/server/.env.example`):

```
MEAL_AI_PROVIDER=      # unset = deterministic; "openai_compatible" to enable
MEAL_AI_BASE_URL=
MEAL_AI_MODEL=
MEAL_AI_API_KEY=       # server secret; never an EXPO_PUBLIC_* variable
```

Mobile: `EXPO_PUBLIC_USE_MOCK_SERVICES` (optional, defaults to the real
backend). No new public variable, and no key of any kind.

## Testing

| Area | Where |
| --- | --- |
| Filtering, scaling, pricing, grocery, planning | `internal/modules/meals/engine_test.go` |
| Request validation | `internal/modules/meals/validate_test.go` |
| AI output validation | `internal/modules/meals/generator/validate_test.go` |
| Cross-user access at the SQL level | `internal/db/meals_integration_test.go` |
| End-to-end through the service | `internal/modules/meals/service_integration_test.go` |
| GraphQL response conversion | `src/features/meals/__tests__/graphql-wire.test.ts` |

The two integration tests are gated on `TEST_DATABASE_URL` and skip without it.

```bash
cd apps/server && TEST_DATABASE_URL="postgres://helpthehive:helpthehive@localhost:5432/helpthehive_test?sslmode=disable" make test GO=/usr/local/bin/go
```

The ownership test caught a real defect during development: a nil Go slice
encodes as SQL NULL, which the `NOT NULL text[]` columns reject. Every array
write now goes through `db.textArray`.

Padraic's existing auth, config, db, graphql, http, pantry and users tests all
still pass.

## Remaining work

**Before launch**

- Wire the Pantry tab to Padraic's pantry API, then pre-fill the questionnaire's
  pantry step from it.
- Instacart handoff: the partner integration and its server-side credentials.
- Run `make seed-meals` against staging and production.
- Decide the review process for library recipes. `visibility` and
  `review_status` exist and are enforced; nothing populates them but seeding.
- Android icons still render as letters — `HiveIcon` uses SF Symbols, which are
  iOS-only. This predates the meal work and affects every screen.

**After launch**

- Recipe import from a video or a URL. The model supports it; no path is built.
- A real price feed. Everything is currently tier 3–4, which is why cost
  confidence is medium at best.
- Nutrition computed from FoodData Central rather than carried on the recipe.
- Turn on an AI provider for Penny's message, once one is approved.

**Future**

- Meal prepping. Deferred by decision; the ZIP contained no meal-prep system.
- Per-slot cost attribution (`incrementalCheckoutCost` is modelled but not
  computed).
- Regional pricing. `geographic_scope` exists and everything is `us` today.
