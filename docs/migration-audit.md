# Help The Hive — Migration Audit (corrected after reading all four archives)

**Date:** 2026-09-04
**Rule observed:** Padraic's backend was read only. Nothing in it was modified.

---

## ⚠️ Headline finding: a React Native monorepo already exists

The archive named **"Help The Hive App Folder (Redesign)"** is not design assets. It
contains `helpthehive-main.zip`, which is a **working pnpm monorepo** — last modified
**26 Aug 2026** — that already implements most of what this brief asks me to build:

```
helpthehive-main/
  apps/
    auth/               Better Auth server (TypeScript) + migrations
    mobile/             Expo + React Native + TypeScript + Expo Router
                        — native ios/ and android/ projects already generated
                        — EAS build config
    server/             Go + gqlgen GraphQL server, sqlc, migrations, docker-compose
  packages/
    api-contract/       schema.graphql + generated TypeScript types
    config/
  infra/terraform/      Google Cloud deployment
  Dockerfile.auth, Dockerfile.server, cloudbuild.*.yaml
```

`apps/mobile` already has **49 routes** covering nearly the whole navigation map:

```
(auth)/       welcome · login · signup · verify-code · forgot-password
(onboarding)/ budget · connect-ebt · finance-topics · resources · benefits ·
              profile-photo · permissions
(tabs)/       home · meal-plan · penny · resources · finance
meals/        build · questionnaire · grocery-list · shop-own · deals · recipe/[recipeId]
pantry/       index · add · scan
resources/    search · government · benefits-questionnaire ·
              applications/[programId] · [resourceId]
finance/      transactions · spending-report · connect-account
account/      index · edit-profile · settings · notifications · budget · feedback
videos/       index · [videoId]
auth/         reset-password · verified
```

Roughly **7,500 lines** of TypeScript across `features/`, `components/`, `state/`,
`data/`, `graphql/`, `auth/`.

**The brief says "Do NOT create two separate applications." Building a second Expo app
would do exactly that.** I stopped and am asking before going further — see §7.

---

## 1. What each archive actually is

| Archive | What it really contains |
|---|---|
| `help-the-hive-meal-system.zip` | Product specs 01–04 + `HTHMealKit` Swift package (models, engines, seed data). **The meal domain's source of truth.** |
| `Help The Hive XCode .zip` | The SwiftUI app — 49 Swift files, ~14,800 lines. **UI reference and design system.** |
| `help-the-hive-MASTER.zip` | Padraic's **Government Benefits Engine** — a Go prototype. Not the app backend. |
| `Help The Hive App Folder (Redesign) .zip` | **The existing React Native monorepo** described above. |

---

## 2. What "Padraic's backend" actually is — and what it is not

`help-the-hive-MASTER/help-the-hive/backend` is the **Benefits Engine**: a Go service
covering SNAP, Medicaid, CHIP, WIC, TANF and LIHEAP. Its own README is unambiguous:

- "This is **not** the Help The Hive app. It is the engine underneath **one part** of it."
- "The eligibility rules in this repository are `PROTOTYPE_RULE` placeholders… None of it reflects current government policy."
- "This engine **does not submit applications**."
- "**Do not deploy this.** No authentication, no encryption, no audit logging."

### Its real endpoints (read from `internal/api/api.go`)

```
GET  /healthz                                              GET  /version
GET  /benefits/programs
GET  /benefits/programs/{state}
GET  /benefits/programs/{state}/{program}/requirements
POST /benefits/screen
POST /benefits/applications
GET  /benefits/applications/{id}
GET  /benefits/applications/{id}/questions
GET  /benefits/applications/{id}/missing
POST /benefits/applications/{id}/answers
GET  /benefits/applications/{id}/mapping
GET  /benefits/applications/{id}/documents
GET  /benefits/applications/{id}/validate
POST /benefits/applications/{id}/prepare
GET  /benefits/applications/{id}/review              (text/plain, printable)
GET  /benefits/applications/{id}/submission-method
GET  /benefits/applications/{id}/questions/{qid}/explain
GET  /benefits/households        GET /benefits/households/{id}
GET  /benefits/sources           GET /ai/tools        GET /ai/contract
```

