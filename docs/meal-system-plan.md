# Meal system — audit and architecture plan

Requested before implementation. Nothing has been changed to produce this.

---

## A. Current state

### What exists in the app today

The meal feature was built earlier in this migration and lives in
`apps/mobile/src/features/meals/` — about 6,800 lines including tests.

| Piece | Files | State |
|---|---|---|
| Domain models | `meal-enums.ts`, `recipe-model.ts`, `meal-plan-model.ts`, `ingredient-model.ts`, `pantry-model.ts` | Complete, zod-validated |
| Questionnaire | `questionnaire-steps.ts`, `questionnaire-sections.tsx`, `questionnaire-review.tsx`, `meal-questionnaire.tsx` | All 13 sections working |
| Generation UI | `meal-plan-generating.tsx` | Rotating progress, honest failure |
| Plan screen | `meal-plan-screen.tsx` | Week strip, meal moving, cost range |
| Choose recipes | `recipe-browser.tsx`, `assign-recipes-screen.tsx`, `recipe-detail-screen.tsx` | Working |
| Grocery | `grocery-list-screen.tsx`, `shop-on-my-own-screen.tsx`, `instacart-screen.tsx` | Working |
| Service seams | `meal-plan-service.ts`, `recipe-service.ts`, `grocery-service.ts` | Typed interfaces, reject when no backend |
| Dev mock | `mock/` — 4 files | Implements the same contract locally |
| Tests | 5 suites, 78 tests | Passing |

**Critically: none of it persists.** Plans live in React context and a
module-level map in the mock. Closing the app loses everything. That is exactly
the problem this request names.

### Meal prep

**There is no meal-prep functionality anywhere in the app.**

---

## B. ZIP analysis

I extracted and audited this ZIP at the start of the migration; it is the source
the current models were ported from. Re-verified against the file you just gave
me (`280,994` bytes, unchanged).

Contents:

