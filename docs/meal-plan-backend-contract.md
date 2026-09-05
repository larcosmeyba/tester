# Meal Plan — backend contract needed

**Status: BACKEND INTEGRATION REQUIRED.**

`apps/server`'s GraphQL schema covers viewer, profile, preferences, onboarding,
pantry and push tokens. It has no meal-plan, recipe, grocery or recipe-import
surface. The mobile app's meal feature is built against the interfaces below and
runs on a development mock (`src/features/meals/mock/`) until they exist.

The contract is the one the product specification defines (Doc 03 §14, Doc 04),
not something invented here.

## What the client already does

- Collects the full 13-section questionnaire into a `PlanRequest`.
- Serialises it to the exact snake_case body in Doc 04 (`toPlanRequestPayload`).
- Validates every response with zod at the service boundary, so a shape change
  fails loudly instead of rendering as `undefined`.
- Renders the plan, moves meals between slots, and builds the grocery list.

## Endpoints

```
POST /plans                       body: questionnaire JSON (Doc 04)   → plan JSON (Doc 03 §11)
GET  /plans/current                                                   → plan JSON | 404
GET  /plans/{plan_id}                                                 → plan JSON
POST /plans/{plan_id}/swap        body: {slot, action, keep_basket}   → plan JSON
POST /plans/{plan_id}/accept                                          → grocery list
POST /grocery-lists/from-recipes  body: {recipe_ids[], household_size, pantry_items[]}
GET  /recipes?tags=diet.vegan,time.30_min&meal=dinner                 → recipe[]
GET  /recipes/{recipe_id}                                             → recipe
```

`swap` actions: `swap_slot | cheaper | higher_protein | faster | dislike | regenerate_week`.

### Moving a meal

The client calls `swap` with `action: "swap_slot"` plus a `target_slot`, and
`keep_basket: true`. A move reassigns slots only — the same recipes are still
being bought, so the grocery list, cost range and headroom must come back
unchanged. **A move must never regenerate the week.**

```json
POST /plans/{plan_id}/swap
{
  "slot":        { "day": 2, "meal_type": "dinner" },
  "target_slot": { "day": 3, "meal_type": "dinner" },
  "action": "swap_slot",
  "keep_basket": true
}
```

## Rules the server owns

These are enforced in the engine, not in the client. The app renders what it is
told; it must never be the thing that decides any of them.

1. **Allergies and diets are computed from ingredient-catalog flags.** Never from
   text matching, never by an LLM. A recipe containing a declared allergen must
   not appear in a plan.
2. **Missing data stays missing.** A quantity, serving count or time the source
   never stated is `null` with a `missing_information` note. Such recipes stay
   viewable but must have `base_meal_plan_eligible: false`.
3. **Costs are ranges.** Every price is `{point, low, high, confidence}`. Budget
   compliance is judged against `high`, never `point`.
4. **One recipe model** for library, AI-generated, imported and hand-entered
   recipes. `source_type` is a field, not a second schema.
5. **Imported and AI recipes are private drafts.** Only library recipes are public.
6. **AI returns text only.** `penny_message` and each meal's `why` are written
   from the computed plan. The model must never originate a price, a calorie or
   a gram.

## Still to specify with you

- **Recipe import** (`/recipes/import`, transcript fallback, status polling).
  The pipeline — URL validation, transcript retrieval, transcription, extraction,
  validation — is entirely server-side.
- **Penny** (`/penny/conversations`, `/penny/messages`). No LLM provider is
  reachable from the app, by design.
- **Instacart handoff** (`POST /grocery-lists/{id}/instacart`). Partner
  credentials stay on the server.
- **Saving a "shop on my own" list** so it survives a reinstall.
