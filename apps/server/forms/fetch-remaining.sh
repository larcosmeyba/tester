#!/usr/bin/env bash
# Fetch the remaining forms (resolved URLs from ACQUISITION-REPORT.md). Run from repo root.
UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15"
g(){ mkdir -p "$(dirname "$1")"; curl -sS -L --fail --retry 2 -A "$UA" -o "$1" "$2" && echo "OK   $1" || echo "FAIL $1"; }
F=apps/server/forms/us
# Direct URLs
# NOTE: this URL yielded Form 100 (Rev. 04/2016), now at 2016.04; not the ASSIST app
g $F/de/snap/assist-paper-app/2026.06/template.pdf "https://dhss.delaware.gov/wp-content/uploads/sites/2/2026/06/ASSIST-Paper-Application-English.pdf"
g $F/il/snap/il444-2378b/2024.03/template.pdf "https://www.dhs.state.il.us/onenetlibrary/12/documents/Forms/442378B-202305-IES.pdf"
g $F/in/snap/sf-53263/2016.03/template.pdf "https://forms.in.gov/download.aspx?id=12306"
g $F/ky/snap/kynect-snap-app/2018.10/template.pdf "https://kynect.ky.gov/benefits/resource/1698435157000/sspSnapAsserts/SNAPApplicationEnglish.pdf"
g $F/ky/tanf/pa-100/2022.09/template.pdf "https://www.chfs.ky.gov/agencies/dcbs/Documents/pa100proposed.pdf"
g $F/la/snap/ofs-4app/2026.03/template.pdf "https://ldh.la.gov/assets/SNAP/Applications/OFS-4APP.pdf"
g $F/md/snap/9701/2024.07/template.pdf "https://dhs.maryland.gov/documents/DHS%20Forms/FIA%20Forms/English/To-Apply-for-Assistance/2--Fill-Out-App-for-Assistance/9701-DHS-FIA-Application-for-Assistance-7.18.2024.pdf"
g $F/ma/snap/snapa-1/2026.07/template.pdf "https://www.mass.gov/doc/snap-benefit-application/download"
g $F/mo/tanf/im-1ta/2025.01/template.pdf "https://dssmanuals.mo.gov/wp-content/uploads/2020/09/im-1ta.pdf"
g $F/mt/snap/hcs-250-es/2025.05/template.pdf "https://dphhs.mt.gov/assets/hcsd/HCS250Spanish01152025.pdf"
g $F/ne/snap/ea-117/2025.12/template.pdf "https://public-dhhs.ne.gov/forms/displaypdf.aspx?item=378"
g $F/nj/snap/wfnj-1j/2017.08/template.pdf "https://www.nj.gov/humanservices/njsnap/docs/wfnj-1j/WFNJ-1JEnglish.pdf"
g $F/nj/snap/hcs-290/0000.00/template.pdf "https://www.nj.gov/humanservices/njsnap/docs/njsnap-combined-application.pdf"
g $F/nv/snap/2920-em/2026.01/template.pdf "https://www.dss.nv.gov/siteassets/dwss.nv.gov/content/home/features/forms/2920-EM_Application_for_Assistance_Medicaid-MAABD-SNAP.pdf"
g $F/ok/snap/08mp001e/2026.04/template.pdf "https://oklahoma.gov/content/dam/ok/en/okdhs/documents/searchcenter/okdhsformresults/08mp001e.pdf"
g $F/or/snap/dhs-7476/2026.03/template.pdf "https://sharedsystems.dhsoha.state.or.us/DHSForms/Served/de7476.pdf"
g $F/id/snap/hw-2000/2022.03/template.pdf "https://healthandwelfare.idaho.gov/sites/default/files/2020-08/HW2000_Application%20For%20Assistance.pdf"
g $F/ct/snap/w-1e/2019.12/template.pdf "https://preview.ct.egov.com/-/media/dss-beta/pdf/food-assistance/w-1e-rev-12-19-w-w0016rr-rev-01_23-english---latest.pdf"
g $F/ut/snap/61app/2026.01/template.pdf "https://jobs.utah.gov/forms/61app.pdf"
g $F/oh/snap/jfs-07200/2026.00/template.pdf "https://www.odjfs.state.oh.us/forms/num/JFS07200/pdf/"
g $F/mn/snap/dhs-5223/2026.03/template.pdf "https://edocs.dhs.state.mn.us/lfserver/Public/DHS-5223-ENG-dform"  # bare URL serves an HTML landing page
g $F/sd/tanf/dss-ea-201/2025.11/template.pdf "https://dss.sd.gov/docs/economicassistance/vote/TANF_Application.pdf"
g $F/ny/snap/ldss-4826/2023.12/template.pdf "https://otda.ny.gov/programs/applications/4826-DD.pdf"
g $F/federal/va/10-10ez/2025.02/template.pdf "https://www.va.gov/vaforms/medical/pdf/10-10EZ-fillable.pdf"
cat <<'EOT'
BROWSER TASKS (robot-blocked or page-only; save named form to path):
  AZ FAA-0001A         -> us/az/snap/faa-0001a/2026.02/  (already placed from library; refetch only if hash-checking) via https://des.az.gov/sites/default/files/dl/FAA-0001A.pdf
  FL CF-ES 2353        -> us/fl/snap/cf-es-2353/<rev>/   via https://prod.myflfamilies.com (ESS forms page)
  MI MDHHS-1171        -> us/mi/snap/mdhhs-1171/<rev>/   via https://www.michigan.gov/mdhhs (forms; the media link in the key is the INFO BOOKLET - do not use it as the application)
  MS MDHS-EA-900       -> us/ms/snap/ea-900/2026.07/     via http://www.mdhs.ms.gov/document/tanf-and-snap-900-application-en/
  TX H1010             -> us/tx/snap/h1010/<rev>/        via https://www.hhs.texas.gov (form H1010 page; avoid the Kentico CDN link)
  WY DFS 100           -> us/wy/snap/dfs-100/2025.08/    via https://dfs.wyo.gov (SNAP how-to-apply; file is Google-Drive-hosted - verify on the .gov page first)
  ME GeneralApp        -> diff vs us/me/snap/long-form/  via https://www.maine.gov/dhhs/.../GeneralApp.pdf ; keep newest
  MT English HCS-250   -> email request per dphhs.mt.gov/hcsd/SNAP (English PDF not downloadable)
After each save: verify the revision stamp on page 1, rename the <rev> folder to match, update ACQUISITION-REPORT.md.
EOT
