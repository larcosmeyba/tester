package serverhttp

import (
	"log/slog"
	"net/http"
	"strings"

	"github.com/helpthehive/server/internal/config"
)

// Universal-link / app-link association files (September 2026).
//
// The signup magic-link email points at GET /auth/verify?token=... on this
// API, which consumes the token and renders a success page whose "Open the
// App" button is an https universal link:
//
//	https://<this-host>/auth/verified?flow=signup
//
// With the native association configured, iOS/Android open the installed
// app directly at the auth/verified route (expo-router parses it like any
// deep link) instead of showing a browser confirmation prompt for the
// helpthehive:// custom scheme. The association is intentionally scoped to
// /auth/verified* only: /auth/verify?token=... must keep opening in the
// browser so the backend can consume the single-use token.
//
// Both endpoints are unauthenticated by design (like the verify link
// itself) and served with no redirects, as Apple/Google require.

const appBundleID = "com.helpthehive"

// WellKnownLinks serves the iOS + Android association files from config.
func WellKnownLinks(cfg config.Config, logger *slog.Logger) http.HandlerFunc {
	if logger == nil {
		logger = slog.Default()
	}
	teamID := cfg.AppleTeamID
	fingerprints := splitFingerprints(cfg.AndroidSHA256Fingerprints)
	return func(w http.ResponseWriter, r *http.Request) {
		switch strings.TrimSuffix(r.URL.Path, "/") {
		case "/.well-known/apple-app-site-association":
			if teamID == "" {
				http.NotFound(w, r)
				return
			}
			writeJSON(w, http.StatusOK, map[string]any{
				"applinks": map[string]any{
					"apps": []string{},
					"details": []map[string]any{
						{
							"appID": teamID + "." + appBundleID,
							"paths": []string{"/auth/verified*"},
						},
					},
				},
			})
		case "/.well-known/assetlinks.json":
			if len(fingerprints) == 0 {
				http.NotFound(w, r)
				return
			}
			statements := make([]map[string]any, 0, len(fingerprints))
			for _, fp := range fingerprints {
				statements = append(statements, map[string]any{
					"relation": []string{"delegate_permission/common.handle_all_urls"},
					"target": map[string]any{
						"namespace":                "android_app",
						"package_name":             appBundleID,
						"sha256_cert_fingerprints": []string{fp},
					},
				})
			}
			writeJSON(w, http.StatusOK, statements)
		default:
			http.NotFound(w, r)
		}
	}
}

func splitFingerprints(raw string) []string {
	var out []string
	for _, part := range strings.Split(raw, ",") {
		if fp := strings.TrimSpace(part); fp != "" {
			out = append(out, fp)
		}
	}
	return out
}
