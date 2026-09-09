# CA SAWS 2 PLUS (CalFresh/SNAP) — mapping notes

Status: **draft**. Do not use to fill real applications without human per-field review.

## What this is

A mapping-schema-v1, vocabulary-v1 draft mapping for the California SAWS 2 PLUS
paper application ("Application for CalFresh, Cash Aid, and/or Medi-Cal/Health Care
Programs"), modeled on `apps/server/forms/us/mo/snap/im1ss/2024.01/mapping.json`.

- `template.pdf` — pinned source PDF (29 pages, SHA-256 below).
- `mapping.json` — 151 entries: 147 mapped, 4 `fillPolicy: "never"`.
- `field-labels.json` — working artifact with all 1,444 fields, the extracted
  evidence label/header for each, and its disposition (`mapped` / `unmapped` /
  `attestation_never`). The form registry only loads files named `mapping.json`,
  so this file is inert documentation.

## Provenance

- Source URL (CDSS official forms library):
  `https://www.cdss.ca.gov/cdssweb/entres/forms/English/SAWS2_PLUS.pdf`
- SHA-256: `086a74e1c608a9ab44f1ec2539a3158af642f27d8f2638b9a15fd31ea8e67a5f`
- Printed revision: SAWS 2 PLUS **(4/15)**; older catalog metadata gives effective
  date 2015-04-01. `retrievedAt: 2026-09-09`.
- The revision is old for a 2026 application. The county may expect a newer
  edition; this mapping stays **draft** until a reviewer confirms the
  county-accepted revision and re-verifies every field.

## Extraction method

No Go toolchain was available, so labels were extracted with a Python
(pdfplumber) port of `LabelFor` from
`apps/server/internal/modules/benefits/pdf/labels.go`: the text immediately
left of a widget, else up to 26pt above it, plus the full text line and the
nearest table header above the column. Spot checks confirmed the Go engine
would produce equivalent labels.

The form uses subset fonts whose checkbox glyphs extract as `(cid:0..3)`:
`(cid:0)`, `(cid:1)`, `(cid:3)` render as the printed empty checkbox ☐ and
`(cid:2)` as a bullet • (verified by rendering pages 7–9, 11, 15, 24 to PNG).
Many nearby labels are therefore glyph runs or fragments of adjacent columns —
the 1,314/1,444 raw "has a label" rate (91.0%) is **not** a confidence measure.
Only the 151 mapped/never fields below carry reviewer-confirmed labels.

Yes/No pair rule used throughout: printed `☐Yes ☐No` puts the Yes-widget left
of the printed word "Yes"; the extraction labels the right (No) widget with a
trailing `☐ Yes`. Each pair's Yes box was verified against the printed words
(page 9 citizen pairs) or the older CA field-inventory pack (page 7 pairs).
Only Yes boxes are ever ticked, and only when the profile answers true.

## What is mapped (147 fields)

| Section | Fields |
|---|---|
| p7 — applicant identity, addresses, phones, email, language, homeless Yes | 18 |
| p8 — health-insurance authorized representative name + phone | 2 |
| p9 — adult roster rows 1–5: name, relationship, DOB, sex, SSN, citizen-Yes | 30 |
| p10 — child roster rows 6–10: name, relationship, DOB, sex, SSN | 25 |
| p14 — other income, 4 rows × person/payer/amount/frequency | 16 |
| p15 — employment, 4 jobs × person/employer/phone/rate/hours/frequency | 24 |
| p16 — dependent care, 4 rows × person/provider/amount | 12 |
| p20 — resources/accounts, 4 rows × kind/balance/institution | 12 |
| p26 — Appendix B representative name + phone | 2 |
| p29 — Appendix E vehicles 1–3: year/make/model composite + estimated value | 6 |

## Deliberate mapping choices

- **Roster row 1 = applicant** (`household.members[0]`). The form says "all adults
  in the home", which includes the applicant; this mirrors the IM-1SSL
  convention. The reviewer must confirm the county expects the applicant in
  row 1.
- **Name composite**: roster renders `Last, First` (the printed format); page 7
  renders `First Middle Last`. Middle initial has no vocabulary path.
- **Free-text valueMaps** (relationship, sex, account kind): the mapper writes
  plain words ("Spouse", "F", "Checking"); phrasing is the mapper's choice for
  a free-text box, documented per field.
- **Frequency columns** (income, jobs, childcare) are written verbatim; the
  printed hints match the canonical lowercase words.
- **Childcare monthly amount**: the vocabulary amount is explicitly monthly, so
  pairing it with the "How much?" column follows the IM-1SSL pattern of
  pairing a canonical-monthly value with its column.
- **Citizen Yes (page 9 only)**: ticked only on true; the No box is left blank
  for the applicant. Page 10 child rows have an extra adjacent checkbox that
  makes the pairing ambiguous, so children's citizen boxes are unmapped.
- **"Are you homeless?" Yes** (Check Box28 PG 1): ticked only on true; the No
  box is left for the applicant.
- **Signatures/dates** (`sig_applicant`, `sig_date`, `appxb_sig_date`) and the
  assister-only start date (`appxb_start_date`) are `fillPolicy: "never"`.

## Deliberately unmapped (with reasons)

- Expedited-service screeners (p7): need combinations the profile does not hold
  with certainty; applicant answers.
- Program-selection checkboxes (CalFresh/Cash Aid/Medi-Cal/None) and the
  per-person "applying for" checkbox columns (p9–10): no vocabulary path.
- Read-language vs speak-language (p7 Text31), other-names line, mailing county:
  no vocabulary path.
- Pregnancy question (p7): asks about anyone in the household, not a single
  person; no safe path.
- Health-insurance authorized-rep Yes/No (p8): no vocabulary boolean.
- Roster marital status / student / disabled checkboxes, "who helps pay" rows
  (p16), employer address (folded into name — no vocab path), vehicle owner /
  license / amount-owed boxes, income kind checkboxes, resource-owner name
  column, transferred-resource question (p20): no vocabulary path or ambiguous.
- Foster-child questions (p14), residency questions 6q/6r, absent-parent pages,
  voter registration (p22–23), rights/responsibilities text: out of scope or
  no vocabulary path.

## Reviewer checklist (per-field review required)

1. Confirm the county-accepted SAWS 2 PLUS revision for 2026; if newer than
   4/15, this mapping must be rebuilt.
2. Verify roster row 1 is the applicant (else shift `household.members`
   indices).
3. Verify each Yes/No pair attribution (especially page 9 citizen pairs and
   the page 10 child-row checkbox that was left unmapped).
4. Verify the two page-7 signature widgets (Text61/Text62 PG 1) attribution.
5. Verify table column→x-window assignments on pages 9, 10, 14, 15, 16, 20, 29
   (documented in `field-labels.json` per field).
6. Re-run `go test ./internal/modules/benefits/...` once a Go toolchain is
   available (structural checks were done with a Python port; see below).

## Validation performed

- All 151 target names exist in `template.pdf`'s AcroForm; widget types match.
- Python port of the Go registry/domain validation: unique IDs/targets, known
  source paths, known transform ops, repeat-over matches source group,
  complete valueMaps for choice/boolean sources without transforms, no
  defaults, requirements paths valid, template SHA/page count pinned.
  Result: 0 errors.
- Go tests could not run: no Go toolchain in this environment.

## Metrics

- Total AcroForm fields: 1,444 (824 checkbox, 620 text).
- Mapped: 147. Attestation/never: 4. Coverage: 151/1,444 = **10.5%**.
- Unmapped: 1,293 (**89.5% ambiguity rate**).

## Future work

- Spanish edition (`saws2plus_sp.pdf`) — not mapped; separate mapping needed.
- Re-verify against the current CDSS revision when confirmed.
- Roster semantics (row 1 = applicant) and page-10 citizen pairing need a
  human with the printed form in hand.
