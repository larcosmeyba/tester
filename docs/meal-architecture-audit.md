# Meal architecture — audit, Bitewise comparison, and target structure

Written before any code was changed. Baseline at the time of writing:
`go build ./...` and `go test ./...` clean; `jest` 82 passing across 6 suites.

Bitewise (`RainyRoot/bitewise`, `master`, 113 files) is read here as a
**structural** reference only. Help The Hive's product spec, safety rules,
database requirements and UX remain the source of truth for every decision
below.

---

## 1. Audit — the meal code that exists today

### Server (`apps/server`, Go 1.26, gqlgen + goose + pgx on Postgres)

```
internal/
  auth/       JWKS verification, identity middleware
  config/
  db/         store.go ......................... 818 lines
              meals_types.go .................... 191
              recipes_store.go .................. 368
              meal_plans_store.go ............... 224
              ingredients_store.go .............. 176
              grocery_store.go .................. 129
              sqlc/ ............................. 8 generated files
  graphql/    schema.resolvers.go ............... 445
              meals.resolvers.go ................ 261
              meals_mapping.go .................. 360
  http/       router.go, readiness.go
  modules/
    meals/    service.go ........................ 801 lines
              planner.go 252 · types.go 227 · pricing.go 205 · validate.go 206
              grocery.go 161 · narrator.go 150 · filter.go 151 · score.go 128
              catalog.go 122
              generator/ prompt.go · provider.go · validate.go
    pantry/   service.go ........................ 178
    users/    service.go ........................ 270
migrations/   00001_app_owned_tables · 00002_profile_handles · 00003_pgvector
              00004_notification_preferences · 00005_meals (236 lines, 10 tables)
queries/      7 .sql files
```

### Mobile (`apps/mobile`, Expo SDK 57 / RN 0.86, Expo Router)

```
src/features/meals/     25 files, ~6,800 lines
  models      meal-enums · recipe-model · meal-plan-model · ingredient-model · pantry-model
  screens     meal-plan-screen · recipe-browser · assign-recipes-screen
              recipe-detail-screen · grocery-list-screen · shop-on-my-own-screen
              instacart-screen · meal-questionnaire · questionnaire-* · meal-plan-generating
  services    meal-plan-service · recipe-service · grocery-service · graphql-wire
  state       meal-plan-context
  mock/       mock-meal-plan-service · mock-recipe-service · grocery-aggregation · seed-data
src/app/meals/          7 thin route files (3 lines each)
src/app/pantry/         3 route files — all 1-line re-exports of app-root
src/data/meal-seed/     3 JSON fixtures
```

### The eight requested domains, as they stand

| Domain | Where it lives now | State |
|---|---|---|
| recipes | `meals/service.go` lines 58–98, `db/recipes_store.go` | Real, but inside the meal service |
| meal plans | `meals/service.go` lines 142–348, `db/meal_plans_store.go` | Real, but inside the meal service |
| meal generator | `planner.go` `filter.go` `score.go` `pricing.go` `catalog.go` `generator/` | **Real and well factored** |
| meal prep | — | Does not exist |
| pantry | `modules/pantry`, `pantry_items` table | Real, but not linked to `ingredients` |
| grocery | `meals/grocery.go`, `meals/service.go` lines 356–518, `db/grocery_store.go` | Real, but inside the meal service |
| nutrition | `planner.go:199 nutritionSummary`, columns on `recipes` | Fragmentary, no home |
| video-to-recipe | `recipes.source_type` accepts `video_import` | Data model only, no path |

---

## 2. Comparison with Bitewise

### How Bitewise separates concerns

Bitewise layers **horizontally**, one file per feature inside each layer:

```
backend/internal/
  domain/       15 files — pure types, no dependencies (recipe, mealplan, pantry, shopping, …)
  handler/      17 files — HTTP + middleware
  service/      15 files — business logic
  repository/   14 files — SQLite access
  nutrition/    openfoodfacts.go, seasonal.go     ← external integration, own package
  scraper/      chefkoch.go                        ← external integration, own package
  config/  migrations/  pkg/httputil/
mobile/
  app/  hooks/  i18n/  services/  types/
```

### What is worth borrowing

