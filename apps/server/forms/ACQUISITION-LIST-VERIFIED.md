# Benefits Form Acquisition List — Verified Answer Key (2026-09-17)

Six independent research passes verified every form below against official state sources.
**Use this as the answer key.** Where two passes found different forms for the same
state, the conflict is flagged — resolve the FLAG before mapping.

Conventions for placement (mirror the existing tree):
`apps/server/forms/us/<state-code>/<program>/<form-slug>/<revision-YYYY.MM>/template.pdf`
Federal: `apps/server/forms/us/federal/<agency>/<form-slug>/<revision>/template.pdf`

Already mapped and active — do NOT re-fetch: SNAP for AK, CA, MO, NC, ND, PA, WI;
TANF for NV; federal VA 21-526EZ and 21P-527EZ; NM veterans DVS-1.

---

## 1. No new PDF needed — already-mapped forms that cover the program

| State | Program | Already-mapped form |
|---|---|---|
| NV | SNAP | 2905-EG covers SNAP + TANF (mapped, active) |
| AK | TANF | GEN-50C "Application for Services" covers SNAP + Medicaid + ATAP/TANF (mapped, active) |
| ND | TANF | SFN 405 "Application for Economic Assistance Programs" is an allowable TANF application per TANF manual §400-19-20-10 (mapped, active) |
| PA | TANF | PA-600 "Pennsylvania Application for Benefits" is required for cash assistance (mapped, active) |
| CA | TANF | SAWS 2 PLUS covers CalWORKs/TANF + CalFresh + Medi-Cal (mapped, active) |

## 2. SNAP PDFs to fetch (43 states)

