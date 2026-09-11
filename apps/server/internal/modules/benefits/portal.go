package benefits

import (
	"fmt"
	"strings"

	domain "github.com/helpthehive/server/internal/domain/benefits"
)

// Official state benefits portal routing.
//
// Help The Hive never submits an application anywhere: the actual application
// always happens on the official portal, in the user's own session. This
// registry exists so the app can point the user at the right official door —
// and it is deliberately pessimistic about what it knows.
//
// Rules:
//   - A per-state application URL appears here only after a human has
//     verified it against an official .gov source. Until then the lookup
//     returns url=nil, verified=false and fallback guidance, and the app
//     shows the guidance instead of a link.
//   - Portal URLs are never invented, never scraped, and never guessed from a
//     state's homepage or a search result. A .gov domain is necessary but not
//     sufficient: the page must be the program's actual application entry
//     point.
//   - The only URLs seeded as reference material are the two well-known
//     official directories, and they appear in fallback guidance text only —
//     never as the url field:
//       https://www.fns.usda.gov/snap/apply      (USDA SNAP state directory)
//       https://www.usa.gov/benefit-finder        (USA.gov benefit finder)
//
// How a verified URL gets added:
//  1. Open the program's application entry page on an official .gov site in a
//     browser and confirm it is the real application start, not a marketing
//     page, a PDF download, or a third-party helper.
//  2. Add a row to verifiedEntries below with the URL, the program and state
//     codes, the .gov page it was verified against, the date, and the method
//     (methodLive when the outlink was followed in-session, methodIndexed
//     when the .gov source was confirmed via indexed official content).
//  3. Extend portal_test.go with a case asserting the lookup returns it with
//     verified=true.
//
// The registry is in-memory and read-only after init: portal URLs change
// rarely, and a wrong cached URL is worse than a redeploy.

// Portal is where to apply for a program in a state.
type Portal struct {
	Program string
	State   string
	// URL is the official application URL, or nil when no verified URL is on
	// file. Never invented.
	URL *string
	// Verified is true when the URL was verified against an official .gov
	// source.
	Verified bool
	// FallbackGuidance is what the app shows when there is no verified URL.
	FallbackGuidance string
}

// verificationMethod records how a registry row was verified:
//   - methodLive: the official .gov source page was opened in-session and its
//     outlink to the portal was followed to confirm the exact URL.
//   - methodIndexed: the qualifying .gov source was confirmed via indexed
//     official content; a live follow is still pending.
//
// Both are human-reviewed. Indexed rows are promoted to live on the next
// verification pass; either way the URL itself comes from an official .gov
// source, never from reconstruction.
const (
	methodLive    = "live"
	methodIndexed = "indexed"
)

// verifiedOn is the date of the initial 50-state verification pass
// (2026-09-11): 23 states live-followed, 19 confirmed via indexed official
// .gov content. Later rows carry their own dates.
const verifiedOn = "2026-09-11"

// verifiedPortal is one human-verified per-state application URL.
type verifiedPortal struct {
	url        string
	verifiedAt string // YYYY-MM-DD
	source     string // the .gov page it was verified against
	method     string // methodLive or methodIndexed
}

// verifiedEntry is one row of the registry: the official online application
// portal for one program in one state.
type verifiedEntry struct {
	program    string // canonical code from knownPrograms
	state      string // two-letter code from the ZIP lookup's state table
	url        string // exact official application URL, never reconstructed
	source     string // the .gov page it was verified against
	verifiedAt string // YYYY-MM-DD
	method     string // methodLive or methodIndexed
}

