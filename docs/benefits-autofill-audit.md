# Government Benefits PDF Autofill — audit and plan

Audit of the Help The Hive codebase as it stands, and the design proposed for
the questionnaire → profile → mapping → official PDF → autofill → validation →
review → completed PDF flow.

Written before any implementation. Section 8 lists the decisions that need an
answer before code lands.

---

## 1. What already exists

### Benefits / applications — almost nothing is built

| Thing | Where | State |
|---|---|---|
| `GovernmentProfile` type | `apps/mobile/src/state/app-state.tsx:39` | 10 loose fields, all `string`. Client-only. |
| Benefits questionnaire screen | `apps/mobile/src/features/app/app-root.tsx:1930` | 8 free-text inputs. Saves to AsyncStorage. |
| Government assistance list | `app-root.tsx:1896` | Renders `benefitPrograms` from mock data. |
| Program application screen | `app-root.tsx:1974` | Shows a checklist and three profile lines. "Review Draft Application" calls `nav.back()`. |
| `BenefitProgram` type | `apps/mobile/src/data/mock-data.ts:85` | `id, name, agency, description, estimate, requirements[]` — hardcoded copy. |
| Routes | `apps/mobile/src/app/resources/*.tsx` | All five are one-line re-exports of `planned-route` → `app-root`. |
| Server | — | **Nothing.** No table, no resolver, no module, no PDF code anywhere in the repo. |

The benefits feature today is a local-only form that writes to `AsyncStorage`
and a screen that displays three of its values. `governmentProfile` is never
sent to the server, and `preferences.wantsGovAssistance` is the only
benefits-related bit that is persisted server-side.

### The platform it has to fit into

| Concern | How the repo does it |
|---|---|
| Backend | **Go**, `apps/server`, `go 1.27` |
| API | GraphQL via `gqlgen`, schema in `packages/api-contract/*.graphql` is the single source of truth for both sides |
| Repository layer | Hand-written `pgx` in `internal/db`, one file per domain. No SQL codegen (sqlc was removed). |
| Layering | `internal/domain/*` = pure types and rules; `internal/modules/*` = orchestration; `internal/db` = every SQL statement |
| Migrations | `goose`, `apps/server/migrations/0000N_*.sql`, up and down |
| Auth | JWT verified by `internal/auth`; `auth.Identity` from context. **No resolver ever accepts a user id.** |
| Ownership errors | Anything the viewer may not see is `NOT_FOUND`, never `FORBIDDEN` (`internal/graphql/meals_errors.go`) |
| AI | `internal/modules/mealgen/provider` — a `Provider` interface behind env config, disabled by default, output always validated |
| Mobile | Expo SDK 57 / RN 0.86, typed GraphQL documents in `src/graphql`, feature repositories in `src/features/*` |

### Two facts that shape the plan

1. **The backend is Go, not Node.** `pdf-lib` is a JavaScript library and cannot
   be used from `apps/server`. Section 8 covers the choice this forces.
2. **A large meals refactor is in flight in this working tree** (`meals` →
   `domain/meals` + `modules/{catalog,grocery,mealgen,mealplans,recipes,nutrition}`,
   and sqlc → hand-written pgx). `./internal/...` builds clean; `cmd/seed-meals`
   is still mid-refactor. Benefits work must be strictly additive and must not
   touch a meals file — but `gqlgen generate` loads the resolver package, so
   schema codegen rides on that refactor staying green.

---

## 2. What can be reused

**Reused as-is**

- `internal/auth` — identity, middleware, the "never take a user id from the client" rule.
- `internal/db` conventions — `Store`, `NewID()`, `IsNotFound`, `FormatDate`, transaction helpers.
- `internal/modules/users.Service.Viewer` — the one way a request becomes a user id.
- The gqlgen + graphql-codegen contract pipeline, so a schema change breaks both sides' builds.
- `mealError`'s NOT_FOUND-not-FORBIDDEN policy, generalised into a shared helper.
- `internal/modules/mealgen/provider.Provider` — the AI seam. Benefits gets its own
  config keys but the same interface and the same "disabled by default" default.
- `deleteViewerData` — extended to cascade, not replaced.

**Reused as a pattern, not as code**

- `internal/domain/meals` value-confidence modelling (`source | human | inferred | missing`)
  is exactly the discipline benefits needs, and is the direct ancestor of the
  `AnswerStatus` design in section 3.