1. **A dependency-free `domain/` layer.** `mealplan_service.go` can hold a
   `domain.Recipe` without importing the recipe service. This is the single
   thing Help The Hive most needs: the moment `meals` splits into recipes,
   plans, grocery and the generator, they all need to name the same `Recipe`
   and `CostRange`, and today those types live in `internal/db` — the
   persistence package. Every module would import the database to describe a
   recipe.
2. **One file per feature per layer.** "Where is shopping-list SQL?"
   `repository/shopping_repository.go`. Nothing is a god-file.
3. **External integrations get their own top-level package** — `nutrition/`
   wraps OpenFoodFacts, `scraper/` wraps Chefkoch. Neither is buried inside a
   service. That is exactly the shape Help The Hive needs for retailer
   handoff and video-to-recipe.
4. **Repository per feature, not one store.**

### What must *not* be copied

| Bitewise | Help The Hive keeps |
|---|---|
| REST + hand-written handlers | GraphQL + gqlgen codegen from `packages/api-contract` |
| SQLite, raw strings | Postgres, goose migrations, pgx, partial unique indexes |
| `mealplan_service.go` does CRUD *and* planning | The engine stays split: filter · score · price · plan |
| Nutrition = an OpenFoodFacts client | Nutrition is per-serving recipe data + plan goal summaries |
| Flat 15-feature layering | Vertical modules — HTH has household, budget, retailers, video ahead of it |
| Social features, achievements, friends, leaderboards | Out of scope; not product requirements |

**The synthesis: vertical modules, layered horizontally inside, over a shared
dependency-free domain package.** Bitewise's flat layering answers "what kind of
code is this"; Help The Hive's modules answer "what part of the product is
this". At Help The Hive's intended scope — user → household → dietary →
budget → pantry → generator → plan → recipes → prep → grocery → retailers —
the second question is the one that matters, so modules stay the outer axis and
Bitewise's layering is applied *within* each one.

---

## 3. What to keep

Untouched by this work, and deliberately so:

1. **The engine decomposition** in `modules/meals/`: `filter.go`, `score.go`,
   `pricing.go`, `grocery.go`, `planner.go`, `catalog.go`, `validate.go`. One
   concern per file, already cleaner than Bitewise's `mealplan_service.go`.
   Every one of these files moves as-is.
2. **The safety rules.** Allergies decided from reviewed catalogue flags, never
   from recipe text and never from model output. An unidentifiable ingredient
   line excludes the recipe rather than being assumed safe. An allergen covers
   an ingredient's children. Required diets exclude; preferred diets only rank.
3. **Cost as a range with a confidence and a tier mix**, never a bare number,
   with budget compliance checked against `high`.
4. **`migrations/00005_meals.sql`.** The Standard HTH Recipe Object, nullable
   `recipe_ingredients.quantity` beside `missing_information`, and
   `meal_plans_one_active_idx`. No existing table is altered or dropped.
5. **AI as narrator only** — behind `generator.Provider`, output validated for
   invented numbers, deterministic server-written fallback.
6. **The codegen pipeline** — `packages/api-contract/*.graphql` → gqlgen → Go
   resolvers, and → graphql-codegen → mobile types.
7. **The ownership model** — no meal field accepts a user id, and anything the
   viewer may not see is `NOT_FOUND`, never `FORBIDDEN`.
8. **`apps/mobile/src/features/meals/`** — the models, screens and zod-at-the-
   boundary discipline. No screen changes.

---

## 4. What to reorganize

1. **`modules/meals/service.go` — 801 lines, four unrelated responsibilities.**
   Recipe library reads (58–98), plan lifecycle (142–348), grocery lists
   (356–518), and generation orchestration + persistence (524–801). This is the
   giant service, and splitting it is the core of this work.
2. **`internal/db/store.go` — 818 lines, one `Store` for six domains**: users,
   profiles, preferences, onboarding, pantry, push tokens — plus five meal store
   files hanging off the same struct. Bitewise's `repository/<feature>` is the
   right shape.
3. **Meal domain types live in `internal/db/meals_types.go`** — the persistence
   package. `Recipe`, `Ingredient`, `MealPlan` and `GroceryList` must move to a
   dependency-free domain package before the modules can be split without
   import cycles.