Error shape is uniform: `{ "error": "not_found" | "not_configured" | "invalid_input" | "internal_error", "message": "..." }`.

### The separate GraphQL server (in the monorepo)

`apps/server` is a **different** backend — Go + gqlgen. Its entire schema today:

```graphql
type Query {
  viewer: Viewer!
  handleAvailability(handle: String!): HandleAvailability!
  pantryItems(filter: PantryItemFilterInput): [PantryItem!]!
  pantryWasteStats: WasteStats!
}
type Mutation {
  deleteViewerData: Boolean!
  updateProfile(input: UpdateProfileInput!): Profile!
  updateHandle(handle: String!): Profile!
  updatePreferences(input: UpdatePreferencesInput!): AppPreferences!
  completeOnboarding(input: CompleteOnboardingInput!): Viewer!
  addPantryItem(input: AddPantryItemInput!): PantryItem!
  updatePantryItem(id: ID!, input: UpdatePantryItemInput!): PantryItem!
  markPantryItemUsed(id: ID!): PantryItem!
  deletePantryItem(id: ID!): Boolean!
  registerPushToken(input: RegisterPushTokenInput!): PushToken!
  deletePushToken(token: String!): Boolean!
}
```

**So the backend that exists today covers: auth (Better Auth), user/profile,
preferences, onboarding, pantry, and push tokens. That is all.**

There is **no** backend for meal plans, recipes, recipe import, grocery lists, Penny,
resources, or budget/finance. Every one of those is `BACKEND INTEGRATION REQUIRED`.

---

## 3. The existing Xcode app is a mock-driven prototype

`Services.swift` declares protocols (`MealPlanServiceProtocol`,
`RecipeImportServiceProtocol`, `PennyAIServiceProtocol`, …) and `MockServices.swift`
implements them behind `#if DEBUG`, with a comment that reads: *"Do NOT ship mock
responses in production."*

Verified by reading the source:

- **Meal plan generation** — mocked. `MockMealPlanService` sleeps 3.5s and returns
  hard-coded meals with `Double.random(in: 60...150)` as the cost.
- **Recipes, recipe import, grocery pricing, Penny** — all mocked.
- **Auth** — there is *no auth server*. `AuthService.swift` does native Apple/Google
  sign-in and stores the result in the Keychain. `UserDefaults` caches the Apple email.
- **Feedback** — posts to a **Formspree** endpoint (`formspree.io/f/xpwlkqno`), with one
  placeholder still reading `formspree.io/f/YOUR`.
- **Real outbound links** — `211la.org`, `benefitscal.com`, `burtac.org`,
  `helpthehive.com/terms`, `/privacy`.
- **A Penny paywall exists** (`PennyPaywallView.swift`, 365 lines). Monetization is not
  mentioned anywhere in the migration brief — flagging it as an open question.

**Secrets scan: clean.** No API keys, tokens, or credentials are hard-coded in the Swift
sources. Auth tokens use the Keychain.

---

## 4. Design system — extracted and applied

From `Theme.swift`, now encoded in `constants/theme.ts`:

| Token | Value |
|---|---|
| `hiveGreen` | `#1B5E20` |
| `hiveGreenMid` | `#2E8B3A` (top of the primary button gradient) |
| `hiveGreenLight` | `#EBF7EB` |
| `hiveYellow` | `#FFC220` |
| `hiveBlue` | `#2970EB` |
| `hiveBorder` | `#EDEDED` |
| `hiveCardBg` | `#F4F5F6` |
| `hiveTextPrimary` | `#20242A` |
| `hiveTextSecondary` | `#555A64` |
| Button | 56pt tall, 14pt radius, 17pt semibold, vertical green gradient |
| Text field | 52pt tall, 12pt radius, 1.5pt border that turns green when filled, green check |
| Card / row | 14pt radius, 1.5pt border, green when selected |
| OTP box | 48 × 58, 10pt radius, 2pt border, 22pt semibold |
| Step bar | 6pt tall, 3pt radius |