- The meal system's "missing information is reported, never guessed" rule.
- The migration file's commenting style.

**Replaced**

- `GovernmentProfile` in `app-state.tsx` — becomes a thin client mirror of the
  server profile, fetched over GraphQL. The AsyncStorage copy goes away; benefits
  answers are PII and belong on the server.
- `BenefitProgram` mock data — becomes a server-side form registry.

**Not reusable**

- Nothing in the repo touches PDFs. The whole engine is new.

---

## 3. Proposed Benefits Profile schema

### The one modelling rule everything follows

"Never invent missing answers" is only enforceable if the data model can tell
these three apart:

- the user answered, and the value is *X*
- the user answered, and the answer is *none / not applicable*
- the user has not been asked, or skipped

`$0` of income is not the same as "income unknown", and a blank checkbox is not
the same as "no". So every answer carries a status:

```go
type AnswerStatus string

const (
    AnswerUnknown  AnswerStatus = "unknown"   // never asked, or skipped
    AnswerProvided AnswerStatus = "provided"  // a real value
    AnswerNone     AnswerStatus = "none"      // explicitly "I have none of these"
    AnswerRefused  AnswerStatus = "refused"   // asked, declined to say
)
```

`unknown` and `refused` never reach a PDF. `none` does — it is an answer.

### Field paths

Mapping files never reference SQL columns. They reference a versioned dotted
vocabulary, so the database can change behind it. The profile aggregate is
flattened to `map[FieldPath]Value` for resolution.

```
applicant.first_name | .middle_name | .last_name | .suffix
applicant.date_of_birth | .sex | .marital_status | .ssn
applicant.is_us_citizen | .immigration_status | .is_veteran
applicant.preferred_language | .is_pregnant | .has_disability | .is_student

contact.email | .phone_primary | .phone_primary_type | .phone_secondary
contact.preferred_contact_method | .ok_to_text
contact.needs_interpreter | .interpreter_language

address.residential.street1 | .street2 | .city | .state | .postal_code | .county
address.residential.is_homeless
address.mailing.same_as_residential | .street1 | .street2 | .city | .state | .postal_code

household.size
household.members[].first_name | .last_name | .date_of_birth | .relationship
household.members[].ssn | .sex | .is_us_citizen | .immigration_status
household.members[].is_applying | .buys_and_prepares_food_together
household.members[].is_student | .has_disability | .is_pregnant

employment.status
employment.jobs[].member_ref | .employer_name | .employer_phone | .job_title
employment.jobs[].start_date | .end_date | .hours_per_week | .pay_rate | .pay_frequency
employment.is_self_employed | .self_employment_monthly_net

income.has_no_income
income.sources[].member_ref | .kind | .payer | .gross_amount | .frequency
income.sources[].start_date | .is_ongoing

housing.status                    # rent | own | shared | shelter | homeless | no_cost
housing.rent_monthly | .mortgage_monthly | .property_tax_monthly | .home_insurance_monthly
housing.is_subsidized | .landlord_name | .landlord_phone

utilities.pays_heating_cooling | .pays_electricity | .pays_gas
utilities.pays_water_sewer | .pays_trash | .pays_phone
utilities.monthly_total | .received_liheap_last_12mo

expenses.childcare[].member_ref | .provider_name | .monthly_amount | .reason
expenses.medical[].member_ref | .kind | .monthly_amount
expenses.child_support_paid_monthly

resources.has_bank_accounts
resources.accounts[].institution | .kind | .balance
resources.vehicles[].year | .make | .model | .estimated_value | .is_primary

benefits.currently_receiving[]    # snap | medicaid | tanf | wic | ssi | ssdi | liheap | section8 | ui
benefits.snap_case_number | .medicaid_case_number | .has_applied_before
program.expedited_service_requested
program.authorized_representative.name | .phone | .relationship
```

Derived paths (`income.monthly_gross_total`, `household.size_computed`,
`expenses.medical_monthly_total`) are computed at resolve time from provided
answers only, and are `unknown` if any input is `unknown`. They are never stored.

### Tables