4. **`nutritionSummary` is a private function in `planner.go`.** Nutrition is
   one of the eight domains and currently has no package.
5. **Pantry is not connected to the ingredient catalogue.** `pantry_items`
   stores a free-text `name`; the generator matches on canonical
   `ingredient_id`. The `Pantry → Meal Generator` link in the requested
   hierarchy is *physically absent*: the questionnaire's pantry step collects
   ids from the catalogue, and the Pantry tab writes names that never reach it.
6. **Household, dietary preferences, allergies and budget have no storage.**
   They survive only inside the `meal_plans.request` JSONB snapshot.
   `profiles.household_size` and `preferences.weekly_budget` (a `TEXT` column)
   are the only durable pieces and neither is read by the generator. Steps 2–4
   of the requested hierarchy have no tables at all.
7. **Retailer integration is a rejected promise.**
   `groceryService.prepareInstacartOrder` throws `BACKEND INTEGRATION REQUIRED`;
   there is no server-side seam for it to call.

---

## 5. Duplicate and mock systems

| # | Finding | Evidence | Call |
|---|---|---|---|
| 1 | **sqlc is dead code** — a second, unused data-access strategy | `grep -r "db/sqlc" --include='*.go'` outside `internal/db/sqlc/` returns **nothing**. 8 generated files + 7 `queries/*.sql` + `sqlc.yaml`, still run by `make generate` | **Delete.** The hand-written pgx stores won; keeping both means every schema change has two homes |
| 2 | **Seed fixtures exist twice, byte-identical** | `apps/mobile/src/data/meal-seed/*.json` vs `apps/server/cmd/seed-meals/data/*.json` — 23,758 / 6,742 / 49,207 bytes, `diff` clean | Server copy is canonical. Mobile copy stays only as long as the dev mock does, and must be documented as a mirror |
| 3 | **Two incompatible pantry models in the app** | `features/meals/pantry-model.ts` is `{ingredientId, quantity: number, expiresOn, useFirst}`; `state/app-state.tsx` + `data/mock-data.ts` is `{name, quantity: string, location, category, status}` | Reconcile on the server first (finding 4.5), then collapse to one |
| 4 | **The dev mock re-implements the engine** | `mock/grocery-aggregation.ts` (168) + `mock/mock-meal-plan-service.ts` (363) re-do consolidation, package rounding, pantry credit, cost ranges and allergen filtering. Two of the six jest suites test *the mock's* engine, not the server's | Keep the mock — it is deliberate, documented, and off in production — but stop growing it, and treat its tests as mock tests |
| 5 | Pantry tab never calls its own backend | `pantryItems`/`addPantryItem` resolvers exist with zero call sites; the tab reads `initialPantryItems` from `mock-data.ts` | Pre-existing, tracked in `migration-checklist.md` #11 |

---

## 6. Proposed folder structure

```
apps/server/internal/
  domain/                        ← NEW. Types only. Imports nothing but stdlib.
    meals/
      vocab.go        closed vocabularies, PlannableMealTypes, AisleOrder
      ingredient.go   Ingredient, IngredientPrice
      recipe.go       Recipe, RecipeIngredient, RecipeInstruction, RecipeFilter
      request.go      PlanRequest, Household, Budget, Diet/Allergy/Nutrition prefs
      plan.go         Plan, PlannedMeal, Slot, PlanSummary, MealPlan (stored form)
      grocery.go      GroceryItem, GrocerySection, GroceryList, CostRange
      nutrition.go    NutritionInfo, NutritionGoalSummary, BalancedMealBaseline

  db/                            ← the repository layer, one file per domain
    db.go             Connect, Store, NewID, scanners, shared helpers
    users_store.go    users · profiles · handles · preferences · onboarding
    push_store.go
    pantry_store.go
    ingredients_store.go
    recipes_store.go
    meal_plans_store.go
    grocery_store.go
    (internal/db/sqlc + queries/ deleted)

  modules/                       ← one package per product domain
    users/
    household/          NEW  household, dietary prefs, allergies, food budget
    pantry/                  extended: ingredient_id linkage
    recipes/            NEW  library reads, saved recipes, ownership
    mealgen/            NEW  the engine — moved intact from modules/meals
      catalog.go filter.go score.go pricing.go planner.go validate.go
      service.go             Generate + replacement selection
      narrator.go
      provider/              (was meals/generator/)
    mealplans/          NEW  plan lifecycle: current, get, move, swap, delete, persist
    grocery/            NEW  consolidation, saved lists, ticks
      retailer/         NEW  Instacart and other retailer adapters
    nutrition/          NEW  per-recipe nutrition + per-plan goal summaries
    mealprep/           NEW  batch tasks derived from a plan
    videorecipe/        NEW  video/URL → Standard HTH Recipe Object

  graphql/              resolvers split by domain, mapping helpers alongside
  auth/  config/  http/
```

