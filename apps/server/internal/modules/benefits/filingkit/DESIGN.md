# Filing Kit Generator — Design

Package `filingkit` (`apps/server/internal/modules/benefits/filingkit`) builds
a printable PDF **answer sheet** for the ~40 flat (non-fillable) benefits forms.
It is Phase D of the benefits autofill expansion.

## Why an answer sheet instead of coordinate overlays

The flat forms are paper/PDFs with no fillable fields. Positioning text by
page coordinates (overlay mapping) is brittle: one agency revision that
reflows a form silently misplaces every answer, and a misplaced SSN is worse
than a blank line. An answer sheet is robust by construction — it lists the
applicant's saved answers in the order the official form asks for them, with
ruled "fill in by hand" lines for anything missing. The applicant copies
values onto the official form and reviews every line before signing. Nothing
the app prints can drift out of alignment with an agency revision.

## National Autofill Question Set order (A–J)

Questions are grouped and printed in the fixed National Autofill Question Set
order, defined in `sections.go`:

- **A** applicant identity & contact
- **B** residential & mailing address
- **C** household roster
- **D** citizenship / immigration
- **E** earned income (jobs)
- **F** other income & changes
- **G** expenses
- **H** assets / resources
- **I** program-specific circumstances
- **J** authorized representative, certification & signature

The generator drops any section that ends up with zero rows, so a narrow form
never prints empty sections.

## FormInfo.Expected semantics

`FormInfo.Expected` is the list of field paths the target form actually asks
for (from the flat-form catalog). Rules:

- A question that is **answered** always appears, even if not in `Expected`
  (it may still help the applicant).
- A question that is **unanswered and not expected** is omitted entirely —
  the sheet never prints blank lines for things the form does not ask.
- A question that is **unanswered and expected** appears as a ruled
  "fill in by hand" row, because the official form likely requires it.
- When `Expected` is empty/nil, every question in the set is treated as
  expected: the full sheet prints, which is the safe default for forms the
  catalog has not described yet.

## No-invention behavior

The generator only ever transcribes what the applicant said:

- Unknown answers are never guessed, defaulted, or derived into existence.
  A missing value becomes a ruled blank line, not a plausible-looking answer.
- `StatusNone` ("None") is an explicit answer and prints as such — it is not
  treated as missing.
- `StatusRefused` prints as "Declined to answer" and is counted separately,
  never transcribed.
- Derived values (e.g. totals) are labeled "calculated from your answers".
- Repeating groups render per-member subheads ("Household member 1 of 2").
  A group the applicant confirmed is empty prints its summary ("None") with
  no invented member rows. A blank block is added for an uncollected group
  only when the applicant's own answers imply it exists (e.g. employment
  status "employed" with no jobs listed, household size above the roster
  count) — never from a guess about what the form wants.
- Section J always prints manual signature/date instructions. **The app never
  signs for the applicant.**

## Sensitive-value handling

- Answer values exist only inside the `Kit` while it is being built and in
  the rendered PDF bytes handed to the caller. The package has no logger,
  no metrics sink, and no persistence of its own.
- `Kit.Audit()` returns a metadata-only audit record: form code/version,
  section codes, template field paths, and counts of answered / blank /
  declined rows. It carries **no values** and no user identifiers.
- Unit tests use synthetic answers only (`syntheticProfile` in
  `kit_test.go`); no fixture may contain real applicant data.

## Retention: kits are draft documents

A filing kit is a draft document. Whatever service stores the rendered bytes
must treat it like the existing `"draft"` kind: private, authenticated-only
storage with `PurgeAfter = generatedAt + DraftRetention` (30 days, per
`documents.go`). The kit is not a submission record and must not outlive the
draft window.

## Delivery: authenticated, never public

Kits are delivered through the existing private `DocumentStore` behind the
authenticated document route — the same path as other benefits documents.
No signed or public URLs.

## Unicode limitation

The renderer writes PDF 1.4 with base-14 Helvetica (no font embedding) using
WinAnsi (Windows-1252) encoding. Characters outside WinAnsi — e.g. CJK text,
emoji — are replaced with `?` (`encodeWinAnsi` in `pdfwrite.go`). Wrapping is
computed against the encoded bytes so lines never drift from what is drawn.
If kits must support names or addresses outside WinAnsi, the renderer needs
an embedded Unicode font (e.g. subsetted TrueType); that is future work.

## The app prepares — it never submits

Every rendered sheet carries, in its header and closing disclaimer:

- "Transcription aid — not the official form."
- The agency name and official form URL, so the applicant gets the real form.
- "Help The Hive prepares documents — it never submits them."
- A footer on every page repeating the transcription-aid notice.

There is deliberately no "submitted/sent" language anywhere in this package
or its tests.

## Integration plan (not implemented here)

The wiring below is for the parent benefits package / GraphQL layer to add;
this package intentionally stops at `Generate` + `Render`:

1. New service method (in `apps/server/internal/modules/benefits`, new file
   there or in the GraphQL resolver layer):
   - Authenticate and verify the caller's ownership of the profile.
   - Load the profile with the existing `loadProfile`.
   - Resolve the flat-form catalog entry into `filingkit.FormInfo`
     (title, code, version, state, program, agency name/URL, expected paths).
   - Call `filingkit.Generate`, then `filingkit.Render`.
   - Store the bytes through the existing private `DocumentStore`.
   - Insert a benefits document with a distinct kind (e.g. `filing_kit`)
     and `PurgeAfter = now + DraftRetention` (30 days).
   - Record the no-values `Kit.Audit()` output in the audit trail.
   - Log only generation outcome and counts — never field paths tied to a
     user, and never values.
2. `saveDocument` today applies `PurgeAfter` only to kind `"draft"`; it needs
   to generalize to draft-like kinds (or the kit must reuse `"draft"`).
3. GraphQL (`packages/api-contract/benefits.graphql` + resolvers under
   `apps/server/internal/graphql/`):
   - `generateBenefitsFilingKit(formId: ID!): BenefitsFilingKit!`
   - `benefitsFilingKit(id: ID!): BenefitsFilingKit`
   - Metadata only: id, form title/code, generatedAt, purgeAfter,
     answeredCount, blankCount, declinedCount, authenticated download URL.
     **No answers travel through GraphQL.**
4. Mobile:
   - Offer "filing kit" for flat (non-fillable) forms, labeled as a
     transcription aid, not the official application.
   - Preview / download / print / share through the authenticated flow.
   - Show the "fill in by hand" count prominently; link to the agency's
     official form and filing instructions.
   - Require applicant review; never display submitted/sent language.
   - List kits in application/document history with expiration messaging
     (30-day purge).