```
benefits_profiles              one row per user; scalar core, nullable = unknown,
                               plus an explicit *_status column where "none" is
                               a meaningful distinct answer
benefits_profile_answer_meta   (user_id, field_path, status, source, updated_at)
                               — the status/provenance sidecar so every path,
                               including the typed columns, carries provenance
benefits_household_members     ordered repeating group
benefits_income_sources        repeating group
benefits_employment            repeating group
benefits_expenses              repeating group, kind ∈ (childcare, medical, child_support, other)
benefits_resources             repeating group, kind ∈ (account, vehicle, other)

benefits_applications          one autofill run: user, form_id, form_version,
                               status ∈ (draft, needs_input, ready_for_review,
                               approved, superseded), profile_snapshot_id
benefits_application_fields    per mapping field outcome — audit trail of exactly
                               what was written where and from which field path
benefits_documents             generated artifacts: uri, sha256, byte_size,
                               is_flattened, created_at, purge_after
```

`benefits_applications` snapshots the profile it filled from. A completed PDF
must stay explainable after the profile changes.

---

## 4. PDF mapping structure

One versioned JSON file per state/program/form revision, checked in under
`apps/server/forms/<country>/<state>/<program>/<formcode>/<version>/`, with the
blank official PDF beside it and pinned by SHA-256.

```json
{
  "schemaVersion": 1,
  "id": "us-ca-snap-cf285",
  "jurisdiction": { "country": "US", "state": "CA" },
  "program": "SNAP",
  "formCode": "CF 285",
  "formTitle": "Application for CalFresh Benefits",
  "formVersion": "2024.07",
  "revision": 3,
  "status": "active",
  "vocabularyVersion": 1,

  "template": {
    "kind": "acroform",
    "file": "template.pdf",
    "sha256": "9f2c…",
    "pageCount": 8
  },

  "requirements": [
    { "fieldPath": "applicant.last_name",  "strength": "required" },
    { "fieldPath": "address.residential.street1", "strength": "required",
      "unless": { "fieldPath": "address.residential.is_homeless", "equals": true } },
    { "fieldPath": "income.sources", "strength": "required",
      "unless": { "fieldPath": "income.has_no_income", "equals": true } }
  ],

  "fields": [
    { "id": "applicant_last",
      "target": { "type": "text", "name": "form1[0].P1[0].LastName[0]" },
      "source": { "fieldPath": "applicant.last_name" },
      "transforms": [ { "op": "upper" }, { "op": "truncate", "max": 30 } ],
      "strength": "required" },

    { "id": "applicant_dob",
      "target": { "type": "text", "name": "form1[0].P1[0].DOB[0]" },
      "source": { "fieldPath": "applicant.date_of_birth" },
      "transforms": [ { "op": "date", "layout": "01/02/2006" } ] },

    { "id": "citizen",
      "target": { "type": "radio", "name": "form1[0].P2[0].Citizen[0]" },
      "source": { "fieldPath": "applicant.is_us_citizen" },
      "valueMap": { "true": "Yes", "false": "No" } },

    { "id": "pays_heat",
      "target": { "type": "checkbox", "name": "form1[0].P4[0].Heat[0]" },
      "source": { "fieldPath": "utilities.pays_heating_cooling" } },

    { "id": "res_state",
      "target": { "type": "dropdown", "name": "form1[0].P1[0].State[0]" },
      "source": { "fieldPath": "address.residential.state" } },

    { "id": "hh_1_name",
      "repeat": { "over": "household.members", "index": 0 },
      "target": { "type": "text", "name": "form1[0].P3[0].HH1Name[0]" },
      "source": { "fieldPath": "household.members[].last_name" },
      "transforms": [ { "op": "join", "with": "household.members[].first_name", "sep": ", " } ] },

    { "id": "signature_date",
      "target": { "type": "text", "name": "form1[0].P8[0].SigDate[0]" },
      "fillPolicy": "never",
      "note": "Signed and dated by the applicant, not by Help The Hive." }
  ]
}
```

For a **flat / non-fillable** PDF, `template.kind` is `"flat"` and `target`
carries geometry instead of a field name. Coordinates are PDF user-space
points with a **bottom-left page origin** — the single most common source of
mapping bugs, so it is stated in the schema and asserted by the loader:

```json
{ "id": "applicant_last",
  "target": { "type": "text", "page": 1,
              "rect": { "x": 72, "y": 648, "w": 220, "h": 12 },
              "font": { "name": "Helvetica", "size": 10 },
              "align": "left", "shrinkToFit": true },
  "source": { "fieldPath": "applicant.last_name" } }
```