Reusable components already exist in the Xcode app and were mirrored one-for-one:
`PrimaryButton`, `SecondaryButton`, `AppTextField`, `OrDivider`, `GoogleSignInButton`,
`AppleSignInButton`, `StepProgressBar`, `SelectionRow`, `CheckboxRow`, `OTPInputView`,
`PermissionScreenView`.

---

## 5. Source-of-truth conflicts

| # | Conflict | Resolution |
|---|---|---|
| C1 | Brief says "REMOVE Customized Meals". No screen by that name exists in the Xcode app or the nav map. | Nothing to remove. `BuildMealPlanView` / `meals/build` is the Choose-My-Recipes browser and stays. **Confirm this is what you meant.** |
| C2 | Brief's question types (`YES_NO`, `HOUSEHOLD_MEMBER`, `INCOME`, `EMPLOYMENT`, `DOCUMENT_ACKNOWLEDGEMENT`) vs. the backend's actual `FieldType` enum. | **Backend wins** — it is a live contract. Mapping: `YES_NO`→`BOOLEAN`, `DOCUMENT_ACKNOWLEDGEMENT`→`ATTESTATION`, `HOUSEHOLD_MEMBER`→ not a type but `repeat_for: HOUSEHOLD_MEMBER`, `INCOME`/`EMPLOYMENT`→ canonical field groups, not types. The backend also has `LONG_TEXT`, `SSN`, `PHONE`, `EMAIL`, `SIGNATURE` which the brief omits. |
| C3 | Brief describes building a schema-driven questionnaire engine. **It already exists** in Padraic's Go backend, with three-valued conditional logic (`ALL`/`ANY` over a closed comparison vocabulary, modelled on HL7 FHIR `enableWhen`). | Do not rebuild it. The client renders `questions.Resolved` and its four states: `ANSWERED`, `MISSING`, `NOT_APPLICABLE`, `BLOCKED`. `BLOCKED` matters — "we have not asked whether you are pregnant" is not "you are not pregnant". |
| C4 | `HTHMealKit`'s `ClaudeAPIClient` calls Anthropic **directly from the app**. Brief forbids any LLM key in the client. | Brief wins (the kit's own README agrees). No LLM client ships in React Native. |
| C5 | Meal spec defines REST (`POST /plans`); the monorepo server is **GraphQL**. | Unresolved — needs your call. See §7. |
| C6 | Meal engine runs on-device in Swift; brief's architecture puts it behind the backend. | Backend. A clearly separated dev mock implements the same contract locally. |
| C7 | Nav map lists 10 design gaps (missing Google button on Login, no set-new-password screen, radio-vs-checkbox, duplicate Deals screen, step numbering, `$50→$75` budget gap, copy typo…). | All fixed in what I built; each is annotated in the source. |
| C8 | Brief never mentions monetization. `PennyPaywallView.swift` exists. | Open question. |

---

## 6. Migration matrix

Backend column reflects what actually exists today.