**Dependency rule, enforced by the compiler:**

```
graphql ──▶ modules/* ──▶ db ──▶ domain
                └──────────────▶ domain
```

`domain` imports nothing. `db` imports `domain`. Modules import `domain` and
declare their *own* repository interface, satisfied by `*db.Store` — so a
module states what it needs from the database rather than being handed all of
it. Modules never import each other's services; where one needs another
(plans need the generator, grocery needs the catalogue) the dependency is an
interface declared by the consumer and wired in `cmd/server/main.go`.

### Naming note — `db` rather than `repository`

Bitewise calls this layer `repository/`. Help The Hive's `internal/db` already
*is* that layer, in the same one-file-per-domain shape. Renaming it would touch
every file in the server for a cosmetic gain and would churn Padraic's
non-meal code. The separation Bitewise demonstrates is achieved here by
splitting `store.go` and by consumer-declared interfaces; the package keeps its
existing name.

### Mobile

`src/features/meals/` already matches this shape and needs no restructuring.
The one change worth making is splitting it along the same domain lines as the
server, so a developer moving between the two finds the same words:

```
src/features/meals/
  recipes/     recipe-model · recipe-service · recipe-browser · recipe-detail-screen
  plan/        meal-plan-model · meal-plan-service · meal-plan-screen · meal-plan-context
  generator/   meal-questionnaire · questionnaire-* · meal-plan-generating
  grocery/     grocery-service · grocery-list-screen · shop-on-my-own-screen
  pantry/      pantry-model
  shared/      meal-enums · ingredient-model · graphql-wire · pricing-notice
```

This is optional and deferred — it moves 25 files and touches every import for
no behavioural gain. Recorded here so the two sides can be aligned later.

---

## 7. Database and schema changes

### No existing table is altered destructively

`00005_meals.sql` and Padraic's four migrations stay as they are. Everything
below is additive, in new migrations.

### `00007_household_profile.sql` — the missing hierarchy steps

The requested chain is `User → Household → Dietary Preferences / Allergies →
Food Budget → Pantry → Meal Generator`. Steps 2–4 have no storage today; they
live only inside each plan's `request` JSONB, so a user re-answers them every
time and nothing else in the product can read them.

| Table | Purpose |
|---|---|
| `households` | `id`, `owner_user_id`, `size`, `adults`, `children`, `size_is_plus` |
| `household_members` | `household_id`, `user_id`, `role` — one household, several accounts |
| `household_dietary_requirements` | `household_id`, `diet`, `strength`, optional `member_id` |
| `household_allergies` | `household_id`, `allergen`, `strength` (always `required`), optional `member_id`, optional `ingredient_id` for "other" |
| `household_food_budgets` | `household_id`, `amount NUMERIC`, `currency`, `mode`, `period`, `effective_from` |

Notes:

- `preferences.weekly_budget` is a `TEXT` column collected at onboarding and
  never used by the generator. It is **not dropped**; the new table becomes the
  source of truth and the old column is backfilled and left in place for the
  finance screens that read it.
- `profiles.household_size` stays. `households.size` is derived from it on
  first write so nothing is lost.
- Per-member allergies are modelled from the start because a household plan
  that is safe "on average" is not safe.

### `00008_pantry_ingredients.sql` — connecting pantry to the generator

```sql
ALTER TABLE pantry_items
  ADD COLUMN ingredient_id TEXT REFERENCES ingredients(id) ON DELETE SET NULL,
  ADD COLUMN quantity_amount NUMERIC(10,4),
  ADD COLUMN quantity_unit   TEXT,
  ADD COLUMN use_first       BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX pantry_items_ingredient_idx ON pantry_items (user_id, ingredient_id);
```