```json
{ "id": "pays_heat",
  "target": { "type": "checkmark", "page": 4,
              "rect": { "x": 118, "y": 402, "w": 10, "h": 10 }, "glyph": "X" },
  "source": { "fieldPath": "utilities.pays_heating_cooling" } }
```

### Transforms — a closed, deterministic set

`trim`, `upper`, `lower`, `title`, `truncate(max)`, `date(layout)`,
`money(style)`, `digits`, `phone(style)`, `ssn(style: full|last4|masked)`,
`join(with, sep)`, `split(sep, index)`, `boolYesNo(yes,no)`, `pad(len, char)`.

There is deliberately **no `default` transform**. A default is an invented
answer. A mapping may carry a `constant` — but a constant is authored by a
human in a reviewed, version-controlled file, and the audit trail records it as
`source: mapping_constant` rather than as the user's answer.

### Versioning

`(id, formVersion, revision)` is the identity. Mappings are append-only:
a government form revision gets a new directory, never an edit in place. An
application row stores the exact `form_id` + `form_version` + `revision` it was
filled from, so a completed PDF can always be reproduced.

### Loader validation (at server start, and in CI)

- template SHA-256 matches
- every `source.fieldPath` exists in the vocabulary at `vocabularyVersion`
- every `target.name` exists in the actual PDF, with the type the mapping claims
- every `valueMap` / dropdown value is in the PDF field's own `/Opt` list
- flat targets fall inside their page's MediaBox
- no duplicate `target` writes

A mapping that fails any of these is a start-up error, not a runtime surprise —
the same policy `generator.New` already uses for a misconfigured AI provider.

---

## 5. Database / API changes

### Migration

One new `goose` migration, `00006_benefits.sql`, with the tables in section 3
and a matching `Down`. No existing table is altered except by `ON DELETE
CASCADE` from `users(id)`, which every new table uses.

### GraphQL — `packages/api-contract/benefits.graphql`

```graphql
extend type Query {
  benefitsProfile: BenefitsProfile!
  benefitsForms(state: String, program: BenefitsProgram): [BenefitsForm!]!
  benefitsForm(formId: ID!): BenefitsForm
  benefitsApplication(applicationId: ID!): BenefitsApplication
  benefitsApplications: [BenefitsApplication!]!
}

extend type Mutation {
  updateBenefitsProfile(input: UpdateBenefitsProfileInput!): BenefitsProfile!
  upsertHouseholdMember(input: HouseholdMemberInput!): BenefitsProfile!
  removeHouseholdMember(memberId: ID!): BenefitsProfile!
  upsertIncomeSource(input: IncomeSourceInput!): BenefitsProfile!
  removeIncomeSource(sourceId: ID!): BenefitsProfile!
  upsertBenefitsExpense(input: BenefitsExpenseInput!): BenefitsProfile!
  removeBenefitsExpense(expenseId: ID!): BenefitsProfile!

  startBenefitsApplication(formId: ID!): BenefitsApplication!
  answerBenefitsQuestions(applicationId: ID!, answers: [BenefitsAnswerInput!]!): BenefitsApplication!
  refillBenefitsApplication(applicationId: ID!): BenefitsApplication!
  approveBenefitsApplication(applicationId: ID!): BenefitsApplication!
  deleteBenefitsApplication(applicationId: ID!): Boolean!
}
```

`BenefitsApplication` carries the review payload:

```graphql
type BenefitsApplication {
  id: ID!
  form: BenefitsForm!
  status: BenefitsApplicationStatus!   # DRAFT NEEDS_INPUT READY_FOR_REVIEW APPROVED SUPERSEDED
  filledFields: [FilledField!]!        # what will appear on the PDF, per page
  missingFields: [MissingField!]!      # what the app must ask for
  problems: [FieldProblem!]!           # value did not fit the PDF field
  documentUrl: String                  # authenticated path, null until filled
  isFlattened: Boolean!
  createdAt: String!
  updatedAt: String!
}

type MissingField {
  fieldPath: String!
  label: String!
  question: String!                    # the wording the app should show
  answerKind: AnswerKind!              # TEXT DATE MONEY BOOLEAN CHOICE REPEATING
  choices: [String!]                   # populated for CHOICE
  strength: FieldStrength!             # REQUIRED PREFERRED
  formFieldIds: [String!]!             # which PDF fields are waiting on it
}
```