| Xcode screen | React Native route | Backend | Status |
|---|---|---|---|
| WelcomeView | `(auth)/welcome` | — | exists in monorepo |
| LoginView | `(auth)/login` | Better Auth | exists in monorepo |
| SignUpView | `(auth)/signup` | Better Auth | exists in monorepo |
| VerifyNumberView | `(auth)/verify-code` | Better Auth | exists in monorepo |
| ForgotPasswordView | `(auth)/forgot-password` | Better Auth | exists in monorepo |
| OnboardingFlowView | `(onboarding)/*` | `completeOnboarding` mutation | exists in monorepo |
| HomeView | `(tabs)/home` | `viewer` query | exists in monorepo |
| MealPlanTabView | `(tabs)/meal-plan` | **none** | BACKEND INTEGRATION REQUIRED |
| MealPlanQuestionnaireView | `meals/questionnaire` | **none** | BACKEND INTEGRATION REQUIRED |
| MealPlanGeneratingView | (part of questionnaire) | **none** | BACKEND INTEGRATION REQUIRED |
| BuildMealPlanView / WeeklyMealBuilderView | `meals/build` | **none** | BACKEND INTEGRATION REQUIRED |
| MealGeneratorSourceView | `meals/build` (source picker) | **none** | BACKEND INTEGRATION REQUIRED |
| GroceryListView | `meals/grocery-list` | **none** | BACKEND INTEGRATION REQUIRED |
| ShopOnYourOwnView | `meals/shop-own` | local PDF/print | client-only |
| RecipeVideoView | `meals/recipe/[recipeId]` | **none** | BACKEND INTEGRATION REQUIRED |
| MyPantryView | `pantry/index` | `pantryItems`, `addPantryItem`, … | **real backend exists** |
| AddPantryItemView | `pantry/add` | `addPantryItem` | **real backend exists** |
| ScanPantryView | `pantry/scan` | **none** | BACKEND INTEGRATION REQUIRED |
| HiveAIView | `(tabs)/penny` | **none** | BACKEND INTEGRATION REQUIRED |
| PennyPaywallView | — | **none** | open question (§5 C8) |
| GovernmentAssistanceView | `resources/government` | Benefits Engine `/benefits/programs/{state}` | prototype only |
| BenefitsQuestionnaireView | `resources/benefits-questionnaire` | `/benefits/applications/{id}/questions` | prototype only |
| ApplicationReviewView | `resources/applications/[programId]` | `/benefits/applications/{id}/review` + `/prepare` | prototype only |
| ResourcesTabView | `(tabs)/resources` | **none** | BACKEND INTEGRATION REQUIRED |
| EducationHubView / VideoDetailView | `videos/*` | **none** | BACKEND INTEGRATION REQUIRED |
| FinanceTabView | `(tabs)/finance` | **none** | BACKEND INTEGRATION REQUIRED |
| SpendingReportView | `finance/spending-report` | **none** | BACKEND INTEGRATION REQUIRED |
| ConnectAccountView | `finance/connect-account` | **none** | BACKEND INTEGRATION REQUIRED |
| AccountSettingsView | `account/*` | `updateProfile`, `updatePreferences` | **real backend exists** |
| SendFeedbackView | `account/feedback` | Formspree (third-party) | works, but off-platform |

---

## 7. The decision I need from you

I have **stopped building** rather than create a second app.

**Recommendation: continue inside the existing monorepo** (`apps/mobile`), and port into
it the specific things I built that it does not have — the meal-plan domain models,
the grocery aggregation engine, the meal-move logic, and the 63 tests. That honours
"one shared mobile codebase" and does not throw away a working iOS/Android build,
Better Auth integration, or the generated GraphQL contract.

Questions I cannot answer from the archives:

1. **Is `helpthehive-main` the live repository?** If it is on GitHub, I should work from
   a clone rather than this zip.
2. **REST or GraphQL for the meal system?** The meal spec defines `POST /plans`; the
   server is GraphQL-only today. Adding meal endpoints is backend work either way, and
   you said the backend is read-only without your authorization.
3. **Should the Benefits Engine be merged into `apps/server`, or run as its own
   service?** It is a standalone Go module today with no auth.
4. **Is the Penny paywall in scope?**
5. **"Customized Meals"** — which screen did you mean? Nothing carries that name.

---

## 8. What I built before finding the monorepo

At `~/help-the-hive-mobile`. Typechecks clean, 63 tests pass. Worth porting:

- `types/` — the Standard HTH Recipe Object, `PlanRequest`/`MealPlan`, ingredient
  catalog, pantry — ported from `HTHMealKit` with zod runtime validation on every
  backend response.
- `features/meals/moveMeal.ts` — moving a meal without regenerating the plan.
- `services/mock/groceryAggregation.ts` — consolidation, package rounding, pantry
  credit, aisle grouping, household scaling, cost ranges.
- `constants/theme.ts` — the design system extracted from `Theme.swift`.
- 63 tests: meal movement (11), grocery aggregation (15), allergy/diet safety (21),
  plan-response parsing (16).