| State | Form no. | Title | Agency | Rev | PDF URL | Covers | Flags |
|---|---|---|---|---|---|---|---|
| AL | DHR-FSP-2116 | Food Assistance Application | AL Dept of Human Resources | 10/2025 | https://dhr.alabama.gov/wp-content/uploads/2025/11/Form-2116-1942-Combined-Rev-10-2025.pdf | SNAP | — |
| AZ | FAA-1740A | AZSNAP Application | AZ DES | 8-21 | Mirror: https://data.templateroller.com/pdf_docs/2209/22096/2209685/main_form-faa-1740a-azsnap-application-arizona.pdf — official copy at des.az.gov/documents-center (search "FAA-1740A") | SNAP | No verified official direct URL |
| AR | DCO-0215 | Application for SNAP and TEA | AR DHS | 4/2020 | http://dws.arkansas.gov/wp-content/uploads/Application_for_SNAP_and_TEA_DCO-0215.pdf | SNAP + TEA (TANF) | — |
| CO | (none) | Application for Public Assistance | CO HCPF + DHS | 10/2024 | https://hcpf.colorado.gov/sites/hcpf/files/Colorado Application For Public Assistance - English - Large Print.pdf | SNAP + CO Works (TANF) + Medical | Large-print edition, same content |
| CT | W-1E | Application for Benefits | CT DSS | 12/19 | https://preview.ct.egov.com/-/media/dss-beta/pdf/food-assistance/w-1e-rev-12-19-w-w0016rr-rev-01_23-english---latest.pdf | SNAP + Cash + Medical | — |
| DE | Form 100 | Application for Food Benefits, Cash, Medical, and Child Care Assistance | DE DHSS | 04/2016 | https://www.dhss.delaware.gov/dhss/dss/files/Form100_Application_42016ENGLISH.pdf | SNAP + Cash + Medical + Child Care | Newer ASSIST paper app exists (2026): https://dhss.delaware.gov/wp-content/uploads/sites/2/2026/06/ASSIST-Paper-Application-English.pdf — confirm which is current |
| FL | CF-ES 2353 | Government Assistance Application | FL DCF | — | Forms page: https://prod.myflfamilies.com/services/public-assistance/additional-resources-and-services/ess-forms | SNAP + TCA (TANF) + Medicaid | No direct PDF captured; also CF-ES 2337 (11/2011) at https://www.flrules.org/gateway/readRefFile.asp?refId=981&filename=ACCESS Florida Application CF-ES 2337 112011.pdf — reconcile 2353 vs 2337; a newer Aug 2016 edition exists |
| GA | Form 297 | Application for Benefits | GA DHS / DFCS | 7/2023 (10/2024 seen) | https://dfcs.georgia.gov/document/document/297-english-large-print/download | SNAP + TANF + Medicaid + more | Take latest revision (10/2024) |
| HI | DHS 1240 | Application for Financial and SNAP Assistance | HI DHS | 12/2024 | https://humanservices.hawaii.gov/bessd/files/2025/01/DHS-1240-Application-for-Financial-and-SNAP-Assistance-REV-12-2024-Final.pdf | SNAP + Financial (TANF) | — |
| ID | HW2000 | Application for Assistance | ID DHW | 03/14/2022 | Mirror: https://img1.wsimg.com/blobby/go/25e644a1-9477-4298-84d4-d1ae91c95dae/downloads/Application%20For%20Assistance.pdf | SNAP + Cash (TAFI/TANF) + Medical + Child Care | No verified official direct URL; cited official path: healthandwelfare.idaho.gov/sites/default/files/2020-08/HW2000_Application%20For%20Assistance.pdf |
| IL | IL444-2378B | Request for Cash Assistance — Medical Assistance — SNAP | IL DHS | R-03-24 | https://www.dhs.state.il.us/onenetlibrary/12/documents/Forms/442378B-202305-IES.pdf | Cash + Medical + SNAP | — |
| IN | State Form 53263 / DFR 2512 | Indiana Application for SNAP and Cash Assistance | IN FSSA | R10 / 3-16 | https://forms.in.gov/download.aspx?id=12306 | SNAP + Cash (TANF) | — |
| IA | 470-0462 | Food and Financial Support Application | IA HHS | 09/2024 (05/25 seen) | https://hhs.iowa.gov/media/4531/download | SNAP + FIP (TANF) + RCA | Confirm latest rev (05/25) |
| KS | ES-3100 | Application for Benefits | KS DCF | 10-25 | http://content.dcf.ks.gov/ees/KEESM/Forms/ES-3100.pdf | SNAP + TANF + Child Care + Medical | — |
| KY | (none; 10/18) | Application for SNAP | KY CHFS | 10/18 | https://kynect.ky.gov/benefits/resource/1698435157000/sspSnapAsserts/SNAPApplicationEnglish.pdf | SNAP | — |
| LA | OFS 4APP | Application for Assistance | LA Dept. of Health | 10/25 | https://ldh.la.gov/assets/SNAP/OFS-4APP.pdf | FITAP (TANF) + KCSP + SNAP | — |
| ME | (none; "GeneralApp") | Application for Benefits | ME DHHS / OFI | — | https://www.maine.gov/dhhs/sites/maine.gov.dhhs/files/inline-files/GeneralApp.pdf | SNAP + MaineCare + TANF + more | TANF pass found "OFI Application for Services": https://www.maine.gov/dhhs/ofi/applications-forms/Family%20Independence%20Admin/Application-for-Services.pdf — reconcile whether these are the same form |
| MD | DHS/FIA 9711 | Request for Assistance | MD DHS | 3/2023 | https://dhs.maryland.gov/documents/DHS%20Forms/FIA%20Forms/English/To-Apply-for-Assistance/2--Fill-Out-App-for-Assistance/9711%20E-%20ESAP%20Simplified%20Application%20Revised%20April%202023%20English.pdf | SNAP + Cash + Medical | TANF pass recommends the 9701 LONG form (7.18.2024), not 9711: https://www.dhr.maryland.gov/documents/DHS%20Forms/FIA%20Forms/English/To-Apply-for-Assistance/2--Fill-Out-App-for-Assistance/9701-DHS-FIA-Application-for-Assistance-7.18.2024.pdf — map 9701 |
| MA | SNAPA-1 | Massachusetts SNAP Benefits Application | MA DTA | 7/2026 | https://Www.mass.gov/doc/snap-benefit-application/download | SNAP | — |
| MI | MDHHS-1171 | Assistance Application | MI MDHHS | — | Forms page: https://www.michigan.gov/mdhhs/doing-business/forms/food-assistance/assistance-application-mdhhs-1171 | Combined (program supplements) | Direct application-PDF URL unverified; official info booklet: https://www.michigan.gov/mdhhs/-/media/Project/Websites/mdhhs/Folder1/Folder101/MDHHS1171INFO-1022-web.pdf |
| MN | DHS-5223-ENG | Combined Application Form | MN DHS | 3-26 | https://edocs.dhs.state.mn.us/lfserver/Public/DHS-5223-ENG-pform?tg1=null&tg3=crm-guide_crm-1pe | SNAP + Cash + Emergency + Housing Support | — |
| MS | MDHS-EA-900 | TANF Application / SNAP Application | MS MDHS | 7-1-2026 | http://www.mdhs.ms.gov/document/tanf-and-snap-900-application-en/ | SNAP + TANF | TANF pass found MDHS-EA-302: https://www.mdhs.ms.gov/wp-content/uploads/2022/01/MDHS-EA-302.pdf — verify which is current |
| MT | DPHHS-HCS-250 | Application for Assistance | MT DPHHS | 01/15/2025 | Spanish direct: https://dphhs.mt.gov/assets/hcsd/HCS250Spanish01152025.pdf | SNAP + TANF + LIHEAP + Health Coverage | NO downloadable English PDF — English is email-request only via dphhs.mt.gov/hcsd/SNAP |
| NE | EA-117 | Application for (Economic Assistance) Benefits | NE DHHS | 12/2025 (4/2016 seen) | https://public-dhhs.ne.gov/forms/displaypdf.aspx?item=378 | SNAP + ADC (TANF) + more | Confirm latest rev |
| NH | BFA Form 800 | Application for Assistance | NH DHHS | 03/24 | https://www.dhhs.nh.gov/sites/g/files/ehbemt476/files/documents/2021-11/bfa-800.pdf ; official apply page: https://dhhs.nh.gov/apply-assistance | All assistance incl. SNAP | Confirm current rev from official apply page |
| NJ | WFNJ-1J | Application and Affidavit for Public Assistance | NJ DHS | 08/17 | https://www.nj.gov/humanservices/njsnap/docs/wfnj-1j/WFNJ-1JEnglish.pdf | Public Assistance + NJ SNAP | TANF pass found HCS-290 combined: https://www.nj.gov/humanservices/njsnap/docs/njsnap-combined-application.pdf — reconcile WFNJ-1J vs HCS-290 |
| NM | HSD100 | Application for Assistance | NM HSD / HCA | 02/13/2014 | http://hca.nm.gov/wp-content/uploads/NM-Streamline-Application-1.pdf | SNAP + Medicaid + Cash (NMWorks) + LIHEAP | TANF pass found "Yes, New Mexico" app: https://www.hsd.state.nm.us/wp-content/uploads/YesNMapp.pdf — verify which is current (2014 form may be stale) |
| NY | LDSS-4826 | SNAP Application/Recertification | NY OTDA | 12/23 | http://otda.ny.gov/programs/applications/4826-DD.pdf | SNAP | — |
| OH | JFS 07200 | SNAP, Cash, Medical, and/or ECE Assistance Application | OH ODJFS | /2026 (6/2025 seen) | http://www.odjfs.state.oh.us/forms/num/JFS07200/pdf/ | SNAP + Cash + Medical + Child Care | Confirm latest rev |
| OK | 08MP001E | Request for Benefits | OK OKDHS | 4/14/2026 | https://Oklahoma.gov/content/dam/ok/en/okdhs/documents/searchcenter/okdhsformresults/08mp001e.pdf | SNAP + TANF + SoonerCare + more | Full paper packet = 08MP001E + 08MP002E + 08MP003E |
| OR | DHS 7476 | ERDC and SNAP Application | OR ODHS | 03/2026 | https://sharedsystems.dhsoha.state.or.us/DHSForms/Served/de7476.pdf | SNAP + ERDC (child care) | TANF cash is on DHS 0415F: https://sharedsystems.dhsoha.state.or.us/DHSForms/Served/de0415F.pdf — fetch both |
| RI | DHS-2 | Application for Assistance | RI DHS | 09-16 | https://dhs.ri.gov/media/371/download?language=en | RIW (TANF) + SNAP + Medicaid + more | — |
| SC | DSS Form 3800 | Application for SNAP, TANF, and/or RCA | SC DSS | NOV 25 | https://dss.sc.gov/media/iuekqhs2/dss-form-3800-nov-25-eng.pdf | SNAP + TANF + RCA | Take NOV 25 rev (April 2024 also seen) |
| SD | DSS-EA-301 | Economic Assistance Application | SD DSS | 11/25 | http://Dss.Sd.Gov/formsandpubs/docs/GEN/301Application.pdf | SNAP + Medicaid + TANF | Standalone TANF form DSS-EA-201 also exists: http://DSS.SD.GOV/docs/economicassistance/vote/TANF_Application.pdf |
| TN | HS-0169 | Family Assistance Application | TN DHS | 05-17 | https://www.tn.gov/content/dam/tn/human-services/hs/HS-0169_Combined_FA_Application_and_Statement_of_Understanding_-_Program.pdf | SNAP + Families First (TANF) | — |
| TX | Form H1010 | Application for benefits | TX HHSC | 06/2022 | https://assets-us-01.kc-usercontent.com/a02766b8-a11d-0063-d80b-f4973f64aa76/9e6c6a4c-0661-4365-a3dd-ee817c856c58/H1010_June_22_LATEST_FINAL.pdf | SNAP + TANF + Medicaid/CHIP | Prefer an hhs.texas.gov-hosted copy over the Kentico CDN |
| UT | DWS-ESD 61APP | Application for SNAP, Financial Assistance, Child Care, and Medical Assistance | UT DWS | 01/2026 | https://jobs.utah.gov/forms/61app.pdf | SNAP + Financial (TANF) + Child Care + Medical | Take 01/2026 rev |
| VT | Form 202 | Application for Benefits | VT DCF | 10/2025 | https://outside.vermont.gov/dept/DCF/Shared%20Documents/ESD/Forms/202.pdf | 3SquaresVT (SNAP) + Reach Up (TANF) + Fuel Assistance | — |
| VA | 032-03-0824-37-eng | Application for Benefits | VA DSS | — | https://dss.es.virginia.gov/media/vdss/benefit-programs/documents/032-03-0824-37-eng.pdf | SNAP + TANF + more | Use 032-03-0824 for the APPLICATION — 032-03-1100 is renewal-only |
| WA | DSHS 14-001 | Application for Food and Cash Assistance | WA DSHS | 08/2025 | https://www.dshs.wa.gov/sites/default/files/forms/pdf/14-001.pdf | Food (SNAP) + Cash (TANF) + Child Care | — |
| WV | DFA-2 | Application for Benefits | WV DHS | 9/16 | https://dhhr.wv.gov/bcf/Services/familyassistance/Documents/DFA_2%20Rev%209_16.pdf | SNAP + WV WORKS (TANF) + Medicaid + LIEAP + more | Take Rev 9/16 (newer than the 1/2014 printing) |
| WY | DFS 100 | Application for Assistance | WY DFS | 8/2025 | https://drive.google.com/uc?export=download&id=1LGhv11vrV3ecd4oq8jSiHS6iIyCD-d | SNAP + POWER (TANF) | Hosted on DFS's Google Drive (no .gov PDF); confirm latest rev (10/19 also seen) |