`missingFields` is the whole "have the app ask the user" contract. It is
non-empty exactly when the run's status is `NEEDS_INPUT`.

### REST — one new route, for bytes only

GraphQL is the wrong transport for a multi-megabyte PDF.

```
GET /benefits/applications/{id}/pdf     → application/pdf
```

behind the same `auth.Middleware` as `/graphql`, scoped to the viewer, streamed
from server-side storage. No signed object-storage URLs — a signed URL to a
document containing an SSN and a full household roster is a link that leaks.

### Mobile

- `packages/api-contract/operations/benefits.graphql` + generated types
- `src/features/benefits/benefits-repository.ts` — the GraphQL calls
- Questionnaire screens driven by `missingFields`, so the app asks exactly the
  questions the form is short of and nothing more
- Review screen renders `filledFields` grouped by page, with the source field
  path shown for each, then Approve
- `expo-web-browser` (already a dependency) opens the authenticated PDF URL
- `GovernmentProfile` in `app-state.tsx` becomes a server-backed mirror; the
  AsyncStorage copy is removed

---

## 6. Folder structure

```
apps/server/
  migrations/00006_benefits.sql

  internal/domain/benefits/          # pure: types and rules, zero I/O
    doc.go
    fieldpath.go                     # the vocabulary, versioned
    value.go                         # Value + AnswerStatus + provenance
    profile.go                       # the aggregate; Flatten() -> map[FieldPath]Value
    mapping.go                       # FormMapping, FieldMapping, Target, Transform
    transform.go                     # the closed transform set
    requirement.go                   # requirement + `unless` evaluation
    outcome.go                       # FilledField, MissingField, FieldProblem
    errors.go
    validate.go

  internal/modules/benefits/
    service.go                       # profile CRUD + application lifecycle
    registry.go                      # loads, hashes and validates the mapping files
    resolve.go                       # profile x mapping -> outcomes (no PDF, no I/O)
    fill.go                          # outcomes -> PDF, via pdf/
    documents.go                     # artifact storage, hashing, retention

    pdf/                             # deterministic. Imports no AI package.
      doc.go
      inspect.go                     # AcroForm inventory: name, type, page, rect, options
      acroform.go                    # fill fillable forms
      overlay.go                     # content-stream text/checkmark at coordinates
      flatten.go                     # strip the form, re-draw values via overlay
      font.go                        # base-14 widths, shrink-to-fit, escaping

    assist/                          # AI. Authoring-time only, never in a fill.
      suggest.go                     # PDF field inventory -> candidate field paths
      prompt.go
      validate.go                    # every suggestion checked against the vocabulary

  internal/db/
    benefits_profile_store.go
    benefits_application_store.go

  internal/graphql/
    benefits.resolvers.go
    benefits_mapping.go
    benefits_errors.go

  internal/http/
    benefits_documents.go            # GET /benefits/applications/{id}/pdf

  forms/                             # versioned mappings + official templates
    registry.json
    us/ca/snap/cf285/2024.07/{mapping.json,template.pdf}
    us/ca/medicaid/…

  cmd/benefits-inspect/              # dev tool: dump a PDF's field inventory
  cmd/benefits-draft-mapping/        # dev tool: AI-assisted draft for a human to finish

packages/api-contract/
  benefits.graphql
  operations/benefits.graphql

apps/mobile/src/
  features/benefits/
    benefits-repository.ts
    questionnaire/                   # screens driven by missingFields
    review/                          # filledFields review + approve
  graphql/benefits-operations.ts
  app/resources/benefits-questionnaire.tsx   # becomes a real screen
  app/resources/applications/[programId].tsx # becomes a real screen
```

The `pdf/` package importing no AI package is a structural guarantee, not a
convention — a test asserts the import graph.

---

## 7. Security and privacy concerns