`name` and the `quantity TEXT` column are kept and still authoritative for
display, so the existing Pantry UI and its rows are untouched. `ingredient_id`
is nullable: an item the catalogue cannot resolve stays in the pantry as text
and is simply not matched by the generator — it is never guessed at, for the
same reason a recipe with an unidentifiable line is excluded rather than
assumed safe.

### `00009_meal_prep.sql`

| Table | Purpose |
|---|---|
| `meal_prep_plans` | one per meal plan: `meal_plan_id`, `status`, `total_active_minutes` |
| `meal_prep_tasks` | `prep_plan_id`, `sequence`, `title`, `instruction`, `active_minutes`, `recipe_ids[]`, `ingredient_ids[]`, `storage`, `keeps_days` |

Derived deterministically from a plan's shared ingredients and its recipes'
`meal_prep`/`leftovers`/`freezer` tags, in the same filter-then-compute style
as the planner. No new user input.

### `00006_recipe_imports.sql` — already in flight

Written by concurrent work in this repository while this audit was being
produced, along with `internal/transcriber` and the `RecipeImport` half of
`meals.graphql`. It is *not* part of this reorganization and was not touched by
it; the number is recorded here so the migrations below do not collide with it.

### `00010_retailers.sql`

| Table | Purpose |
|---|---|
| `retailer_carts` | `grocery_list_id`, `retailer`, `external_cart_id`, `checkout_url`, `status`, `unmatched_ingredient_ids[]` |
| `retailer_ingredient_map` | `retailer`, `ingredient_id`, `external_product_id`, `confidence` |

Credentials stay in server configuration. Nothing retailer-shaped reaches the
app beyond a checkout URL and the list of items that could not be matched.

### Nutrition

**No new tables.** Per-serving nutrition already lives on `recipes` with a
`nutrition_confidence`, and plan-level goal summaries are computed. The
`nutrition` module owns the arithmetic; it does not own a store. A FoodData
Central-backed table is a later decision, deliberately not pre-built.

---

## 8. API changes

### Existing fields — unchanged

Every field in `packages/api-contract/meals.graphql` keeps its name, arguments
and shape. The resolvers move between Go files; the wire contract does not
change, so `apps/mobile` needs no regeneration for the reorganization itself.

### Additive — household and the hierarchy

```graphql
extend type Query {
  household: Household
}

extend type Mutation {
  updateHousehold(input: UpdateHouseholdInput!): Household!
  setHouseholdDietaryRequirements(input: [DietRequirementInput!]!): Household!
  setHouseholdAllergies(input: [AllergyRequirementInput!]!): Household!
  setFoodBudget(input: BudgetInput!): Household!
}

type Household {
  householdId: ID!
  size: Int!
  adults: Int
  children: Int
  sizeIsPlus: Boolean!
  dietaryRequirements: [DietRequirement!]!
  allergies: [AllergyRequirement!]!
  foodBudget: Budget
}
```

`PlanRequestInput` keeps every field it has. Where the client omits
`household`, `dietaryRequirements`, `allergies` or `budget`, the server fills
them from the stored household — so the questionnaire can pre-fill and a
returning user is not re-interrogated, without the client gaining any new
authority over what is safe to eat.

### Additive — pantry

```graphql
type PantryItem {
  # existing fields unchanged
  ingredientId: ID          # null when the catalogue cannot resolve the name
  quantityAmount: Float
  quantityUnit: String
  useFirst: Boolean!
}

input AddPantryItemInput  { ingredientId: ID  useFirst: Boolean }   # additive
extend type Query { pantryIngredientIds: [ID!]! }                   # feeds the questionnaire
```

### Additive — the three new domains

```graphql
extend type Query {
  mealPrepPlan(planId: ID!): MealPrepPlan
  recipeImport(importId: ID!): RecipeImport
}

extend type Mutation {
  generateMealPrepPlan(planId: ID!): MealPrepPlan!
  setMealPrepTaskDone(taskId: ID!, done: Boolean!): Boolean!
  importRecipeFromUrl(url: String!): RecipeImport!
  importRecipeFromVideo(url: String!): RecipeImport!
  prepareRetailerCart(planId: ID!, retailer: Retailer!): RetailerCart!
}
```

