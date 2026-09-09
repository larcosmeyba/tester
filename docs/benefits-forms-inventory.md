# The state form collection — what is in it and what it will take

68 PDFs across 33 states and the District of Columbia, inspected with
`cmd/benefits-inspect`. This records what the collection actually contains,
because the answer changes the plan considerably.

## What it is

| | count |
|---|---|
| PDFs supplied | 68 |
| Instructions, handbooks and brochures (not forms to fill) | 5 |
| Non-English duplicates of a form already counted | 8 |
| **Core forms** | **55** |

By program: SNAP 45, Medicaid 4, Senior 2, and one each of Childcare, TANF,
LIHEAP and Veterans. By stage: 47 initial applications, 3 renewals, 2 change
reports, 2 supporting forms, 1 appeal.

## Fillable or flat

| | forms | pages |
|---|---|---|
| **Fillable AcroForms** | 14 | 298 |
| **Flat, print-and-fill** | 40 | 743 |
| **Unreadable** | 1 | — |

Two thirds have no form fields at all. That is the single most important fact
about this collection: a fillable form needs a mapping of field names, and a
flat one needs a coordinate for every box.

This was verified rather than assumed. Every PDF was inspected twice — once
through this engine's page-annotation walk and once through pdfcpu's own
AcroForm walk — and the two agreed on all 68. Where the engine reports no
fields, there are none.

### The 14 fillable forms

Alaska, Arizona, California, Missouri (×2), Nevada, New Mexico (×2),
North Carolina, North Dakota, Oregon, Pennsylvania, Wisconsin (×2), plus a
California supporting form. Between them: 8,000-odd fields, the largest being
California at 1,444 and Arizona at 1,066.

### Field names, and why they decide the effort

A mapping is written against field names, so how meaningful those names are
decides whether the work is hours or days.

| | |
|---|---|
| Missouri, Pennsylvania, North Dakota, New Mexico Veterans | 100% meaningful |
| Alaska, Oregon | 99% |
| North Carolina | 98% |
| Arizona | 97% |
| Wisconsin | 95% |
| Nevada | 91% |
| New Mexico Medicaid | 62% |
| **California** | **0%** |

Twelve of the fourteen are fine — `First Name`, `Home Address - City`,
`Legal first name HHM.3`. California's SNAP application names all 1,444 of its
fields `Text1 PG 1`, `Check Bo34 PG 1` and so on, which say nothing whatsoever.

That is what the label extractor in `internal/modules/benefits/pdf` is for. It
reads the text printed beside each box, so California's fields come back as
`NAME (FIRST, MIDDLE, LAST)`, `APARTMENT #`, `CITY`, `COUNTY`, `ZIP CODE`. The
labels go into the AI mapping assistant's prompt, which is what makes a
1,444-field form mappable at all.

Reading them needed real work: those labels are drawn in subset Type1 fonts
whose character codes start at 0x35 and which carry no ToUnicode map, so the
bytes have to be read through the font's own `/Differences` array. Other forms
mix WinAnsi with Identity-H, which needs the ToUnicode CMap instead. All three
paths are implemented and tested.

## The flat forms are text-based, which changes their outlook

49 of the 51 flat PDFs are text-based rather than scanned images — only
Minnesota's single-page form is sparse enough to look like a scan. Their labels
and rules can be read with positions, exactly as for the fillable ones.

That matters because hand-measuring coordinates for 743 pages is not a serious
plan, and semi-automating it is. The extractor already returns every text run
with its position on a flat page; proposing a target rectangle beside each label
is the next step, and it is the thing that makes the other two thirds of this
collection tractable.

## The unreadable one

**Ohio, JFS-07200.pdf.** AES-256 encrypted, and pdfcpu v0.15.0 — the current
release — fails on it with `ciphertext too short`. That is an upstream bug, not
something to work around here. The cheap fix is an unencrypted copy from the
agency.

New York and North Carolina were both unreadable too, and are not any more. Both
are produced through Microsoft Office, which stamps SharePoint keys into the
document information dictionary with escapes a strict reader rejects. The
documents are fine; the metadata is not. A validation failure is now retried
with that dictionary dropped, which recovered New York's 28-page application and
North Carolina's 575-field one.

## Onboarded so far

**Missouri** — `forms/us/mo/snap/im1ss/2024.01`. The real agency PDF, 12 pages,
413 fields, checked in and pinned by SHA-256. The mapping covers 134 of its
fillable boxes: identity, address, contact, the nine-row household table, income
sources, bank accounts, housing, utilities, child support, childcare and medical
costs. Signature fields are marked `fillPolicy: never`.

Missouri numbers the applicant as **row 0** of its household table — that row
has no relationship or buy-and-cook box, because it is you — and everyone else
from row 1. No invented fixture would have had that, and getting it wrong would
put a child's date of birth on the applicant's line. There is a test for it.

Coverage is reported to the applicant rather than kept quiet: the programs
screen says "Help The Hive can fill about 32% of this form (134 of 413 boxes).
You complete the rest." Most of what is left is criminal-history and school
enrolment sections that no profile holds and none should.

## Suggested order

1. **The other 13 fillable forms.** Field names are good, the tooling is built,
   and this covers Arizona, Pennsylvania, North Carolina, Oregon, Wisconsin,
   North Dakota, Alaska, Nevada and New Mexico.
2. **California**, using the extracted labels. Biggest state, worst names,
   highest payoff.
3. **Flat-form target discovery** — propose a rectangle beside each detected
   label — then the 40 flat forms, largest states first.
4. **Ohio**, once an unencrypted copy exists or pdfcpu fixes the bug.
