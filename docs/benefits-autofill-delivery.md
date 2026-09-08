# Government Benefits PDF Autofill — what was built

Server-side implementation of the flow

```
questionnaire -> saved benefits profile -> state + program mapping
-> official government PDF -> autofill -> validation -> user review
-> completed PDF
```

The audit and design that preceded this are in
[benefits-autofill-audit.md](benefits-autofill-audit.md). This document records
what is in the tree, where the design changed under implementation, and what is
not done.

**Status: server engine implemented and tested end to end. Mobile screens not
started** — that was the agreed scope for this pass.

---

## The rule the whole thing is built on

An answer nobody gave is never guessed. It is enforced by the type system rather
than by discipline: a profile field is not a string, it is a `Value` carrying an
`AnswerStatus` of `unknown | provided | none | refused`. Only `provided` and
`none` can reach a PDF.

- `$0 income` and `income not asked` are different facts and cannot collide.
- An unticked box is a claim, so "I pay nothing for heating" is stored as an
  answer (`none`), not as an absence.
- A required unknown puts the run in `NEEDS_INPUT`, returns the question the app
  should ask, and makes approval impossible.
- A value that will not fit its box is reported as a problem for a person to
  look at, never truncated into something wrong.

`TestZeroIncomeAndUnknownIncomeDiffer` and
`TestUnansweredFieldIsMissingNeverGuessed` are the tests that hold this.

## What AI does, and what stops it doing more

AI is used in exactly one place: `internal/modules/benefits/assist` proposes,
at *authoring time*, which Help The Hive field path each field of a blank
government PDF probably corresponds to. Its output is a draft mapping file for a
person to review and commit.

It cannot do anything else, and that is structural rather than a convention:

| Guarantee | How it is held |
|---|---|
| No model runs during a fill | `internal/domain/benefits` and `internal/modules/benefits/pdf` do not import `assist` or any provider — asserted by `TestTheFillPathCannotReachTheAIAssistant` |
| No Help The Hive code in the fill path opens a socket | `TestHelpTheHivesOwnFillCodeMakesNoNetworkCall` |
| A model never sees applicant data | `assist` cannot reach the database or the service (`TestTheAssistantOnlyEverSeesABlankForm`), and `TestThePromptDescribesOnlyTheBlankForm` checks the prompt itself |
| A hallucinated field path cannot reach a mapping | every suggestion is validated against the vocabulary and dropped if unknown (`TestASuggestionNamingAPathThatDoesNotExistIsDropped`) |
| A model never decides an answer | its output is a file on disk; nothing reaches a running server until a human commits it, and the registry then re-checks it against the real PDF |

## Where the design changed under implementation

Two decisions from the audit turned out differently once the code existed. Both
are worth stating rather than quietly swapping.

**Profile storage is an answers table, not typed columns.** The audit proposed a
typed scalar core plus child tables. In practice the vocabulary *is* the schema —
it decides which paths exist, what kind each carries and which choices are
allowed, and every write is validated against it before it reaches SQL. Typed
columns would have meant a ninety-column table with a status marker per column
and a migration per new question, in exchange for indexability the product does
not need (nothing queries across users by income). So answers are stored
path-keyed in `benefits_profile_answers`, with `benefits_group_rows` recording
that a repeating group was collected at all. The tradeoff is real: type safety
lives in Go rather than in the database.

**Flattening removes the form and redraws.** pdfcpu has no flatten API. The
final document is produced by stripping the AcroForm outright and redrawing each
approved value at the rectangle its widget occupied, through the same renderer
that fills flat forms. That gives one text-drawing path instead of two that
could disagree, and a genuinely flat page rather than a form marked read-only.
The cost: borders and backgrounds drawn by the widgets themselves go with them.
On government forms the rules and boxes are almost always page artwork, so this
is usually invisible — but every form needs a fixture test that renders it and
confirms nothing was lost.

## Layout