- `docs/recipes/01–04` — the controlling specification (product, recipe data
  model, Penny's planner engine, the questionnaire)
- `docs/requirements/*.pdf` — founder-facing requirement docs
- `HTHMealKit/` — a working Swift package: Standard HTH Recipe Object, canonical
  ingredient catalog, pantry matching, tiered pricing, grocery consolidation,
  deterministic weekly planner, AI extraction layer, 16 XCTests
- `HTHMealKit/Resources/` — seed data: 10 recipes, 35 ingredients, 35 price rows
- `reference/` — dataset licensing and pricing research

### Already reused

The Swift models were ported to TypeScript and the seed JSON is the mock's data
source. The engine logic (consolidation, package rounding, pantry credit, cost
ranges, allergen filtering) was ported into `features/meals/mock/`.

### ⚠️ There is no Meal Prepping System in this ZIP

You described the ZIP as containing a Meal Prepping System. It does not. The
only occurrences of "meal prep" are:

1. `meal_prep` as one of ten **cooking-style preference** options in the
   questionnaire
2. `household.meal_prep` as a **recipe tag**, with a tagging rule:
   `(leftovers OR freezer) AND servings >= 4`

There is no batch-cooking engine, no prep tasks, no storage guidance, no
shared-ingredient prep logic, no schedule. **Everything in Step 6 of your
request would be new development**, designed from scratch.

If a separate meal-prep archive exists, send it — otherwise I will treat meal
prep as a new feature and design it against the spec's tags.

---

## C. Current backend

**There is no meal backend.** Verified by keyword sweep across
`apps/server`, `apps/auth` and `packages/api-contract`:

| Term | Backend files |
|---|---|
| recipe, nutrition, calorie, macro, dietary, allergen, grocery, ingredient, serving, breakfast | **0** |
| meal | 14 — but only two preference fields: `lastMealPlanDate`, `weeklyMealPlanNotificationsEnabled` |
| pantry | 21 — **real and complete** |

### What is there and usable

- **Pantry**: `pantry_items` table, `queries/pantry.sql`, sqlc layer,
  `internal/modules/pantry/service.go` with tests, 5 resolvers, generated client
  operations. **Zero call sites** — built, never connected.
- **Users/profiles/preferences/onboarding**: real, actively used.
- **Auth**: Better Auth + JWKS middleware, actively used. Ownership can be
  enforced from `auth.UserIDFromContext`.

### Codegen pattern to follow

```
packages/api-contract/schema.graphql  → gqlgen → generated.go, models_gen.go, *.resolvers.go
apps/server/migrations/*.sql + queries/*.sql → sqlc → internal/db/sqlc
make generate   # runs both
```

Clean and conventional. Meal work slots into it without inventing anything.

---

## D. Missing pieces

1. Meal database schema — every table
2. Meal GraphQL schema and resolvers
3. Meal generation service (server-side)
4. Recipe library storage and seeding
5. Ingredient catalog and price book storage
6. Grocery list persistence
7. AI provider adapter and prompt construction
8. Structured-output validation server-side
9. Meal-prep system — entirely new
10. Pantry connection — backend exists, UI ignores it
11. Budget wiring — `weeklyGroceryBudget` is collected at onboarding but never reaches meal generation

---

## E. Recommended architecture

```
React Native (features/meals)
  │  typed service interfaces — already in place
  ▼
GraphQL API  (packages/api-contract/schema.graphql)
  │
  ▼
Go resolvers (internal/graphql/meals.resolvers.go)
  │
  ▼
internal/modules/meals/         ← new module, mirrors modules/pantry
  ├── service.go                orchestration + ownership checks
  ├── planner.go                deterministic filter → score → optimise
  ├── grocery.go                consolidation, package rounding, pricing
  ├── prep.go                   batch-cooking derivation
  └── generator/
      ├── provider.go           interface — no vendor named
      ├── prompt.go             prompt construction, server-side only
      └── validate.go           structured-output validation
  │
  ├── reads → internal/modules/pantry   (existing, reused not duplicated)
  ├── reads → internal/modules/users    (household, preferences, budget)
  ▼
Postgres (sqlc)
  │
  ▼
Optional AI provider  ← behind provider.go, key server-side only
```

Two rules this enforces, both from your spec: deterministic code does the maths
(consolidation, pricing, budget, allergens), and AI only interprets, drafts and
explains. The provider interface means no vendor appears anywhere else.

---

## F. Database changes

New migration `00005_meals.sql`:

| Table | Purpose |
|---|---|
| `ingredients` | canonical catalog + allergen/diet flags |
| `ingredient_prices` | tiered estimates, `unit_price`, `package_size`, `divisible`, `tier` |
| `recipes` | Standard HTH Recipe Object |
| `recipe_ingredients` | lines: `quantity` nullable, `missing_information` |
| `recipe_instructions` | ordered steps |
| `recipe_tags` | taxonomy ids |
| `meal_plans` | `user_id`, dates, `request` jsonb snapshot, cost range, status |
| `meal_plan_meals` | day + meal_type slot → recipe, scale factor |
| `grocery_lists` | per plan |
| `grocery_list_items` | consolidated, pantry-aware |
| `meal_prep_tasks` | new — batch steps derived from a plan |
| `saved_recipes` | favourites / My Recipes |

Every user-scoped table carries `user_id` with an index and is filtered by it in
SQL, never in the client.

---

## G. API changes

Extend `schema.graphql` following existing naming:

```graphql
type Query {
  mealPlan(id: ID!): MealPlan
  currentMealPlan: MealPlan
  mealPlans: [MealPlan!]!
  recipes(filter: RecipeFilterInput): [Recipe!]!
  recipe(id: ID!): Recipe
  groceryList(mealPlanId: ID!): GroceryList
  mealPrepPlan(mealPlanId: ID!): MealPrepPlan
}

type Mutation {
  generateMealPlan(input: GenerateMealPlanInput!): MealPlan!
  moveMeal(input: MoveMealInput!): MealPlan!
  replaceMeal(input: ReplaceMealInput!): MealPlan!
  updateServings(input: UpdateServingsInput!): MealPlan!
  deleteMealPlan(id: ID!): Boolean!
  saveRecipe(recipeId: ID!): Recipe!
  generateGroceryList(mealPlanId: ID!): GroceryList!
  toggleGroceryItem(itemId: ID!, checked: Boolean!): GroceryListItem!
}
```

This replaces the REST contract in `meal-plan-backend-contract.md`, which was
written before I knew the server was GraphQL-only. Same semantics, existing
convention.

---

## H. Files I intend to change

**Backend (new):** `migrations/00005_meals.sql`, `queries/meals.sql`,
`queries/recipes.sql`, `queries/grocery.sql`, `internal/modules/meals/*`,
`internal/graphql/meals.resolvers.go`, plus regenerated sqlc/gqlgen output.

**Contract:** `packages/api-contract/schema.graphql`,
`operations/meals.graphql`.

**Frontend (modify):** `meal-plan-service.ts`, `recipe-service.ts`,
`grocery-service.ts` — swap the pending implementations for GraphQL calls.
`meal-plan-context.tsx` — server as source of truth.

**Frontend (unchanged):** every meal screen. The UI does not need redesigning;
it already renders the right shapes.

---

## I. Risk assessment

1. **No database here.** No Postgres, no Docker, and Homebrew is the Intel build
   on your arm64 Mac so it cannot install one. I can write migrations, run
   codegen (sqlc reads SQL statically) and compile, but **cannot run migrations
   or integration tests**. Everything DB-touching would ship unverified until
   Postgres exists. Postgres.app is the easiest fix.

2. **This is Padraic's backend, and he is active** — 19 commits, most recent
   Aug 26. Adding eleven tables and a module to his service is significant
   shared-infrastructure work. Your original instruction was that his backend is
   read-only until you authorise changes. This request does ask for database and
   API changes, which I read as that authorisation — but I want it said plainly
   rather than assumed, and he should probably know before it lands.

3. **Scope.** This is realistically a multi-day backend feature, not a session's
   work. I would sequence it: schema and codegen → recipe/ingredient seeding →
   plan persistence → grocery lists → pantry connection → AI adapter → meal prep.

4. **Meal prep is undefined.** Not in the ZIP, no spec. Needs product input on
   what a prep task is before it can be built well.

5. **Low risk to existing systems.** Meals are additive — new tables, new
   resolvers, new module. Auth, benefits, finance, Penny and navigation are
   untouched. The one shared change is `schema.graphql`, which is additive.
