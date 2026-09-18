# ACQUISITION REPORT — run of 2026-09-17 (stamp-verified)

Executed against ACQUISITION-LIST-VERIFIED.md, then **re-verified against the
files on disk**: every `template.pdf` under `us/` was opened and the revision
stamp printed on page 1 was read (when page 1 carries none, the stamp on the form's
own pages is used and noted). The folder name is the stamp as `YYYY.MM`. Nothing
committed. No mapping.json touched.

This supersedes the first draft of this report. That draft listed 25 library placements.
`fetch-remaining.sh` has since been run: it added 14 files and wrote 3 duplicates of
held copies. Several of the draft's claims did not survive reading the actual
PDFs (see **Corrections**).

## Status legend

- **OK**: an application, and the folder matches its stamp.
- **RENAMED**: an application, and the folder was renamed to the stamp in this pass.
- **FLAG**: present, but not usable as the state's application as-is. The reason is given.

## Unmapped templates on disk (44)

| State | Program | Form (as stamped) | Stamp read | Path | Status | Notes |
|---|---|---|---|---|---|---|
| AL | SNAP | DHR-FAP-2200 | (10/25) | us/al/snap/dhr-fap-2200/2025.10/template.pdf | **FLAG: leaflet** | 2-page "AESAP Rights and Responsibilities" + income-limit sheet for the *Elderly* Simplified Application Project. No questions, no signature: not an application. The general FA application (key's DHR-FSP-2116) is still missing |
| AR | SNAP+TANF | DCO-0004 | R. 06/25 | us/ar/snap/dco-0004/2025.06/template.pdf | RENAMED (0000.00) | Stamp is on p1 (the draft said it wasn't) |
| AZ | SNAP+TANF | FAA-0001A FORNA | (02/2026) | us/az/snap/faa-0001a/2026.02/template.pdf | OK | |
| CO | SNAP+TANF | Application for Public Assistance | Revised 10/2024 | us/co/snap/co-public-assistance/2024.10/template.pdf | OK | Large-print ed. |
| CT | SNAP+TANF | W-1E (p1 = W-1EINST) | Rev. 3/17 | us/ct/snap/w-1e/2017.03/template.pdf | OK (stale) | Key found Rev. 12/19; that refetch failed (see missing) |
| DE | SNAP+TANF | **Form 100** | Rev. 04/2016 | us/de/snap/assist-paper-app/2016.04/template.pdf | RENAMED (2026.06) + **FLAG: wrong form** | Every page is stamped Form 100 (Rev. 04/2016), and the PDF was created 2016-04-19. The ASSIST 2026/06 URL did **not** yield the ASSIST paper app. The `assist-paper-app` code dir is a misnomer, and ASSIST 2026 is still missing |
| GA | SNAP+TANF | Form 297 | Rev.10/2024 | us/ga/snap/form-297/2024.10/template.pdf | OK | |
| HI | SNAP+TANF | DHS 1240 | REV 12/2024 | us/hi/snap/dhs-1240/2024.12/template.pdf | OK | p1 is the info sheet (unstamped); stamp from the form pages |
| IA | SNAP+TANF | 470-0462 | (05/25) | us/ia/snap/470-0462/2025.05/template.pdf | OK | |
| IL | SNAP+TANF+MA | IL444-2378B | R-03-24 | us/il/snap/il444-2378b/2024.03/template.pdf | OK | XFA form |
| IN | SNAP+TANF | State Form 53263 / DFR 2512 | R10 / 3-16 | us/in/snap/sf-53263/2016.03/template.pdf | RENAMED (0000.00) | forms.in.gov serves a 2016 edition; flat PDF (no fields) |
| KS | SNAP+TANF | ES-3100 | Rev. 10-25 | us/ks/snap/es-3100/2025.10/template.pdf | OK | |
| KY | SNAP | FS-1 | R. 10/18 | us/ky/snap/kynect-snap-app/2018.10/template.pdf | OK | Code dir says kynect-snap-app; stamped form number is FS-1 |
| KY | TANF | PA-100 | R. 09/22[10/17] | us/ky/tanf/pa-100/2022.09/template.pdf | **FLAG: proposed-reg draft; application/recertification** | Fetched from `pa100proposed.pdf`: a Word export with 39 bracketed deletions (`[K-TAP AND]`, `[10/17]` …). This is the regulatory markup copy, not the form DCBS serves. Also titled "Application/Recertification", so it is a dual-purpose form, not renewal-only |
| LA | SNAP+TANF | OFS 4APP (p1 = OFS 4I insert) | 4APP Rev. 03/26; p1 insert Rev. 02/26 | us/la/snap/ofs-4app/2026.03/template.pdf | RENAMED (2026.01) | p1 says "01/26 Issue Obsolete". Folder uses the application pages' 03/26 stamp; the p1 cover insert is 02/26 |
| MD | SNAP+TANF | DHS/FIA 9701 | Revised 07/2024 | us/md/snap/9701/2024.07/template.pdf | OK | Flat PDF |
| ME | SNAP+TANF | BFI APP01 ("long form") | R10/04 | us/me/snap/long-form/2004.10/template.pdf | OK (stale?) | GeneralApp diff still pending |
| MN | SNAP+TANF | DHS-5223-ENG | 3-26 (from the XFA template) | us/mn/snap/dhs-5223/2026.03/template.pdf | RENAMED (2025.03) + **FLAG: XFA-only** | The held copy was already the 3-26 edition, not 3-25. p1 as flattened is only the "save it to a desktop computer" shell. The stamp is read from the XFA template, and it can't be filled as an AcroForm |
| MO | TANF | IM-1TA (MO 886-4573) | (1-2025) | us/mo/tanf/im-1ta/2025.01/template.pdf | OK | |
| MT | SNAP (Spanish) | DPHHS-HCS-250 (ES) | Rev 05/2025 | us/mt/snap/hcs-250-es/2025.05/template.pdf | RENAMED (2025.01) | URL filename says 01152025, but the stamp is 05/2025. Spanish only; English is still an email request |
| NE | SNAP+TANF | EA-117 | Rev. 12/2025 | us/ne/snap/ea-117/2025.12/template.pdf | RENAMED (0000.00) | |
| NH | SNAP (+FANF) | BFA Form 800 | rev 10/25 | us/nh/snap/bfa-800/2025.10/template.pdf | OK | |
| NJ | TANF+PA | WFNJ-1J | Rev. 08/17 | us/nj/snap/wfnj-1j/2017.08/template.pdf | OK | HCS-290 (SNAP side) is still missing |
| NM | SNAP+TANF | HCA 100 | revision date 5.1.2026 | us/nm/snap/hca-100/2026.05/template.pdf | OK | Flat PDF |
| NY | SNAP+TANF | LDSS-2921 Statewide | Rev. 07/23 | us/ny/snap/ldss-2921/2023.07/template.pdf | OK | |
| OH | SNAP+TANF | JFS 07200 | Rev. /2026 (no month printed) | us/oh/snap/jfs-07200/2026.00/template.pdf | OK (duplicate removed) | 0000.00 was byte-identical to 2026.00 (sha a8b42691…), so it was removed. `.00` stands for the month the stamp leaves blank |
| OK | SNAP | 08MP001E Request for Benefits | 4/14/2026 | us/ok/snap/08mp001e/2026.04/template.pdf | OK (**incomplete packet**) | Only 001E. The form says it's used with 08MP002E and 08MP003E, and neither is on disk |
| OR | SNAP | DHS 7476 | (03/2026) | us/or/snap/dhs-7476/2026.03/template.pdf | OK | ERDC + SNAP application |
| OR | TANF | DHS 0415F | (10/20/25) | us/or/tanf/dhs-0415f/2025.10/template.pdf | RENAMED (0000.00) | Stamp is in the p1 footer |
| RI | SNAP+TANF | DHS-2 | Rev. 09-16 | us/ri/snap/dhs-2/2016.09/template.pdf | OK | p1 = instructions page |
| SC | SNAP+TANF | DSS Form 3800 | (NOV 25) | us/sc/snap/dss-3800/2025.11/template.pdf | OK | |
| SD | SNAP+TANF | DSS-EA-301 | 11/25 | us/sd/snap/dss-ea-301/2025.11/template.pdf | OK | |
| SD | TANF | DSS-EA-201 | 11/2025 | us/sd/tanf/dss-ea-201/2025.11/template.pdf | RENAMED (0000.00) | 2-page standalone TANF app |
| TN | SNAP+TANF | HS-0169 (+ Addendum) | Rev. 04-21 | us/tn/snap/hs-0169/2021.04/template.pdf | OK | |
| UT | SNAP+TANF | DWS-ESD 61APP | Rev. 01/2026 | us/ut/snap/61app/2026.01/template.pdf | OK (duplicate removed) | The "2025.03" folder was mislabeled: it was byte-identical to 2026.01 (sha b2590200…), so it was removed. The library copy was already 01/2026 |
| VA | SNAP+TANF | **032-03-1100-39-eng** | (12/22) | us/va/snap/032-03-0824/2022.12/template.pdf | OK + **FLAG: form-number mismatch** | Every stamp in the file reads 032-03-1100; "0824" appears nowhere. Content is a full "Application for Benefits" with no renewal language, so it *is* an application. The draft's "this is 0824; 1100 = renewal" is wrong. The code dir is misnamed |
| VT | SNAP+TANF | Form 202 | Revised 10/2025 | us/vt/snap/form-202/2025.10/template.pdf | OK | |
| WA | SNAP+TANF | DSHS 14-001 | REV. 08/2025 | us/wa/snap/dshs-14-001/2025.08/template.pdf | OK | |
| WV | SNAP+TANF | DFA-2 | Rev 9/23 | us/wv/snap/dfa-2/2023.09/template.pdf | OK | |

## Mapped templates (stamp check only, not renamed)

Mappings are sha-pinned and append-only, so these folders were only checked, not moved.

| Path | Stamp read | Match |
|---|---|---|
| us/ak/snap/gen-50c/2026.09 | GEN 50C rev 09/26 | yes |
| us/ca/snap/saws2plus/2015.04 | SAWS 2 PLUS (4/15) | yes |
| us/federal/va/21-526ez/2026.01 | JAN 2026 | yes |
| us/federal/va/21p-527ez/2025.12 | DEC 2025 | yes |
| us/mo/snap/im1ss/2024.01 | **FS-1 (09-2026)** on every page | **NO**. The mapping's formVersion is 2024.01 (formCode IM-1SSL). The folder was left alone because a rename would break the pinned mapping. Needs a decision: re-version the mapping as a new directory, or confirm the stamp |
| us/nc/snap/dss-8207/2024.10 | Rev. 10-2024 | yes |
| us/nd/snap/sfn-405/2026.04 | SFN 405 (4-2026) | yes |
| us/nm/veterans/dvs-1/2025.03 | Revised March 2025 | yes |
| us/nv/tanf/2905-eg/2024.12 | 2905 – EG (12-24) | yes |
| us/pa/snap/pa-600/2024.08 | PA 600 8/24 | yes |
| us/wi/snap/f-16019/2024.10 | F-16019 (10/2024) | yes |

## Renames and removals this pass

| From | To | Why |
|---|---|---|
| ar/snap/dco-0004/0000.00 | 2025.06 | p1 R. 06/25 |
| in/snap/sf-53263/0000.00 | 2016.03 | p1 R10 / 3-16 |
| ne/snap/ea-117/0000.00 | 2025.12 | p1 Rev. 12/2025 |
| or/tanf/dhs-0415f/0000.00 | 2025.10 | p1 (10/20/25) |
| sd/tanf/dss-ea-201/0000.00 | 2025.11 | p1 11/2025 |
| de/snap/assist-paper-app/2026.06 | 2016.04 | stamp Form 100 (Rev. 04/2016) |
| la/snap/ofs-4app/2026.01 | 2026.03 | OFS 4APP Rev. 03/26 |
| mt/snap/hcs-250-es/2025.01 | 2025.05 | p1 Rev 05/2025 |
| mn/snap/dhs-5223/2025.03 | 2026.03 | XFA stamp 3-26 |
| mn/snap/dhs-5223/2026.03 (old) | removed | 2.6 KB eDocs **HTML landing page** saved as template.pdf (the eDocs URL serves HTML; the PDF is at `…/DHS-5223-ENG-dform`) |
| oh/snap/jfs-07200/0000.00 | removed | byte-identical duplicate of 2026.00 |
| ut/snap/61app/2025.03 | removed | byte-identical duplicate of 2026.01 (it was never 03/2025) |

## Corrections to the first draft

- **UT**: the draft said the held copy was 03/2025 and needed a 01/2026 refetch. It was already 01/2026.
- **MN**: the draft said 3-25 was held and 3-26 needed a refetch. The held copy was already 3-26, and the refetch saved HTML.
- **OH**: the refetch was byte-identical to the held copy, so no new edition was found.
- **VA**: the placed file is 032-03-1100 (12/22), and it is an application, not a renewal. Whether 0824 still exists as a separate current form is unverified.
- **DE**: the "ASSIST 2026/06" fetch produced Form 100 (04/2016), the very form the draft said ASSIST supersedes.
- **AR**: the stamp *is* printed on p1.
- **AL**: the placed file is not an application at all (see above).

## Conflict resolutions (Task 2), as they stand

| State | Resolution |
|---|---|
| MD | 9701 (Revised 07/2024) placed, per instruction; not 9711 |
| VA | Placed file is 032-03-1100 (12/22), an application. Confirm with VDSS which number is current; the folder code still says 0824 |
| MS | MDHS-EA-900 is current; **not yet fetched** |
| NM | HCA 100 (5.1.2026) placed |
| DE | ASSIST paper application (2026/06) is **still missing**. On disk is Form 100 (04/2016), usable only as the fallback |
| FL | CF-ES 2353 is current; **not yet fetched** |
| GA | 10/2024 placed |
| ME | Held BFI APP01 R10/04; GeneralApp diff **still pending** |
| MI | No direct 1171 PDF; browser task **pending**. Do not substitute the info booklet |
| NJ | WFNJ-1J placed (TANF); HCS-290 SNAP-side **not yet fetched** |
| AZ | FAA-0001A (02/2026) placed |
| ID | HW 2000 **not yet fetched** |

## Skipped per Task 3
Already covered: AK, ND, PA, CA, NV-TANF (mapped). No paper form: WI W-2, MA TAFDC, NH standalone TANF, AL Family Assistance. WIC / Medicaid / LIHEAP are skipped entirely.

## Still missing

| State | Form | Why missing / next step |
|---|---|---|
| AL | DHR-FSP-2116 general FA application | **ACQUIRED 2026-09-17** (Marcos upload; XMP title "FORM 2116 1942 COMBINED"; no printed rev, filed 2026.04) -> us/al/snap/dhr-fsp-2116/2026.04/template.pdf |
| CT | W-1E Rev. 12/19 | Refetch produced no file (preview.ct.egov.com; verify it's DSS-official) |
| DE | ASSIST Paper Application (2026/06) | The URL did not yield it; only Form 100 (04/2016) is on disk |
| FL | CF-ES 2353 | Browser task |
| ID | HW 2000 | **ACQUIRED 2026-09-17** (Marcos upload; stamped "HW 2000 | REV 2/9/2026") -> us/id/snap/hw-2000/2026.02/template.pdf |
| KY | PA-100, as officially served | Held copy is a proposed-regulation markup |
| MA | SNAPA-1 | **ACQUIRED 2026-09-17** (Marcos upload; stamped "SNAPA-1 (English) (Rev. 7/2026)") -> us/ma/snap/snapa-1/2026.07/template.pdf |
| ME | GeneralApp.pdf (diff vs R10/04) | Browser task |
| MI | MDHHS-1171 | **ACQUIRED 2026-09-17** (Marcos upload; stamped "MDHHS-1171 (Rev. 10-25)") -> us/mi/snap/mdhhs-1171/2025.10/template.pdf |
| MS | MDHS-EA-900 | **ACQUIRED 2026-09-17** (Marcos upload; "Revised 7-1-2026") -> us/ms/snap/ea-900/2026.07/template.pdf |
| MT | HCS-250 English | Email request only |
| NJ | HCS-290 | Fetch produced no file |
| NV | 2920-EM | **RESCOPED 2026-09-17**: the on-disk 2905-EG "Application for Assistance" explicitly covers SNAP ("Programs You May Apply For: Food Assistance from SNAP ... TANF"), so NV SNAP is covered. Marcos uploaded a newer 2905-EG (03/2026, 23pp); NOT auto-filed — the active nv/tanf/2905-eg mapping is pinned to 2024.12. Re-pin/re-map only on his call |
| OK | 08MP002E + 08MP003E | Companion forms to 001E |
| TX | H1010 | **ACQUIRED 2026-09-17** (Marcos upload; "Your Texas Benefits", H1010 markers, 08/2026) -> us/tx/snap/h1010/2026.08/template.pdf |
| WY | DFS 100 | Non-.gov host; verify on dfs.wyo.gov first |
| NY | LDSS-4826 (optional SNAP-only) | Fetch produced no file |
| federal | VA 10-10EZ | Fetch produced no file |

URL health: the key URLs for LA, NH, WV, NM and AR were superseded. The DE "ASSIST" URL and the MN eDocs landing URL do not return the intended PDF. The KY PA-100 URL is a proposed-regulation draft. WY is hosted off .gov, and the MD host is intermittently down.