```
apps/server/
  migrations/00006_benefits.sql          six tables, with a matching Down

  internal/domain/benefits/              pure: no database, no PDF, no network, no AI
    value.go        Value + AnswerStatus. No String method, so an answer cannot
                    be spilled into a log line by interpolating a struct.
    fieldpath.go    the field vocabulary, versioned
    profile.go      the aggregate; Flatten() -> map[FieldPath]Value
    derive.go       computed totals, only ever from answers that exist
    mapping.go      FormMapping and its validation
    transform.go    the closed transform set
    resolve.go      profile x mapping -> filled / missing / problems / skipped
    outcome.go      what the app is handed

  internal/modules/benefits/
    service.go        lifecycle; resolves the viewer from the token, never a client id
    registry.go       loads and verifies mappings against their real PDFs
    render.go         resolution -> PDF
    profile_store.go  domain <-> rows, sealing sensitive answers on the way in
    documents.go      artifact storage
    config.go         BENEFITS_FORMS_DIR, BENEFITS_DOCUMENTS_DIR
    pdf/              the deterministic engine
      inspect.go      field inventory: name, type, page, rect, options, on-state
      fill.go         AcroForm filling, verified against the template first
      overlay.go      content-stream drawing at coordinates
      flatten.go      strip the form, redraw the approved values
      font.go         base-14 metrics, WinAnsi encoding, escaping
    assist/           AI. Authoring-time only.
    secrets/          AES-256-GCM for sensitive answers

  internal/db/benefits_store.go          every statement scoped to one user
  internal/graphql/benefits*.go          schema mapping, resolvers, error policy
  internal/http/benefits_documents.go    GET /benefits/applications/{id}/pdf

  cmd/benefits-inspect/                  what is really in this PDF
  cmd/benefits-draft-mapping/            AI-assisted draft for a person to finish
  forms/                                 versioned mappings + templates (see forms/README.md)

packages/api-contract/benefits.graphql   the contract both sides build against
```

## Field vocabulary

One reusable profile, addressed by a versioned dotted vocabulary
(`VocabularyVersion = 1`) rather than by database columns, so a mapping file
survives a schema change. Groups: `applicant`, `contact`, `address`,
`household`, `employment`, `income`, `housing`, `utilities`, `expenses`,
`resources`, `benefits`, `program`.

Repeating groups — household members, jobs, income sources, childcare costs,
medical costs, accounts, vehicles — are addressed as
`household.members[].last_name` in a mapping and resolved to
`household.members[2].last_name` against a profile.

Derived values (`income.monthly_gross_total`, `housing.total_shelter_monthly`,
the expense totals) are computed only when every input they need exists, and
are flagged `isDerived` when reported missing so the app shows "this fills in
once you have told us about your income" rather than an unanswerable question.

## What the PDF engine supports

Text fields, checkboxes, radio groups, dropdowns, list boxes, multi-page forms,
fillable AcroForms, and flat non-fillable PDFs by coordinate mapping. Missing
information is detected before anything is drawn, and the approved document is
flattened.

Verified against a generated two-page fixture carrying one of every field type
and against the checked-in sample form:

- `TestFillWritesEveryFieldType` — all five field types, on both pages
- `TestFlattenLeavesNoFormBehind`, `TestFlattenedDocumentCannotBeRefilled`
- `TestFlattenTicksOnlyTheBoxesThatWereTicked` — exactly two ticks, not one more
- `TestFlattenRefusesToLoseASelectedRadioOption` — a radio value that matched no
  button is an error, not a silently dropped answer
- `TestOverlayDrawsAtBottomLeftCoordinates` — the coordinate convention, asserted
- `TestOverlayRefusesToOverflowABoxWithoutShrinkToFit`
- `TestACompleteProfileFillsTheSampleFormEndToEnd` — profile to flattened PDF
- `TestTheSignatureIsNeverFilledIn`

Determinism is content-level, not byte-level, and the test says so: pdfcpu
stamps every write with a ModDate and a file id, so two identical fills differ in
a few metadata bytes. What must not differ — the field values and the page
content — is asserted. Each document row stores the hash of the bytes actually
produced, so reproducing an artifact does not depend on reproducing the bytes.

## Registry: a mapping cannot be wrong in production

