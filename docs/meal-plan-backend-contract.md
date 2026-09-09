# Meal system — the delivered API contract

**Status: implemented.** This document described a REST contract that was
never built. The meal system now runs on the monorepo's existing GraphQL
server, following the conventions already used for viewer, profile, preferences,
pantry and push tokens.

The schema lives in `packages/api-contract/meals.graphql`. It is the single
source of truth: `gqlgen` generates the Go resolvers from it and
`graphql-codegen` generates the mobile app's types from it, so a change that
breaks one side fails the other's build.

## Queries

| Field | Returns | Notes |
| --- | --- | --- |
| `recipes(query)` | `[Recipe!]!` | Public library plus the viewer's own recipes |
| `recipe(recipeId)` | `Recipe` | `null` when the viewer may not see it |
| `savedRecipes` | `[Recipe!]!` | The viewer's saved recipes |
| `ingredients(search, limit)` | `[Ingredient!]!` | Shared catalogue; holds no user data |
| `currentMealPlan` | `MealPlan` | `null` when the user has no plan yet |
| `mealPlan(planId)` | `MealPlan` | `null` when the viewer may not see it |
| `groceryList(planId)` | `GroceryListPayload` | `null` until the plan is accepted |

## Mutations

| Field | Returns | Notes |
| --- | --- | --- |
| `generateMealPlan(input)` | `MealPlan!` | Archives the previous plan in the same transaction |
| `swapPlannedMeal(planId, input)` | `MealPlan!` | Replaces one slot; `regenerate_week` rebuilds from the stored questionnaire |
| `movePlannedMeal(planId, input)` | `MealPlan!` | Never re-prices and never regenerates |
| `acceptMealPlan(planId)` | `GroceryListPayload!` | Saves the consolidated list; existing ticks are preserved |
| `deleteMealPlan(planId)` | `Boolean!` | |
| `setGroceryItemChecked(planId, ingredientId, checked)` | `Boolean!` | `false` when there was nothing to tick |
| `groceryListFromRecipes(input)` | `GroceryListPayload!` | Choose My Recipes; saves nothing |
| `saveRecipe(recipeId)` / `unsaveRecipe(recipeId)` | `Boolean!` | |

## Ownership

No meal field accepts a user id. The viewer is resolved from the verified JWT on
every call, and every SQL statement puts that user id in its predicate.

Anything the viewer may not see is reported as `NOT_FOUND`, never `FORBIDDEN`:
telling somebody that a plan exists but is not theirs is itself a disclosure.

## Costs

An estimated cost is always a range with a confidence — `point`, `low`, `high`,
`confidence` — never a bare number. Budget compliance is checked against `high`,
so a plan is only "within budget" when its worst case is.

`tierMix` reports how much of the basket's value came from each price tier, so
the range's width can be explained rather than taken on trust.

## Missing information

A recipe line with no stated quantity keeps `quantity: null` and carries a
`missingInformation` note. Nothing invents the number. Recipes with missing
information stay viewable but are never planned automatically
(`baseMealPlanEligible` is false).

## Still outstanding

- **Instacart handoff.** `groceryService.prepareInstacartOrder` still rejects
  with `BACKEND INTEGRATION REQUIRED`. It needs the partner credentials, which
  belong on the server, and no endpoint exists yet.
- **Recipe import** (video and URL). The data model supports it —
  `sourceType` covers `video_import` and `url_import` — but no import path is
  built.