`prepareRetailerCart` is the endpoint `groceryService.prepareInstacartOrder`
has been rejecting against since it was written.

### Nutrition

`Recipe.nutrition` and `PlanSummary.nutritionGoal` already exist and are
unchanged. The `nutrition` module becomes their owner; no field moves.

---

## 9. Files to move, create and delete

### Move — server domain types (no logic change)

| From | To |
|---|---|
| `internal/db/meals_types.go` | `internal/domain/meals/{ingredient,recipe,plan,grocery}.go` |
| `internal/modules/meals/types.go` | `internal/domain/meals/{request,plan,grocery,vocab}.go` |

### Move — engine, intact

| From | To |
|---|---|
| `internal/modules/meals/catalog.go` | `internal/modules/mealgen/catalog.go` |
| `internal/modules/meals/filter.go` | `internal/modules/mealgen/filter.go` |
| `internal/modules/meals/score.go` | `internal/modules/mealgen/score.go` |
| `internal/modules/meals/pricing.go` | `internal/modules/mealgen/pricing.go` |
| `internal/modules/meals/planner.go` | `internal/modules/mealgen/planner.go` |
| `internal/modules/meals/validate.go` | `internal/modules/mealgen/validate.go` |
| `internal/modules/meals/narrator.go` | `internal/modules/mealgen/narrator.go` |
| `internal/modules/meals/generator/` | `internal/modules/mealgen/provider/` |
| `internal/modules/meals/grocery.go` | `internal/modules/grocery/consolidate.go` |
| `internal/modules/meals/engine_test.go` | split across `mealgen/` and `grocery/` |
| `internal/modules/meals/validate_test.go` | `internal/modules/mealgen/validate_test.go` |

### Split — the giant service

`internal/modules/meals/service.go` (801) becomes:

| Lines | New home |
|---|---|
| 58–98 recipe reads, saved recipes | `internal/modules/recipes/service.go` |
| 107–140 generate | `internal/modules/mealgen/service.go` |
| 142–348 current/get/delete/move/swap | `internal/modules/mealplans/service.go` |
| 356–518 accept, grocery list, ticks, ad-hoc list | `internal/modules/grocery/service.go` |
| 524–801 catalog load, persist, rehydrate, reprice | `mealplans/persistence.go` + `grocery/pricing.go` |

`internal/db/store.go` (818) splits into `db.go`, `users_store.go`,
`pantry_store.go`, `push_store.go`.

### Create

- `internal/domain/meals/` — 7 files
- `internal/modules/{recipes,mealplans,mealgen,grocery,nutrition}/`
- `internal/modules/{household,mealprep,videorecipe}/`,
  `internal/modules/grocery/retailer/`
- `migrations/00007`–`00010` (`00006` is taken by concurrent recipe-import work)
- `packages/api-contract/household.graphql`, `mealprep.graphql`,
  `recipe-import.graphql`, `retailer.graphql`
- `internal/graphql/{recipes,mealplans,grocery,household}.resolvers.go`

### Delete

- `internal/db/sqlc/` (8 files) — dead
- `queries/` (7 files) — dead, fed only sqlc
- `sqlc.yaml`, and the `sqlc` target from `Makefile`/`make generate`

### Unchanged

`apps/mobile/src/features/meals/` (all 25 files), every meal screen, every route
file, `apps/auth`, and the finance, resources, penny and onboarding features.
`internal/{auth,config,http}` and `modules/users` are untouched except where
`store.go` splits beneath them.

---

## 10. Sequence and risk

1. `domain/meals` + type moves — compiler-verified, no behaviour change ✅ **done**
2. Split `db/store.go`; delete sqlc and `queries/` ✅ **done**
3. Split `modules/meals` into the five modules; move resolvers ✅ **done**
4. `nutrition` module; move `nutritionSummary` out of the planner ✅ **done**
5. `00007` household + the API that reads it
6. `00008` pantry ↔ ingredients, and wire the Pantry tab
7. `mealprep`, `videorecipe`, `retailer` — new features, in that order

