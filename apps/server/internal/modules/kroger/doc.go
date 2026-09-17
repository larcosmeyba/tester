// Package kroger is Help The Hive's live grocery pricing provider, with a
// USDA average-price fallback so pricing never goes dark.
//
// The design is deliberate about who needs an account: nobody but Help The
// Hive. This package uses OAuth2 client credentials — an app-level token the
// server fetches with its own client id and secret — so users do NOT need
// Kroger accounts. The store that prices a basket is picked from the phone's
// location: the mobile sends a zip code or coordinates, the server resolves
// it to a Kroger locationId, and prices are looked up for that store.
//
// Credentials are server secrets. KROGER_CLIENT_ID and KROGER_CLIENT_SECRET
// come from the server environment only — never expose them via an
// EXPO_PUBLIC_* variable, which would put them in the mobile bundle that
// anyone who installs the app can read. They are stubbed until the Help The
// Hive developer app is approved at developer.kroger.com (about a 1–2 week
// review); with no credentials configured New returns ErrNotConfigured and
// pricing falls back to USDA estimates rather than failing.
//
// Two caches bound how often we talk to Kroger: OAuth tokens are cached for
// ~30 minutes, and store prices for 4 hours. All Kroger calls pass through
// one rate gate of at most 1 request per second — well inside the 10,000
// calls/day the free developer tier allows.
//
// Every price this package returns is honest about its provenance. Live
// prices carry Source "kroger"; fallback prices carry Source
// "usda-estimate", Estimated true, and Label "Est." so the UI can say
// "estimated" without guessing.
package kroger