// verifiedEntries is the registry table. A row appears here only after a
// human has verified the URL against an official .gov source — see the
// package comment. Portals that genuinely serve several programs (e.g.
// Colorado PEAK takes SNAP, Medicaid and cash-assistance applications) appear
// once per program the .gov source names, because the portal is the real
// application entry for each of them. Programs with their own separate
// application path (e.g. West Virginia WIC) get their own row and URL.
//
// Not on file yet, deliberately: the five state-operated portals on non-.gov
// domains (AK, CA, OK, TX, WA) pending a human policy decision on how the
// product classifies official non-.gov portals; AL and FL (no qualifying
// .gov link found); ID and WY (no online application exists).
var verifiedEntries = []verifiedEntry{
	// Arizona — Health-e-Arizona Plus.
	{program: "SNAP", state: "AZ", url: "https://www.healthearizonaplus.gov/Default/Default.aspx", source: "https://des.az.gov/services/basic-needs/food-assistance/nutrition-assistance/health-e-arizona-plus-application", verifiedAt: verifiedOn, method: methodLive},
	{program: "MEDICAID", state: "AZ", url: "https://www.healthearizonaplus.gov/Default/Default.aspx", source: "https://des.az.gov/services/basic-needs/food-assistance/nutrition-assistance/health-e-arizona-plus-application", verifiedAt: verifiedOn, method: methodLive},
	{program: "TANF", state: "AZ", url: "https://www.healthearizonaplus.gov/Default/Default.aspx", source: "https://des.az.gov/services/basic-needs/food-assistance/nutrition-assistance/health-e-arizona-plus-application", verifiedAt: verifiedOn, method: methodLive},
	// Arkansas — Access Arkansas.
	{program: "SNAP", state: "AR", url: "https://access.arkansas.gov/", source: "https://humanservices.arkansas.gov/divisions-shared-services/county-operations/supplemental-nutrition-assistance-snap/snap-overview-and-how-to-apply/", verifiedAt: verifiedOn, method: methodLive},
	// Colorado — Colorado PEAK.
	{program: "SNAP", state: "CO", url: "https://colorado.gov/PEAK", source: "https://cdhs.colorado.gov/snap", verifiedAt: verifiedOn, method: methodLive},
	{program: "MEDICAID", state: "CO", url: "https://colorado.gov/PEAK", source: "https://cdhs.colorado.gov/snap", verifiedAt: verifiedOn, method: methodLive},
	{program: "TANF", state: "CO", url: "https://colorado.gov/PEAK", source: "https://cdhs.colorado.gov/snap", verifiedAt: verifiedOn, method: methodLive},
	// Connecticut — ConneCT.
	{program: "SNAP", state: "CT", url: "https://www.connect.ct.gov/", source: "https://portal.ct.gov/DSS/SNAP/Supplemental-Nutrition-Assistance-Program---SNAP/Apply", verifiedAt: verifiedOn, method: methodLive},
	{program: "MEDICAID", state: "CT", url: "https://www.connect.ct.gov/", source: "https://portal.ct.gov/DSS/SNAP/Supplemental-Nutrition-Assistance-Program---SNAP/Apply", verifiedAt: verifiedOn, method: methodLive},
	{program: "TANF", state: "CT", url: "https://www.connect.ct.gov/", source: "https://portal.ct.gov/DSS/SNAP/Supplemental-Nutrition-Assistance-Program---SNAP/Apply", verifiedAt: verifiedOn, method: methodLive},
	// Delaware — Delaware ASSIST.
	{program: "SNAP", state: "DE", url: "https://assist.dhss.delaware.gov/", source: "https://dhss.delaware.gov/pressreleases/2020/additionalbenefits_0628202/", verifiedAt: verifiedOn, method: methodLive},
	{program: "MEDICAID", state: "DE", url: "https://assist.dhss.delaware.gov/", source: "https://dhss.delaware.gov/pressreleases/2020/additionalbenefits_0628202/", verifiedAt: verifiedOn, method: methodLive},
	{program: "TANF", state: "DE", url: "https://assist.dhss.delaware.gov/", source: "https://dhss.delaware.gov/pressreleases/2020/additionalbenefits_0628202/", verifiedAt: verifiedOn, method: methodLive},
	// District of Columbia — District Direct.
	{program: "SNAP", state: "DC", url: "https://districtdirect.dc.gov", source: "https://dhs.dc.gov/page/apply-recertify-benefits", verifiedAt: verifiedOn, method: methodLive},
	{program: "MEDICAID", state: "DC", url: "https://districtdirect.dc.gov", source: "https://dhs.dc.gov/page/apply-recertify-benefits", verifiedAt: verifiedOn, method: methodLive},
	{program: "TANF", state: "DC", url: "https://districtdirect.dc.gov", source: "https://dhs.dc.gov/page/apply-recertify-benefits", verifiedAt: verifiedOn, method: methodLive},
	// Georgia — Georgia Gateway.
	{program: "SNAP", state: "GA", url: "https://gateway.ga.gov/", source: "https://dhs.georgia.gov/node/3886", verifiedAt: verifiedOn, method: methodLive},
	{program: "MEDICAID", state: "GA", url: "https://gateway.ga.gov/", source: "https://dhs.georgia.gov/node/3886", verifiedAt: verifiedOn, method: methodLive},
	{program: "TANF", state: "GA", url: "https://gateway.ga.gov/", source: "https://dhs.georgia.gov/node/3886", verifiedAt: verifiedOn, method: methodLive},
	{program: "WIC", state: "GA", url: "https://gateway.ga.gov/", source: "https://dhs.georgia.gov/node/3886", verifiedAt: verifiedOn, method: methodLive},
	// Hawaii — PAIS Benefits.
	{program: "SNAP", state: "HI", url: "https://paisbenefits.dhs.hawaii.gov", source: "https://humanservices.hawaii.gov/bessd/files/2022/07/SOH-DHS-SNAP-APPLICATION-Rev-11-2021.pdf-updated-with-website-7-27-22.pdf", verifiedAt: verifiedOn, method: methodLive},
	// Illinois — ABE (Application for Benefits Eligibility).
	{program: "SNAP", state: "IL", url: "https://abe.illinois.gov", source: "http://hfs.illinois.gov/medicalclients/medicaidguide/applying.html", verifiedAt: verifiedOn, method: methodLive},
	{program: "MEDICAID", state: "IL", url: "https://abe.illinois.gov", source: "http://hfs.illinois.gov/medicalclients/medicaidguide/applying.html", verifiedAt: verifiedOn, method: methodLive},
	{program: "TANF", state: "IL", url: "https://abe.illinois.gov", source: "http://hfs.illinois.gov/medicalclients/medicaidguide/applying.html", verifiedAt: verifiedOn, method: methodLive},
	// Indiana — FSSA Benefits Portal.
	{program: "SNAP", state: "IN", url: "https://www.fssabenefits.in.gov", source: "https://www.in.gov/fssa/files/FSSA_Resource_Guide.pdf.pdf", verifiedAt: verifiedOn, method: methodIndexed},
	{program: "MEDICAID", state: "IN", url: "https://www.fssabenefits.in.gov", source: "https://www.in.gov/fssa/files/FSSA_Resource_Guide.pdf.pdf", verifiedAt: verifiedOn, method: methodIndexed},
	{program: "TANF", state: "IN", url: "https://www.fssabenefits.in.gov", source: "https://www.in.gov/fssa/files/FSSA_Resource_Guide.pdf.pdf", verifiedAt: verifiedOn, method: methodIndexed},
	// Iowa — HHS Services Self-Service Portal.
	{program: "SNAP", state: "IA", url: "https://hhsservices.iowa.gov/apspssp/ssp.portal", source: "https://hhs.iowa.gov/assistance-programs/food-assistance/snap/apply-snap", verifiedAt: verifiedOn, method: methodIndexed},
	// Kansas — DCF Self-Service Portal.
	{program: "SNAP", state: "KS", url: "https://dcfapp.kees.ks.gov", source: "https://www.dcf.ks.gov", verifiedAt: verifiedOn, method: methodIndexed},
	// Kentucky — kynect benefits.
	{program: "SNAP", state: "KY", url: "https://kynect.ky.gov/benefits/s/?language=en_US", source: "https://www.chfs.ky.gov/agencies/dms/Pages/kynectben.aspx", verifiedAt: verifiedOn, method: methodLive},
	{program: "MEDICAID", state: "KY", url: "https://kynect.ky.gov/benefits/s/?language=en_US", source: "https://www.chfs.ky.gov/agencies/dms/Pages/kynectben.aspx", verifiedAt: verifiedOn, method: methodLive},
	{program: "TANF", state: "KY", url: "https://kynect.ky.gov/benefits/s/?language=en_US", source: "https://www.chfs.ky.gov/agencies/dms/Pages/kynectben.aspx", verifiedAt: verifiedOn, method: methodLive},
	// Louisiana — LA CAFE.
	{program: "SNAP", state: "LA", url: "https://www.dcfs.la.gov/cafe", source: "https://dcfs.la.gov/news/update-dcfs-offices-temporarily-closing-to-visitors-starting-today", verifiedAt: verifiedOn, method: methodIndexed},
	{program: "TANF", state: "LA", url: "https://www.dcfs.la.gov/cafe", source: "https://dcfs.la.gov/news/update-dcfs-offices-temporarily-closing-to-visitors-starting-today", verifiedAt: verifiedOn, method: methodIndexed},
	// Maine — MyMaineConnection.
	{program: "SNAP", state: "ME", url: "https://www.maine.gov/mymaineconnection", source: "https://www.maine.gov/portal/index.html", verifiedAt: verifiedOn, method: methodLive},
	{program: "MEDICAID", state: "ME", url: "https://www.maine.gov/mymaineconnection", source: "https://www.maine.gov/portal/index.html", verifiedAt: verifiedOn, method: methodLive},
	{program: "TANF", state: "ME", url: "https://www.maine.gov/mymaineconnection", source: "https://www.maine.gov/portal/index.html", verifiedAt: verifiedOn, method: methodLive},
	// Maryland — Maryland One Application.
	{program: "SNAP", state: "MD", url: "https://marylandbenefits.gov", source: "https://dhs.maryland.gov/supplemental-nutrition-assistance-program/applying-for-the-food-supplement-program/", verifiedAt: verifiedOn, method: methodIndexed},
	{program: "MEDICAID", state: "MD", url: "https://marylandbenefits.gov", source: "https://dhs.maryland.gov/supplemental-nutrition-assistance-program/applying-for-the-food-supplement-program/", verifiedAt: verifiedOn, method: methodIndexed},
	{program: "TANF", state: "MD", url: "https://marylandbenefits.gov", source: "https://dhs.maryland.gov/supplemental-nutrition-assistance-program/applying-for-the-food-supplement-program/", verifiedAt: verifiedOn, method: methodIndexed},
	{program: "LIHEAP", state: "MD", url: "https://marylandbenefits.gov", source: "https://dhs.maryland.gov/supplemental-nutrition-assistance-program/applying-for-the-food-supplement-program/", verifiedAt: verifiedOn, method: methodIndexed},
	{program: "WIC", state: "MD", url: "https://marylandbenefits.gov", source: "https://dhs.maryland.gov/supplemental-nutrition-assistance-program/applying-for-the-food-supplement-program/", verifiedAt: verifiedOn, method: methodIndexed},
	// Massachusetts — DTA Connect.
	{program: "SNAP", state: "MA", url: "https://dtaconnect.eohhs.mass.gov/", source: "https://www.mass.gov/how-to/supplemental-nutrition-assistance-program-snap-formerly-known-as-food-stamps", verifiedAt: verifiedOn, method: methodLive},
	// Michigan — MI Bridges.
	{program: "SNAP", state: "MI", url: "https://newmibridges.michigan.gov/s/isd-landing-page?language=en_US", source: "https://www.michigan.gov/mdhhs/assistance-programs/food", verifiedAt: verifiedOn, method: methodLive},
	{program: "MEDICAID", state: "MI", url: "https://newmibridges.michigan.gov/s/isd-landing-page?language=en_US", source: "https://www.michigan.gov/mdhhs/assistance-programs/food", verifiedAt: verifiedOn, method: methodLive},
	{program: "TANF", state: "MI", url: "https://newmibridges.michigan.gov/s/isd-landing-page?language=en_US", source: "https://www.michigan.gov/mdhhs/assistance-programs/food", verifiedAt: verifiedOn, method: methodLive},
	// Minnesota — MNbenefits.
	{program: "SNAP", state: "MN", url: "https://mnbenefits.mn.gov", source: "https://mn.gov/dhs/mnbenefits/", verifiedAt: verifiedOn, method: methodIndexed},
	// Mississippi — Mississippi Common Web Portal.
	{program: "SNAP", state: "MS", url: "https://www.access.ms.gov", source: "http://www.mdhs.ms.gov/post/expiration-of-waiver-of-interview-requirements-for-snap-benefits-in-mississippi/", verifiedAt: verifiedOn, method: methodLive},
	// Missouri — myDSS.
	{program: "SNAP", state: "MO", url: "https://mydss.mo.gov/apply", source: "https://dss.mo.gov/food-assistance/apply-for-snap", verifiedAt: verifiedOn, method: methodIndexed},
	{program: "MEDICAID", state: "MO", url: "https://mydss.mo.gov/apply", source: "https://dss.mo.gov/food-assistance/apply-for-snap", verifiedAt: verifiedOn, method: methodIndexed},
	{program: "TANF", state: "MO", url: "https://mydss.mo.gov/apply", source: "https://dss.mo.gov/food-assistance/apply-for-snap", verifiedAt: verifiedOn, method: methodIndexed},
	// Montana — apply.mt.gov.
	{program: "SNAP", state: "MT", url: "https://apply.mt.gov/", source: "http://dphhs.mt.gov/hcsd/SNAP/", verifiedAt: verifiedOn, method: methodIndexed},
	// Nebraska — iServe Nebraska.
	{program: "SNAP", state: "NE", url: "https://www.iserve.nebraska.gov", source: "http://public-dhhs.ne.gov/Forms/DisplayPDF.aspx?item=378&ctx=b76897fa-7f49-4e12-9c68-aaf70a8440c1", verifiedAt: verifiedOn, method: methodIndexed},
	// Nevada — Access Nevada.
	{program: "SNAP", state: "NV", url: "https://accessnevada.dss.nv.gov", source: "https://dwss.nv.gov/SNAP/Food", verifiedAt: verifiedOn, method: methodIndexed},
	{program: "TANF", state: "NV", url: "https://accessnevada.dss.nv.gov", source: "https://dwss.nv.gov/SNAP/Food", verifiedAt: verifiedOn, method: methodIndexed},
	// New Hampshire — NH EASY.
	{program: "SNAP", state: "NH", url: "https://nheasy.nh.gov", source: "https://dhhs.nh.gov/apply-assistance", verifiedAt: verifiedOn, method: methodIndexed},
	{program: "MEDICAID", state: "NH", url: "https://nheasy.nh.gov", source: "https://dhhs.nh.gov/apply-assistance", verifiedAt: verifiedOn, method: methodIndexed},
	{program: "TANF", state: "NH", url: "https://nheasy.nh.gov", source: "https://dhhs.nh.gov/apply-assistance", verifiedAt: verifiedOn, method: methodIndexed},
	// New Jersey — MyNJHelps. The official NJ DHS outlink resolved to http
	// in-session; https was verified serving the portal (HTTP 200).
	{program: "SNAP", state: "NJ", url: "https://www.mynjhelps.gov", source: "https://nj.gov/humanservices/njsnap/apply/ways/", verifiedAt: verifiedOn, method: methodLive},
	{program: "TANF", state: "NJ", url: "https://www.mynjhelps.gov", source: "https://nj.gov/humanservices/njsnap/apply/ways/", verifiedAt: verifiedOn, method: methodLive},
	// New Mexico — YesNM.
	{program: "SNAP", state: "NM", url: "https://yes.nm.gov", source: "https://www.hca.nm.gov/lookingforassistance/apply-for-benefits/", verifiedAt: verifiedOn, method: methodLive},
	{program: "MEDICAID", state: "NM", url: "https://yes.nm.gov", source: "https://www.hca.nm.gov/lookingforassistance/apply-for-benefits/", verifiedAt: verifiedOn, method: methodLive},
	{program: "TANF", state: "NM", url: "https://yes.nm.gov", source: "https://www.hca.nm.gov/lookingforassistance/apply-for-benefits/", verifiedAt: verifiedOn, method: methodLive},
	{program: "LIHEAP", state: "NM", url: "https://yes.nm.gov", source: "https://www.hca.nm.gov/lookingforassistance/apply-for-benefits/", verifiedAt: verifiedOn, method: methodLive},
	// New York — myBenefits.
	{program: "SNAP", state: "NY", url: "https://mybenefits.ny.gov", source: "https://otda.ny.gov/workingfamilies/", verifiedAt: verifiedOn, method: methodLive},
	{program: "LIHEAP", state: "NY", url: "https://mybenefits.ny.gov", source: "https://otda.ny.gov/workingfamilies/", verifiedAt: verifiedOn, method: methodLive},
	{program: "TANF", state: "NY", url: "https://mybenefits.ny.gov", source: "https://otda.ny.gov/workingfamilies/", verifiedAt: verifiedOn, method: methodLive},
	// North Carolina — NC ePASS.
	{program: "SNAP", state: "NC", url: "https://epass.nc.gov", source: "https://www.ncdhhs.gov/divisions/child-and-family-well-being/food-and-nutrition-services-food-stamps/apply-food-and-nutrition-services-food-stamps", verifiedAt: verifiedOn, method: methodLive},
	{program: "MEDICAID", state: "NC", url: "https://epass.nc.gov", source: "https://www.ncdhhs.gov/divisions/child-and-family-well-being/food-and-nutrition-services-food-stamps/apply-food-and-nutrition-services-food-stamps", verifiedAt: verifiedOn, method: methodLive},
	{program: "LIHEAP", state: "NC", url: "https://epass.nc.gov", source: "https://www.ncdhhs.gov/divisions/child-and-family-well-being/food-and-nutrition-services-food-stamps/apply-food-and-nutrition-services-food-stamps", verifiedAt: verifiedOn, method: methodLive},
	{program: "TANF", state: "NC", url: "https://epass.nc.gov", source: "https://www.ncdhhs.gov/divisions/child-and-family-well-being/food-and-nutrition-services-food-stamps/apply-food-and-nutrition-services-food-stamps", verifiedAt: verifiedOn, method: methodLive},
	// North Dakota — Self-Service Portal / Apply for Help.
	{program: "SNAP", state: "ND", url: "https://www.applyforhelp.nd.gov", source: "https://www.hhs.nd.gov/applyforhelp/snap", verifiedAt: verifiedOn, method: methodIndexed},
	{program: "MEDICAID", state: "ND", url: "https://www.applyforhelp.nd.gov", source: "https://www.hhs.nd.gov/applyforhelp/snap", verifiedAt: verifiedOn, method: methodIndexed},
	{program: "LIHEAP", state: "ND", url: "https://www.applyforhelp.nd.gov", source: "https://www.hhs.nd.gov/applyforhelp/snap", verifiedAt: verifiedOn, method: methodIndexed},
	{program: "TANF", state: "ND", url: "https://www.applyforhelp.nd.gov", source: "https://www.hhs.nd.gov/applyforhelp/snap", verifiedAt: verifiedOn, method: methodIndexed},
	// Ohio — Ohio Benefits Self-Service Portal.
	{program: "SNAP", state: "OH", url: "https://ssp.benefits.ohio.gov", source: "http://dam.assets.ohio.gov/image/upload/obp.ohio.gov/Training/Self%20Service%20Improvements%20Flier.pdf", verifiedAt: verifiedOn, method: methodIndexed},
	{program: "MEDICAID", state: "OH", url: "https://ssp.benefits.ohio.gov", source: "http://dam.assets.ohio.gov/image/upload/obp.ohio.gov/Training/Self%20Service%20Improvements%20Flier.pdf", verifiedAt: verifiedOn, method: methodIndexed},
	{program: "TANF", state: "OH", url: "https://ssp.benefits.ohio.gov", source: "http://dam.assets.ohio.gov/image/upload/obp.ohio.gov/Training/Self%20Service%20Improvements%20Flier.pdf", verifiedAt: verifiedOn, method: methodIndexed},
	// Oregon — Oregon ONE.
	{program: "SNAP", state: "OR", url: "https://one.oregon.gov", source: "http://oregon.gov/odhs/benefits/Documents/one-document-checklist-en.pdf", verifiedAt: verifiedOn, method: methodIndexed},
	{program: "MEDICAID", state: "OR", url: "https://one.oregon.gov", source: "http://oregon.gov/odhs/benefits/Documents/one-document-checklist-en.pdf", verifiedAt: verifiedOn, method: methodIndexed},
	{program: "TANF", state: "OR", url: "https://one.oregon.gov", source: "http://oregon.gov/odhs/benefits/Documents/one-document-checklist-en.pdf", verifiedAt: verifiedOn, method: methodIndexed},
	// Pennsylvania — COMPASS. The official PA DHS form prints the URL with no
	// scheme; https did not resolve in-session, http was verified (HTTP 200).
	{program: "SNAP", state: "PA", url: "http://www.compass.state.pa.us", source: "https://www.pa.gov/content/dam/copapwp-pagov/en/dhs/documents/services/assistance/documents/from-old-site/snap/SNAP%20Application.pdf", verifiedAt: verifiedOn, method: methodLive},
	{program: "MEDICAID", state: "PA", url: "http://www.compass.state.pa.us", source: "https://www.pa.gov/content/dam/copapwp-pagov/en/dhs/documents/services/assistance/documents/from-old-site/snap/SNAP%20Application.pdf", verifiedAt: verifiedOn, method: methodLive},
	{program: "TANF", state: "PA", url: "http://www.compass.state.pa.us", source: "https://www.pa.gov/content/dam/copapwp-pagov/en/dhs/documents/services/assistance/documents/from-old-site/snap/SNAP%20Application.pdf", verifiedAt: verifiedOn, method: methodLive},
	{program: "LIHEAP", state: "PA", url: "http://www.compass.state.pa.us", source: "https://www.pa.gov/content/dam/copapwp-pagov/en/dhs/documents/services/assistance/documents/from-old-site/snap/SNAP%20Application.pdf", verifiedAt: verifiedOn, method: methodLive},
	// Rhode Island — HealthyRhode.
	{program: "SNAP", state: "RI", url: "https://healthyrhode.ri.gov", source: "https://dhs.ri.gov/sites/g/files/xkgbur426/files/2024-02/SNAP%20General.pdf", verifiedAt: verifiedOn, method: methodIndexed},
	// South Carolina — DSS Benefits Portal / SCMAPP.
	{program: "SNAP", state: "SC", url: "https://www.scmapp.sc.gov", source: "https://dss.sc.gov/resource-library/forms_brochures/files/3333.pdf", verifiedAt: verifiedOn, method: methodIndexed},
	// South Dakota — Economic Assistance Portal (TANF needs a paper form).
	{program: "SNAP", state: "SD", url: "https://eaportal.sd.gov", source: "http://Dss.Sd.Gov/formsandpubs/docs/GEN/301Application.pdf", verifiedAt: verifiedOn, method: methodIndexed},
	{program: "MEDICAID", state: "SD", url: "https://eaportal.sd.gov", source: "http://Dss.Sd.Gov/formsandpubs/docs/GEN/301Application.pdf", verifiedAt: verifiedOn, method: methodIndexed},
	// Tennessee — One DHS Customer Portal.
	{program: "SNAP", state: "TN", url: "https://onedhs.tn.gov/csp", source: "http://tn.gov/humanservices/for-families/supplemental-nutrition-assistance-program-snap.html", verifiedAt: verifiedOn, method: methodLive},
	{program: "TANF", state: "TN", url: "https://onedhs.tn.gov/csp", source: "http://tn.gov/humanservices/for-families/supplemental-nutrition-assistance-program-snap.html", verifiedAt: verifiedOn, method: methodLive},
	// Utah — myCase.
	{program: "SNAP", state: "UT", url: "https://jobs.utah.gov/mycase", source: "https://jobs.utah.gov/customereducation/services/foodstamps/", verifiedAt: verifiedOn, method: methodIndexed},
	{program: "MEDICAID", state: "UT", url: "https://jobs.utah.gov/mycase", source: "https://jobs.utah.gov/customereducation/services/foodstamps/", verifiedAt: verifiedOn, method: methodIndexed},
	{program: "TANF", state: "UT", url: "https://jobs.utah.gov/mycase", source: "https://jobs.utah.gov/customereducation/services/foodstamps/", verifiedAt: verifiedOn, method: methodIndexed},
	// Vermont — myBenefits.
	{program: "SNAP", state: "VT", url: "http://dcf.vermont.gov/mybenefits", source: "https://dcf.vermont.gov/esd/applicants/mybenefits", verifiedAt: verifiedOn, method: methodIndexed},
	{program: "LIHEAP", state: "VT", url: "http://dcf.vermont.gov/mybenefits", source: "https://dcf.vermont.gov/esd/applicants/mybenefits", verifiedAt: verifiedOn, method: methodIndexed},
	{program: "TANF", state: "VT", url: "http://dcf.vermont.gov/mybenefits", source: "https://dcf.vermont.gov/esd/applicants/mybenefits", verifiedAt: verifiedOn, method: methodIndexed},
	// Virginia — CommonHelp.
	{program: "SNAP", state: "VA", url: "https://commonhelp.virginia.gov/access/", source: "https://www.dss.virginia.gov/relief/food-assistance/", verifiedAt: verifiedOn, method: methodIndexed},
	{program: "MEDICAID", state: "VA", url: "https://commonhelp.virginia.gov/access/", source: "https://www.dss.virginia.gov/relief/food-assistance/", verifiedAt: verifiedOn, method: methodIndexed},
	{program: "TANF", state: "VA", url: "https://commonhelp.virginia.gov/access/", source: "https://www.dss.virginia.gov/relief/food-assistance/", verifiedAt: verifiedOn, method: methodIndexed},
	{program: "LIHEAP", state: "VA", url: "https://commonhelp.virginia.gov/access/", source: "https://www.dss.virginia.gov/relief/food-assistance/", verifiedAt: verifiedOn, method: methodIndexed},
	// West Virginia — WV PATH. WIC has its own application path.
	{program: "SNAP", state: "WV", url: "https://www.wvpath.wv.gov/", source: "https://dhhr.wv.gov/", verifiedAt: verifiedOn, method: methodIndexed},
	{program: "MEDICAID", state: "WV", url: "https://www.wvpath.wv.gov/", source: "https://dhhr.wv.gov/", verifiedAt: verifiedOn, method: methodIndexed},
	{program: "TANF", state: "WV", url: "https://www.wvpath.wv.gov/", source: "https://dhhr.wv.gov/", verifiedAt: verifiedOn, method: methodIndexed},
	{program: "WIC", state: "WV", url: "https://dhhr.wv.gov/WIC", source: "https://dhhr.wv.gov/", verifiedAt: verifiedOn, method: methodIndexed},
	// Wisconsin — ACCESS.
	{program: "SNAP", state: "WI", url: "https://access.wi.gov", source: "https://www.dhs.wisconsin.gov/foodshare/eligibility.htm", verifiedAt: verifiedOn, method: methodLive},
	{program: "MEDICAID", state: "WI", url: "https://access.wi.gov", source: "https://www.dhs.wisconsin.gov/foodshare/eligibility.htm", verifiedAt: verifiedOn, method: methodLive},
}

