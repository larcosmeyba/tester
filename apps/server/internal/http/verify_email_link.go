package serverhttp

import (
	"errors"
	"html"
	"log/slog"
	"net/http"
	"strings"

	"github.com/helpthehive/server/internal/apperrors"
	"github.com/helpthehive/server/internal/modules/users"
)

// Magic verification links (signup, September 2026).
//
// The emailed Verify button opens GET /auth/verify?token=... here. The
// handler consumes the single-use token, stamps users.account_verified_at,
// and renders a page with an "Open the App" button — an https universal
// link (https://<this-host>/auth/verified?flow=signup) that opens the
// installed app directly at the auth/verified route on iOS/Android once
// the applinks/app-links association is configured. The token is the only
// credential, so this route sits outside the user auth middleware — the
// same way a password-reset link does. Tapping the link on a desktop works
// too: the page tells the user to return to the app and tap "I've verified
// my email", which re-reads the viewer verification status.

// VerifyEmailLink consumes a magic verification link and renders the
// result page.
func VerifyEmailLink(service *users.Service, publicBaseURL string, logger *slog.Logger) http.HandlerFunc {
	if logger == nil {
		logger = slog.Default()
	}
	publicBaseURL = strings.TrimSuffix(strings.TrimSpace(publicBaseURL), "/")
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet && r.Method != http.MethodHead {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		token := r.URL.Query().Get("token")
		if token == "" {
			writeVerifyPage(w, http.StatusBadRequest,
				"Link unavailable",
				"This verification link is missing its token. Request a new link from the app.")
			return
		}
		if service == nil {
			writeVerifyPage(w, http.StatusServiceUnavailable,
				"Something went wrong",
				"Email verification isn't available right now. Please try again later.")
			return
		}
		if err := service.ConsumeVerificationLink(r.Context(), token); err != nil {
			var publicErr *apperrors.PublicError
			if errors.As(err, &publicErr) {
				writeVerifyPage(w, http.StatusBadRequest, "Link unavailable", publicErr.Error())
				return
			}
			logger.Error("verification link could not be consumed", "error", err)
			writeVerifyPage(w, http.StatusInternalServerError,
				"Something went wrong",
				"We couldn't verify that link. Request a new one from the app.")
			return
		}
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.WriteHeader(http.StatusOK)
		// Universal link back into the app, built from the configured public
		// base URL (never the request Host header — that's attacker input).
		// If the app isn't installed the link falls through to
		// GET /auth/verified below.
		appLink := publicBaseURL + "/auth/verified?flow=signup"
		if publicBaseURL == "" {
			// Config missing: fall back to the custom scheme so the page
			// still offers a way back into the app.
			appLink = "helpthehive://auth/verified?flow=signup"
		}
		_, _ = w.Write([]byte(`<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Email verified — Help The Hive</title></head>
<body style="margin:0;background:#F4F5F6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<div style="max-width:440px;margin:0 auto;padding:64px 24px;text-align:center;">
<div style="width:88px;height:88px;border-radius:50%;background:#EBF7EB;margin:0 auto 24px;display:flex;align-items:center;justify-content:center;">
<span style="font-size:44px;color:#1B5E20;">&#10003;</span></div>
<h1 style="font-size:26px;color:#20242A;margin:0 0 12px;">You&apos;re verified!</h1>
<p style="font-size:15px;line-height:1.6;color:#555A64;margin:0 0 32px;">Your email is confirmed. Open the Help The Hive app to finish setting up your account.</p>
<a href="` + html.EscapeString(appLink) + `" style="display:inline-block;background:#1B5E20;color:#FFFFFF;text-decoration:none;font-weight:700;font-size:16px;padding:15px 48px;border-radius:999px;">Open the App</a>
<p style="font-size:13px;color:#9AA0A6;margin:32px 0 0;">If the button doesn&apos;t open the app, return to Help The Hive and tap &ldquo;I&apos;ve verified my email&rdquo;.</p>
</div></body></html>`))
	}
}

// VerifyAppFallback renders the browser fallback for the universal link
// https://<host>/auth/verified?flow=signup. When the app is installed the
// OS intercepts that URL and this handler never runs; when it isn't, the
// browser lands here and the page points the user at the app (with the
// helpthehive:// custom scheme as a last resort for already-installed apps
// whose association hasn't synced yet).
func VerifyAppFallback(logger *slog.Logger) http.HandlerFunc {
	if logger == nil {
		logger = slog.Default()
	}
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet && r.Method != http.MethodHead {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		flow := r.URL.Query().Get("flow")
		customScheme := "helpthehive://auth/verified"
		// Only the known signup flow is echoed back; anything else is
		// dropped so an arbitrary query value can't land in the HTML.
		if flow == "signup" {
			customScheme += "?flow=signup"
		}
		writeVerifyPage(w, http.StatusOK,
			"You're verified!",
			"Your email is confirmed. Open the Help The Hive app to continue — "+
				`<a href="`+html.EscapeString(customScheme)+`">tap here if the app is already installed</a>.`)
	}
}

func writeVerifyPage(w http.ResponseWriter, status int, title, message string) {
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.WriteHeader(status)
	// The title is always a fixed string in this file; escape it so a future
	// caller can't introduce markup. The message may intentionally contain a
	// single <a> (VerifyAppFallback) whose href is escaped at the call site;
	// all other messages are fixed strings.
	title = html.EscapeString(title)
	_, _ = w.Write([]byte(`<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>` + title + ` — Help The Hive</title></head>
<body style="margin:0;background:#F4F5F6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<div style="max-width:440px;margin:0 auto;padding:64px 24px;text-align:center;">
<h1 style="font-size:24px;color:#20242A;margin:0 0 12px;">` + title + `</h1>
<p style="font-size:15px;line-height:1.6;color:#555A64;margin:0;">` + message + `</p>
</div></body></html>`))
}