| # | Concern | Response |
|---|---|---|
| 1 | **This is the most sensitive data in the product.** SSNs, DOBs, immigration status, disability, pregnancy, income, addresses — for a whole household, including children. | Everything server-side. The client holds no benefits PII at rest; the AsyncStorage `governmentProfile` is deleted as part of this work. |
| 2 | **SSN at rest** | Encrypted column (AES-256-GCM, key from `BENEFITS_ENCRYPTION_KEY`, never in the repo). Returned over the API only as last-4. Full value decrypted only inside a fill, only when a mapping field asks for it. Never logged. Needs a decision — section 8. |
| 3 | **Generated PDFs are a full PII payload in one file** | Stored server-side, served only through the authenticated route, never a public or signed URL. Every document row carries `purge_after`; drafts expire. |
| 4 | **Household members are third parties** | Children and adults who did not consent to Help The Hive. Same protections, and `deleteViewerData` must remove them. |
| 5 | **AI must never see PII** | The `assist` package receives only a *blank* form's field inventory — names, types, page numbers, nearby static label text. It is never called during a fill. Enforced by `pdf/` and `resolve.go` not importing `assist`, asserted by an import-graph test, plus a test that the fill path makes no outbound HTTP call. |
| 6 | **AI must never decide an answer** | `assist` output is a *draft mapping file* written to disk for a human to review and commit. It never reaches a running fill. Every suggestion is checked against the field-path vocabulary and dropped if unknown. |
| 7 | **Inventing an answer is the worst possible failure** | A wrong answer on a benefits application is a false statement to a government agency, with real consequences for the applicant. `AnswerUnknown` never reaches a PDF; a required unknown puts the run in `NEEDS_INPUT` and it cannot be approved. |
| 8 | **Cross-user access** | No benefits field accepts a user id. Every SQL statement carries the viewer's id in its predicate. Anything the viewer may not see is `NOT_FOUND`. Matches the existing meals policy and gets the same integration tests. |
| 9 | **Signatures and dates** | `fillPolicy: never`. Help The Hive does not sign an application or date a signature on the applicant's behalf. |
| 10 | **Deletion** | The existing `deleteViewerData` mutation must cascade to all benefits tables and delete stored documents from disk/bucket, not only the rows. |
| 11 | **Logging** | Structured logs carry `application_id` and `field_id`. Never a field *value*. A redaction helper plus a test asserting no `Value` type has a `String()` that returns its contents. |
| 12 | **Legal posture** | Help The Hive prepares a draft; the applicant reviews, signs and submits. This must be visible in the UI, not just in a policy. The review screen states it, and nothing is auto-submitted anywhere. |
| 13 | **Template provenance** | Official PDFs are pinned by SHA-256. A template that does not match its hash is a start-up failure. Prevents a swapped or tampered form silently changing what users sign. |

---

## 8. Decisions needed before implementation

**8.1 — Where does PDF filling run?**

`apps/server` is Go. `pdf-lib` is JavaScript.

- **(a) Go, in `apps/server`, using `pdfcpu` v0.15.0** (Apache-2.0, already in the
  module cache). It provides AcroForm introspection (`api.FormFields`), a
  deterministic `api.FillForm` for text/checkbox/radio/combobox/listbox, and the
  low-level xref access needed to write our own content-stream overlay for flat
  PDFs and for flattening. One service, one auth path, one deployment. `pdf-lib`
  and `acroforge` stay what the brief asked for — architectural references.
- **(b) A Node sidecar** using `pdf-lib` directly. Closer to the reference repos,
  but adds a second service, a second deployment, and a network hop that carries
  full PII.

**Recommendation: (a).** The reference repos are reference material; a second
PII-carrying service is a real cost for no capability gain.

One caveat, stated plainly: pdfcpu has no flatten API. Flattening is implemented
here as *remove the form, then re-draw every filled value at its widget's
original rectangle through the same overlay renderer the flat-PDF path uses*.
That produces a genuinely flat page and keeps one text-drawing code path, but
widget-drawn borders and backgrounds are lost. On government forms the boxes are
almost always part of the page artwork, so this is usually invisible — but it is
a real tradeoff and it needs a fixture test per form.

**8.2 — A meals refactor is in flight in the same working tree.**

`internal/...` builds clean; `cmd/seed-meals` does not, and is being actively
edited as this was written. Benefits work is entirely additive and touches no
meals package, but `gqlgen generate` loads the resolver package, so schema
codegen depends on that refactor staying green. The plan is to add nothing to
any meals file and to run codegen against `./internal/...` only.

**8.3 — SSN.**

Store it encrypted, or never store it and ask for it at fill time and hold it in
memory only? Encrypted storage is far better UX across repeat applications;
not storing it is strictly safer. This is a product and risk call, not a
technical one.

**8.4 — Which form ships first?**

The engine is form-agnostic, but it needs one real official PDF to be tested
against rather than a synthetic fixture. Which state and program, and is there a
PDF to work from?