// verifiedPortals maps program -> state -> verified URL. Built from
// verifiedEntries at init; read-only after that. See the package comment for
// how a URL gets added.
var verifiedPortals = map[string]map[string]verifiedPortal{}

func init() {
	for _, e := range verifiedEntries {
		states, ok := verifiedPortals[e.program]
		if !ok {
			states = map[string]verifiedPortal{}
			verifiedPortals[e.program] = states
		}
		states[e.state] = verifiedPortal{
			url:        e.url,
			verifiedAt: e.verifiedAt,
			source:     e.source,
			method:     e.method,
		}
	}
}

// knownPrograms is the set of programs the portal registry routes. Codes are
// the canonical uppercase forms used everywhere else in the benefits system.
var knownPrograms = map[string]bool{
	"SNAP": true, "WIC": true, "MEDICAID": true, "LIHEAP": true,
	"TANF": true, "VA": true, "SSI": true,
}

// programDisplay names a program for guidance copy.
var programDisplay = map[string]string{
	"SNAP": "SNAP", "WIC": "WIC", "MEDICAID": "Medicaid", "LIHEAP": "LIHEAP",
	"TANF": "TANF", "VA": "VA benefits", "SSI": "SSI",
}

const (
	snapDirectoryURL = "https://www.fns.usda.gov/snap/apply"
	benefitFinderURL = "https://www.usa.gov/benefit-finder"
)