Steps 1–4 are pure reorganization: same behaviour, same wire contract, verified
by `go build ./...`, `go test ./...` and `jest`. Steps 5–7 are new
functionality and each needs its own product review.

**Risks**

- No Postgres on this machine, so the two integration suites
  (`TEST_DATABASE_URL`-gated) skip. Everything else compiles and runs.
- `graphql/generated.go` is gqlgen output; resolver moves must be followed by
  `make generate` or the build breaks in a confusing place.
- Steps 5–7 add tables to a backend Padraic also works in. Steps 1–4 add none.


---

## 11. What was delivered

Steps 1–4 above. Pure reorganization: no schema change, no wire-contract
change, no behavioural change. Verified by `go build ./...`, `go vet ./...`,
`gofmt -l`, `go test ./...` and the mobile `jest` suite — all green, with the
mobile suite unchanged at 82 passing.

### Three decisions taken during the work

**`Catalog` went to the domain, not the catalog module.** `Catalog` is an
indexed, read-only view over reviewed ingredient data with pure lookup
predicates — `Matches`, `ContainsAllergen`, `SatisfiesDiet`. Both the generator
and grocery need it. Keeping it in a module would have made grocery import the
generator (or the catalog module) to price a basket; in the domain, neither has
to. `modules/catalog` keeps what actually touches the database: loading the
catalogue and searching it.

**`validate.go` went to the domain too.** `Normalize` and `Validate` are
methods on `PlanRequest`, and a request that breaks its own bounds is not a
valid request whichever module receives it. Moving the type without them would
have meant rewriting every `request.Normalize()` call site into a free
function for no gain. The bounds constants moved with them, which is what lets
grocery check `MaxIDListLength` without importing the generator.

**A `catalog` module was added beyond the eight named domains.** The canonical
ingredient catalogue is shared reference data — the generator asks it what is
safe, grocery asks what things cost, the pantry and allergy pickers read it
directly. Giving it a module separates further rather than combining, and it
is what removes the last cross-module dependency between generator and grocery.

### Shape, before and after

| | Before | After |
|---|---|---|
| Largest meal file | `modules/meals/service.go`, 801 lines | `modules/mealplans/service.go`, 237 |
| Largest repository file | `db/store.go`, 818 lines | `db/users_store.go`, 439 |
| Meal modules | 1 (`meals`) | 6 (`recipes`, `mealplans`, `mealgen`, `grocery`, `nutrition`, `catalog`) |
| Meal domain types | in `internal/db` | in `internal/domain/meals` |
| Data-access strategies | 2 (hand-written pgx **and** dead sqlc) | 1 |
| Dead files | 16 (`db/sqlc/` ×8, `queries/` ×7, `sqlc.yaml`) | 0 |

### Not done, and why

- **`mealprep` and `videorecipe` packages were not created.** There is no
  existing meal-prep functionality to reorganize, and video-to-recipe is being
  built concurrently in this repository (see §7). Creating empty packages for
  them would have been dead code, not structure. Their designs stay in §6–§8.
- **`grocery/retailer` was not created.** `prepareInstacartOrder` still rejects
  client-side. Adding a server seam nothing calls is new work, not a move.
- **The resolvers were not split per domain.** `meals.resolvers.go` is gqlgen
  output under `layout: follow-schema`, so splitting it means splitting
  `packages/api-contract/meals.graphql` and regenerating. That is worth doing —
  it would align the contract with the domains — but it touches a file another
  session is actively editing, so it was left alone.
- **The mobile `features/meals/` split (§6) was not done.** It moves 25 files
  and every import for no behavioural gain; better done once the server layout
  has settled.

### Concurrent work in this tree

While this ran, another session was writing video-to-recipe import into the
same working tree: `internal/transcriber/`, `migrations/00006_recipe_imports.sql`,
the `RecipeImport` additions to `packages/api-contract/meals.graphql`, the
import variables in `.env.example`, `internal/domain/benefits/`, and
`docs/benefits-autofill-audit.md`. None of it was touched by this
reorganization, and everything compiles and tests green together —
`internal/transcriber` already imports `internal/domain/meals`. It is recorded
here because two sessions editing one tree is worth knowing about, not because
anything broke.


---

## 12. Completion pass — items 2 to 10

