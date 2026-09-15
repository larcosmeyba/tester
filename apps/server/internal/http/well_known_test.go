package serverhttp

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/helpthehive/server/internal/config"
)

// The universal-link / app-link association files: served only when the
// signing identities are configured, scoped to /auth/verified* so the
// token-bearing /auth/verify link keeps opening in the browser.

func testWellKnownConfig() config.Config {
	return config.Config{
		AppleTeamID:               "TEAMID1234",
		AndroidSHA256Fingerprints: "AA:BB:CC, DD:EE:FF",
	}
}

func TestAppleAppSiteAssociation(t *testing.T) {
	request := httptest.NewRequest(http.MethodGet, "/.well-known/apple-app-site-association", nil)
	recorder := httptest.NewRecorder()

	WellKnownLinks(testWellKnownConfig(), nil)(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", recorder.Code, http.StatusOK)
	}
	if ct := recorder.Header().Get("Content-Type"); !strings.Contains(ct, "application/json") {
		t.Fatalf("Content-Type = %q, want application/json", ct)
	}
	var body struct {
		Applinks struct {
			Details []struct {
				AppID string   `json:"appID"`
				Paths []string `json:"paths"`
			} `json:"details"`
		} `json:"applinks"`
	}
	if err := json.Unmarshal(recorder.Body.Bytes(), &body); err != nil {
		t.Fatalf("body is not JSON: %v", err)
	}
	if len(body.Applinks.Details) != 1 {
		t.Fatalf("details has %d entries, want 1", len(body.Applinks.Details))
	}
	detail := body.Applinks.Details[0]
	if detail.AppID != "TEAMID1234.com.helpthehive" {
		t.Fatalf("appID = %q, want TEAMID1234.com.helpthehive", detail.AppID)
	}
	if len(detail.Paths) != 1 || detail.Paths[0] != "/auth/verified*" {
		t.Fatalf("paths = %v, want [/auth/verified*]", detail.Paths)
	}
}

func TestAppleAppSiteAssociationDisabledWithoutTeamID(t *testing.T) {
	cfg := testWellKnownConfig()
	cfg.AppleTeamID = ""
	request := httptest.NewRequest(http.MethodGet, "/.well-known/apple-app-site-association", nil)
	recorder := httptest.NewRecorder()

	WellKnownLinks(cfg, nil)(recorder, request)

	if recorder.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want %d", recorder.Code, http.StatusNotFound)
	}
}

func TestAssetlinks(t *testing.T) {
	request := httptest.NewRequest(http.MethodGet, "/.well-known/assetlinks.json", nil)
	recorder := httptest.NewRecorder()

	WellKnownLinks(testWellKnownConfig(), nil)(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", recorder.Code, http.StatusOK)
	}
	var statements []struct {
		Relation []string `json:"relation"`
		Target   struct {
			Namespace    string   `json:"namespace"`
			PackageName  string   `json:"package_name"`
			Fingerprints []string `json:"sha256_cert_fingerprints"`
		} `json:"target"`
	}
	if err := json.Unmarshal(recorder.Body.Bytes(), &statements); err != nil {
		t.Fatalf("body is not JSON: %v", err)
	}
	if len(statements) != 2 {
		t.Fatalf("got %d statements, want 2 (one per fingerprint)", len(statements))
	}
	for _, stmt := range statements {
		if stmt.Target.Namespace != "android_app" || stmt.Target.PackageName != "com.helpthehive" {
			t.Fatalf("unexpected target: %+v", stmt.Target)
		}
		if len(stmt.Target.Fingerprints) != 1 {
			t.Fatalf("each statement carries exactly one fingerprint: %+v", stmt.Target)
		}
	}
}

func TestAssetlinksDisabledWithoutFingerprints(t *testing.T) {
	cfg := testWellKnownConfig()
	cfg.AndroidSHA256Fingerprints = ""
	request := httptest.NewRequest(http.MethodGet, "/.well-known/assetlinks.json", nil)
	recorder := httptest.NewRecorder()

	WellKnownLinks(cfg, nil)(recorder, request)

	if recorder.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want %d", recorder.Code, http.StatusNotFound)
	}
}

func TestVerifyAppFallback(t *testing.T) {
	request := httptest.NewRequest(http.MethodGet, "/auth/verified?flow=signup", nil)
	recorder := httptest.NewRecorder()

	VerifyAppFallback(nil)(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", recorder.Code, http.StatusOK)
	}
	body := recorder.Body.String()
	if !strings.Contains(body, "helpthehive://auth/verified?flow=signup") {
		t.Fatalf("fallback page does not link the custom scheme: %q", body)
	}
}