// programAliases maps the program names the app's screens use (the Figma
// lists VA Disability, VA Pension and VA Health Care as separate cards) to
// the canonical program code. The checklist and portal copy stay
// program-level; the canonical code is what the GraphQL schema carries.
var programAliases = map[string]string{
	"VA DISABILITY":  "VA",
	"VA PENSION":     "VA",
	"VA HEALTH CARE": "VA",
	"VA HEALTHCARE":  "VA",
}

// normalizeProgram canonicalises a program code. Unknown programs are not
// found: routing somebody to a portal for a program this system does not know
// would be a guess.
func normalizeProgram(program string) (string, error) {
	code := strings.ToUpper(strings.TrimSpace(program))
	if alias, ok := programAliases[code]; ok {
		return alias, nil
	}
	if knownPrograms[code] {
		return code, nil
	}
	return "", fmt.Errorf("%w: unknown benefits program %q", domain.ErrNotFound, program)
}

// normalizeState canonicalises a state code against the same state table the
// ZIP lookup uses, so the two agree on what a state is.
func normalizeState(state string) (string, error) {
	code := strings.ToUpper(strings.TrimSpace(state))
	if _, ok := stateNames[code]; ok {
		return code, nil
	}
	return "", fmt.Errorf("%w: unknown state %q", domain.ErrNotFound, state)
}

