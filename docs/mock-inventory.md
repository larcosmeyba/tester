# Mock data and services — what is fake, and what would replace it

Every placeholder in the app, what it stands in for, and whether a real backend
already exists to replace it. A mock is only removed once its replacement is
reachable, so this table is the retirement order.

## Development mocks — deliberate, switched off in production

| File | Stands in for | Real backend? | Status |
| --- | --- | --- | --- |
| `apps/mobile/src/features/meals/mock/mock-meal-plan-service.ts` | `generateMealPlan`, plan reads, swap/move | **Yes** — `internal/modules/mealgen`, `mealplans` | Opt-in only (`EXPO_PUBLIC_USE_MOCK_SERVICES=true`), or under dev-preview sign-in which holds no token |
| `apps/mobile/src/features/meals/mock/mock-recipe-service.ts` | recipe library reads | **Yes** — `internal/modules/recipes` | Same switch |
| `apps/mobile/src/features/meals/mock/seed-data.ts` | the seed recipe library | **Yes** — `cmd/seed-meals` loads the same fixtures into Postgres | Same switch |
| `apps/mobile/src/features/meals/mock/grocery-aggregation.ts` | basket consolidation | **Yes** — `internal/modules/grocery` | Same switch |

These are gated by `useMockServices` in `apps/mobile/src/constants/env.ts` and
are never on in a production build, whatever the environment variables say.

## Placeholder data still wired into live screens

This is the part that matters: these are not behind a switch. The screens below
show invented data to a real user.

| Source | Screens | Real backend? | What is needed |
| --- | --- | --- | --- |
| ~~`data/mock-data.ts` → `initialPantryItems`~~ | ~~`features/pantry/pantry-screens.tsx`~~ | — | **DONE.** The pantry now reads the real backend through `features/pantry/pantry-context.tsx`. `initialPantryItems`, `makePantryItem`, `storageLocations` and the `PantryItem` / `WasteStats` / `StorageLocation` / `ItemStatus` mock types were deleted. |
| `data/mock-data.ts` → `spendingCategories`, `transactions` | `features/budget/budget-screens.tsx` | **No** | A budget backend does not exist. The screens are honest placeholders until one does. |
| `data/mock-data.ts` → `sampleDeals`, `allVideos`, `nearbyResources` | `features/home/home-screen.tsx`, `features/resources/resources-screens.tsx` | **No** | Deals, video and local-resource sources are not built. |
| `data/mock-data.ts` → `mealsByDow`, `benefitPrograms` | legacy references | Superseded | `mealsByDow` is dead demo data; `benefitPrograms` is superseded by `features/benefits/benefits-repository.ts`, which reads the real API. |
| `state/app-state.tsx` → `governmentProfile` | `features/resources/resources-screens.tsx` (`BenefitsQuestionnaireScreen`) | **Yes** — `internal/modules/benefits` | Superseded by `features/benefits/benefits-questionnaire-screen.tsx`, which is already route-wired. See "Duplicates" below. |

## Duplicates pending retirement

Three screens exist twice. The `features/benefits/` versions are newer, talk to
the real backend, and are wired to real routes under `app/resources/`. The
`features/resources/resources-screens.tsx` versions write to local app state and
are reachable only through the `AppRoot` shell.

| Obsolete (shell) | Replacement (route-wired, real backend) |
| --- | --- |
| `GovernmentScreen` | `features/benefits/benefits-programs-screen.tsx` |
| `BenefitsQuestionnaireScreen` | `features/benefits/benefits-questionnaire-screen.tsx` |
| `ProgramApplicationScreen` | `features/benefits/benefits-review-screen.tsx` |

They were **not** deleted in the cleanup pass. Every route file under
`src/app` currently re-exports the `AppRoot` shell, so the shell's own
navigation is what a user actually traverses; removing these three would break
that navigation with nothing to replace it. They go when the routes stop being
re-export shims.

## Server-side placeholders

| Location | Note |
| --- | --- |
| `apps/server/cmd/seed-meals/data/*.json` | Real seed data, not a mock — the product's starter recipe library. Loaded into Postgres by `make seed-meals`. |
| `MEAL_AI_PROVIDER` unset | Not a mock: the meal system is fully deterministic with no AI provider configured. Penny's message is written by the server. |