## 3. TANF-only PDFs to fetch (states where TANF needs its own form)

Most states' TANF rides the combined form in §2. These need separate handling:

| State | Form no. | Title | Agency | Rev | PDF URL | Notes |
|---|---|---|---|---|---|---|
| KY | PA-100 | Application/Recertification for KTAP or Kinship Care | KY CHFS | 09/22 | https://www.chfs.ky.gov/agencies/dcbs/Documents/pa100proposed.pdf | Standalone TANF (KTAP); KY SNAP is a separate form |
| MO | IM-1TA (MO 886-4573) | Application for Temporary Assistance Cash Benefits | MO DSS | 1-2025 | https://dssmanuals.mo.gov/wp-content/uploads/2020/09/im-1ta.pdf | Standalone TANF; MO SNAP already mapped |
| LA | (none; "1-2021") | ADC Application for Assistance Form | LA DCFS | 1-2021 | https://www.dcfs.louisiana.gov/assets/docs/searchable/DES/ADC_Application_for_Assistance_1-2021.pdf | FITAP (TANF) + SNAP + KCSP — reconcile with OFS 4APP (§2) |
| AZ | FAA-0001A | Application for Benefits | AZ DES | eff. 02/01/2026 | No direct URL — DES Documents Center: des.az.gov/documents-center (search "FAA-0001A") | Combined incl. TANF cash |
| AR | DCO-0004 | Application for SNAP, Health Care, and TEA/RCA Benefits | AR DHS | R06/25 | No direct English URL — official forms page: humanservices.arkansas.gov/divisionssharedservices/countyoperations/formsdocuments/ | SNAP + TEA (TANF) + Medicaid + RCA |
| NC | (workbook, no form #) | Work First Cash Assistance Application and Review Documentation Workbook | County DSS / NCDHHS | current | Best available: https://hhs.nhcgov.com/DocumentCenter/View/12282/TANF-Work-First-Application?bidId= | WEAK LINK — county-hosted; no ncdhhs.gov PDF found |

## 4. No paper form exists — product decision needed, not more searching

| State/Program | Situation |
|---|---|
| WI TANF (W-2) | No standalone paper application. Apply via ACCESS portal or in-person at a W-2 agency (W-2 manual §1.4.3) |
| MA TANF (TAFDC) | Online (DTAConnect), phone, or in-person only. No downloadable paper form |
| NH TANF | NH EASY portal or paper by request from a District Office. No downloadable PDF |
| AL TANF (Family Assistance) | Online at dhr.alabama.gov or in-person at county DHR. No paper FA application published |
| MT SNAP (English) | English paper PDF is email-request only; Spanish PDF downloads directly |

## 5. VA Health Care — one federal form

VA Form 10-10EZ, "Application for Health Benefits" (Instructions and Enrollment Application),
rev. February 2025. Download: https://www.va.gov/forms/10-10ez/ — covers all states.

## 6. WIC / Medicaid / LIHEAP — no per-state paper PDFs to fetch

- **WIC**: no standard application form exists; enrollment is in person at a local WIC clinic. Recommend removing from the autofill picker or linking to a clinic finder.
- **Medicaid**: most states route through their own portal or healthcare.gov; no consistent per-state paper form. Defer.
- **LIHEAP**: every state runs its own separate application — a second 50-state research project if wanted. Defer unless prioritized.