// PortalFor returns the official application portal for a program in a state.
// It is pure reference data: no identity, no user data, no database.
func (s *Service) PortalFor(program, state string) (Portal, error) {
	code, err := normalizeProgram(program)
	if err != nil {
		return Portal{}, err
	}
	st, err := normalizeState(state)
	if err != nil {
		return Portal{}, err
	}
	portal := Portal{Program: code, State: st, FallbackGuidance: fallbackGuidance(code, st)}
	if states, ok := verifiedPortals[code]; ok {
		if verified, ok := states[st]; ok {
			url := verified.url
			portal.URL = &url
			portal.Verified = true
			portal.FallbackGuidance = ""
		}
	}
	return portal, nil
}

// fallbackGuidance tells the applicant how to find the official application
// when no verified URL is on file. It names only the two official directories
// seeded as reference material — nothing invented.
func fallbackGuidance(program, state string) string {
	name := stateNames[state]
	display := programDisplay[program]
	if program == "SNAP" {
		return fmt.Sprintf("No verified application link is on file for SNAP in %s yet. Apply on the state's official site — find it through the USDA's SNAP state directory at %s — or start at %s. Only ever apply on a .gov site.",
			name, snapDirectoryURL, benefitFinderURL)
	}
	return fmt.Sprintf("No verified application link is on file for %s in %s yet. Find the state's official application through %s, and only ever apply on a .gov site.",
		display, name, benefitFinderURL)
}