A second pass completed the meal system. **Video-to-recipe (item 1) is not in
this pass**: a concurrent session was building it in the same working tree, so
that work — `internal/transcriber`, `internal/db/recipe_imports_store.go`,
`internal/modules/recipes/ImportService`, `migrations/00006_recipe_imports.sql`
and the `RecipeImport` half of `meals.graphql` — belongs to them and was
integrated around rather than overwritten.

Two pieces of it are contributed from this side, and are what the import path
resolves its drafts with:

- `domain/meals/import.go` — the `RecipeImport` type, its statuses, and
  `ParseVideoURL`, which decides supported hosts server-side and normalizes a
  link so tracking parameters cannot make one video look like two.
- `domain/meals/resolve.go` — `ResolveAgainstCatalog`, which matches a draft's
  ingredient lines to the catalogue, records what it cannot vouch for, and
  recomputes `BaseMealPlanEligible`. Matching is exact-after-normalization and
  never fuzzy: the catalogue is where allergens come from, and a near-miss that
  resolves "almond milk" to "milk" is a safety failure, not a search-quality
  one.

### New modules

| Module | Owns |
|---|---|
| `mealprofile` | The user's standing questionnaire answers |
| `mealprep` | Batch cooking derived from a plan |
| `grocery/retailer` | The seam between a list and a shop that will sell it |

### New migrations

`00007_meal_profile.sql`, `00008_pantry_ingredients.sql`, `00009_meal_prep.sql`.
All additive; `00006` is the concurrent session's.

`00008` is the one that closes the gap §4.5 identified: `pantry_items` gains
`ingredient_id`, so what a user actually keeps in their cupboard finally reaches
the generator. `name` and the free-text `quantity` are kept and stay
authoritative for display, and `ingredient_id` is nullable — an item the
catalogue cannot resolve stays in the pantry, visible, and simply does not take
part in planning. It is never guessed at.

### AI inside mealgen

The generator now asks a provider two questions, both after safety is settled:

- **Arrangement** (`arranger.go`, `provider/arrange.go`) — which of the
  *already-eligible* recipes go in which slots: variety, ingredient reuse,
  leftovers, what goes together. The model only ever sees the eligible pool, so
  there is nothing unsafe for it to choose; every id it returns is checked back
  against that pool; anything it does not fill is filled deterministically; and
  "no leftovers" is re-checked as the week is built, because that is a property
  of the whole plan a model cannot be trusted to have tracked.
- **Narration** (`narrator.go`) — the sentence explaining a week that is already
  chosen and priced. Unchanged.

With no provider configured — every deployment today — both are no-ops and the
module is entirely deterministic. `TestPlannerIsUnchangedByAnEmptyArrangement`
holds that line.

### A conflict, resolved rather than decided

The brief asked the grocery list to "only output missing grocery items". The
existing product rule is the opposite: pantry items stay on the list at a zero
estimate, "so nothing silently goes missing from a shop".

Both are now served. `GroceryListPayload.sections` is unchanged, and
`purchaseSections` / `purchaseCost` are the same basket with owned items
removed. They are computed from one basket, so they cannot disagree —
`TestPurchaseCostMatchesTheBasketTotal` fixes that. Which one a screen shows is
a presentation decision.

### Still missing before production

- **No Postgres on this machine**, so the two `TEST_DATABASE_URL`-gated suites
  skip. Migrations `00007`–`00009` are written and compile against the stores
  that use them, but **have never been run**. That is the single biggest gap.
- **No retailer implementation.** The seam is real and tested; nothing
  implements `retailer.Handoff`, so `PrepareRetailerCart` reports the feature as
  unconfigured. The mobile `prepareInstacartOrder` still rejects client-side.
- **No AI provider is switched on**, so the arrangement path has never run
  against a real model — only against scripted replies.
- **The pantry UI still writes free text.** `ingredient_id` exists and the
  generator reads it, but nothing populates it yet: the Pantry tab has to offer
  the catalogue picker before the chain actually carries data end to end.
- **Meal prep has no UI.** The API is complete and derivation is tested.
- **`meal_profiles` is not backfilled** from `preferences.weekly_budget`. The
  old TEXT column is untouched and still read by the finance screens; a user's
  budget has to be re-entered once against the new profile.
