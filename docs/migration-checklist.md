# Migration Checklist

Status: `NOT STARTED` · `IN PROGRESS` · `IMPLEMENTED` · `IOS TESTED` · `ANDROID TESTED` · `BLOCKED`

A feature is complete only when it has been checked on **both** platforms, or the
reason it is blocked is written down here.

## Validation available on this machine

| Check | Result |
|---|---|
| `pnpm --filter @helpthehive/mobile typecheck` | ✅ clean |
| `pnpm --filter @helpthehive/mobile lint` | ✅ clean |
| `pnpm --filter @helpthehive/mobile test` | ✅ 78 passing |
| iOS bundle (`expo export --platform ios`) | ✅ builds — 3.9 MB Hermes bytecode |
| Android bundle (`expo export --platform android`) | ✅ builds — 4.2 MB Hermes bytecode |
| iOS simulator run | ✅ **PASSED** — full meal flow walked on iPhone 17 Pro (iOS 27.0) |
| Android emulator run | ⛔ **BLOCKED** — no Android SDK on this machine |

### iOS — verified on device

Built with `expo run:ios` (Build Succeeded, 0 errors) and installed on an
iPhone 17 Pro simulator running iOS 27.0. The following was walked by hand:

1. **Questionnaire** — all 13 sections render. Next stays disabled until a meal
   category is picked. Breakfast + Dinner selected with Lunch and Snacks left
   off, confirming a user need not plan every category. Equipment defaults to
   stovetop/oven/microwave. The "hard limit" toggle appears only once a cooking
   time is chosen. Selecting a diet clears "No specific diet".