`LoadRegistry` runs at start-up and refuses to boot on a bad mapping. It checks
the template's SHA-256, opens the PDF, and verifies that every field the mapping
addresses exists with the type it assumes and accepts the values it could write.
Tested by breaking the sample form five ways —
`TestATamperedTemplateIsRefused`, `TestAMappingThatAddressesAMissingFieldIsRefused`,
`TestAMappingWithTheWrongFieldTypeIsRefused`,
`TestAMappingThatWritesAnImpossibleChoiceIsRefused`, and a `valueMap` with a hole.

## API

Queries: `benefitsProfile`, `benefitsForms`, `benefitsForm`,
`benefitsApplication`, `benefitsApplications`, `benefitsFieldVocabulary`.

Mutations: `saveBenefitsAnswers`, `saveBenefitsGroup`,
`startBenefitsApplication`, `refillBenefitsApplication`,
`approveBenefitsApplication`, `deleteBenefitsApplication`.

`GET /benefits/applications/{id}/pdf?kind=draft|final` is the only route in the
server that returns bytes. It sits behind the same auth middleware as
`/graphql`, is scoped to the viewer, and is a path rather than a URL on purpose:
there is no signed object-storage link, because a signed link is a shareable
capability to read somebody's benefits application.

## Privacy

- Sensitive answers (SSN, immigration status, case numbers) are sealed with
  AES-256-GCM, bound to the user and field path, so a ciphertext moved between
  rows fails to open (`TestCiphertextIsBoundToItsUserAndField`).
- No sensitive value is ever returned by the API. A masked hint — `*** 6789` — is
  all that comes back, including on the review screen.
- With no `BENEFITS_ENCRYPTION_KEY` the server logs a warning and *refuses* to
  store a sensitive answer. It never falls back to plaintext.
- `benefits_application_fields` records which path fed which box and never the
  value: a third copy of an SSN would be a third thing to protect.
- `deleteViewerData` now purges generated PDFs before deleting the user. The
  cascade takes the rows; the files needed removing too, or an account deletion
  would leave a household's completed application on disk.
- Logs carry application ids, field ids and hashes. Never a field value.
- `Value` deliberately has no `String()` method, and a test enforces it.

## Still outstanding

- **Mobile.** No screens yet. The questionnaire is meant to be driven by
  `missingFields` — group by `group`, ask `question`, skip anything
  `isDerived` — and the review screen by `filledFields`. `GovernmentProfile` in
  `apps/mobile/src/state/app-state.tsx` still writes benefits answers to
  AsyncStorage and should become a server-backed mirror; that removal is part of
  the mobile pass.
- **A real government form.** The only checked-in mapping is the synthetic
  `hth-sample-1`. Real state PDFs are produced by tooling no fixture can
  imitate. `forms/README.md` has the process.
- **Document durability.** `FileDocumentStore` writes to local disk. On a
  container filesystem that does not survive a restart or a second instance, so
  a draft can vanish between requests. `DocumentStore` is an interface; a
  bucket-backed implementation needs no service change. The server logs a
  warning when `BENEFITS_DOCUMENTS_DIR` is unset.
- **Non-Latin-1 names.** The overlay draws with the base-14 fonts, which are
  WinAnsi. `José Muñoz` is fine; `Nguyễn` is not representable, and it is a hard
  error rather than a dropped character — writing a corrupted legal name onto a
  benefits application is worse than refusing. Fixing it means embedding a
  Unicode TrueType font. `TestOverlayRefusesToDropCharactersItCannotWrite`.
- **Retention sweep.** `PurgeExpiredDocuments` exists and is tested, but nothing
  calls it on a schedule yet.
- **Provider env names.** `cmd/benefits-draft-mapping` reuses the meal system's
  `MEAL_AI_*` variables rather than reaching into that package to add a
  configurable prefix while it was being refactored. The provider package should
  grow that, and then benefits should get its own keys.

## Not broken

`go build ./...` and `go test ./...` are clean, including every pre-existing meal
and pantry test. `pnpm --filter @helpthehive/mobile typecheck` is clean. The
meal refactor in flight during this work was not touched: no meals file was
edited. The shared files that did change are the ones a new feature has to
touch — `gqlgen.yml`, `codegen.ts`, `resolver.go` (a field plus a `WithBenefits`
setter, so `NewResolver`'s signature is unchanged), `router.go` (one route) and
`schema.resolvers.go` (`deleteViewerData` now purges documents).