2. **Review** — every answer summarised correctly ("4 people", "5 breakfast,
   5 dinner over 5 days", "Gluten Free, Pescatarian", "No budget set").
3. **Generation** — produced a 10-meal plan honouring the gluten-free and
   pescatarian filters.
4. **Plan page** — cost shown as the range **$71–$96**, never a single number.
   Full pricing notice present. Penny's message quotes only computed figures.
5. **Moving a meal** — picked up Day 1 breakfast, switched to Day 2, dropped it
   on dinner. The two meals swapped, and **the cost range stayed $71–$96** — the
   plan was modified, not regenerated, and the basket was not re-priced. This is
   the product's central meal-plan requirement, verified end to end.
6. **Grocery list** — 11 items, grouped by aisle, package rounding visible
   ("3 × 1 bag", "4 × 12 each"), per-item prices, same total, notice repeated.

**Setup note:** CocoaPods was missing and both Homebrew and `gem install` failed
on this machine. See [local-ios-setup.md](local-ios-setup.md) for what was
needed — it is worth fixing properly before another developer sets up.

### Bug found and fixed during this run

Generating a plan navigated to `/(tabs)/meal-plan`, which is still a one-line
re-export of `app-root.tsx`, so an unauthenticated user landed back on the
welcome screen instead of their new plan. Added a real `app/meals/plan.tsx`
route and pointed the post-generation redirect (and "Done shopping") at it.
Caught only by running the app — typecheck, lint and tests were all green.

### Android emulator — blocked

No Android SDK is installed (`adb` and `emulator` are both missing, and
`~/Library/Android/sdk` does not exist). Android Studio, or at minimum the
platform tools and a system image, is needed before an emulator run is possible.

Both bundles compile cleanly for both platforms, so this is a device-run gap,
not a code gap.

## Features

| # | Feature | Status | Notes |
|---|---|---|---|
| 1 | Project foundation | IMPLEMENTED | Working in the existing monorepo. Added zod, jest, `@react-native/jest-preset`. |
| 2 | Design system | IMPLEMENTED | Already present and faithful to the Xcode `Theme.swift`. New screens reuse `hive-ui` rather than adding a parallel component set. |
| 3 | Authentication | PRE-EXISTING | Better Auth (`apps/auth`) + `@better-auth/expo`. Untouched. |
| 4 | Navigation | IOS TESTED | Meal flows are now **real Expo Router routes**. The rest of the app still renders one 3,458-line `app-root.tsx` behind a custom nav stack — see "Known issue" below. |
| 5 | Home | PRE-EXISTING | Its "create this week's meal plan" action now routes to the real questionnaire. |
| 6 | Meal plan core models | IOS TESTED | Standard HTH Recipe Object, `PlanRequest`/`MealPlan`, ingredient catalog, pantry — ported from `HTHMealKit`, with zod validation on every response. |
| 7 | Manual recipe selection | IMPLEMENTED | `/meals/build` → `/meals/assign`. Filters map to the spec's tag taxonomy. |
| 8 | Grocery list | IOS TESTED | `/meals/grocery-list`, aisle-grouped, pantry items at $0, shopping-method choice. |
| 9 | AI Meal Plan Generator | IOS TESTED (frontend) | 13-section questionnaire → generating screen with rotating messages → plan. `POST /plans` is **BACKEND INTEGRATION REQUIRED**; a dev mock implements the same contract. |
| 10 | Social Recipe Import | NOT STARTED | Whole pipeline is server-side. |
| 11 | Pantry | PRE-EXISTING | Real GraphQL backend already exists (`pantryItems`, `addPantryItem`, …). |
| 12 | Penny AI | NOT STARTED | BACKEND INTEGRATION REQUIRED. |
| 13 | Government Assistance | DEFERRED | Per your decision: not integrated until Padraic ships a production-safe authenticated backend. |
| 14 | Application autofill / PDF | DEFERRED | Same. |
| 15 | Local Resources | NOT STARTED | BACKEND INTEGRATION REQUIRED. |
| 16 | Budget | NOT STARTED | BACKEND INTEGRATION REQUIRED. |
| 17 | Profile / Settings | PRE-EXISTING | Real GraphQL backend. |
| 18 | Final parity audit | NOT STARTED | Needs a device run on both platforms first. |

## Removed

- **"Customize meals"** (`BuildPlanScreen`, titled "Customize Meals") — the
  feature the brief said to remove. It was a preference form that changed
  nothing. Gone, along with the hard-coded `MealPlanScreen` that linked to it.
- The hard-coded weekly demo: `mealsByDow`, `weeklyGroceryItems` and the
  `ListScreen`/`MealCard`/`getWeekDates`/`isSameDay` helpers that only existed to
  render it. The meal tab now shows the user's actual plan.

## Known issue: app-root

Every route file except the meal routes is a one-line re-export of
`features/app/app-root.tsx`, a 3,458-line component containing every screen and
its own in-memory navigation stack. Expo Router is effectively unused outside
deep links.

The brief asks for real Expo Router navigation and no business logic in route
files. The meal feature now follows that: thin route files under `app/meals/`,
logic in `features/meals/`. Extracting the remaining screens the same way is the
natural next step and is best done feature by feature rather than in one pass.

## Tests

`pnpm --filter @helpthehive/mobile test` — 78 across 5 suites:

- `move-meal.test.ts` (11) — moving a meal, including that the grocery list and
  cost range come through untouched.
- `grocery-aggregation.test.ts` (15) — duplicate aggregation, package rounding,
  pantry credit, parent matching, missing quantities, aisle order, scaling.
- `allergy-safety.test.ts` (21) — every allergen, combined allergies, diet tags,
  equipment, hard vs. soft time limits, dislikes, incomplete recipes.
- `meal-plan-model.test.ts` (16) — parsing the spec's exact response JSON, budget
  against the range's upper bound, questionnaire serialisation.
- `questionnaire-steps.test.ts` (15) — required vs. optional steps, partial meal
  category selection, household split validation, spec defaults.

Still to write, from the brief's list: authentication state, recipe import
parsing, application state handling, Penny fallback responses. Each depends on a
feature that has not been built yet.
