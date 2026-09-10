package config

import "testing"

func TestLoadRequiresAuthAndDatabaseConfig(t *testing.T) {
	t.Setenv("APP_ENV", "")
	t.Setenv("HTTP_ADDR", "")
	t.Setenv("DATABASE_URL", "")
	t.Setenv("BETTER_AUTH_ISSUER", "")
	t.Setenv("BETTER_AUTH_AUDIENCE", "")
	t.Setenv("BETTER_AUTH_JWKS_URL", "")

	_, err := Load()
	if err == nil {
		t.Fatal("expected missing DATABASE_URL error")
	}
}

func TestLoadDefaultsAndSplitsCORSOrigins(t *testing.T) {
	t.Setenv("DATABASE_URL", "postgres://example")
	t.Setenv("BETTER_AUTH_ISSUER", "https://auth.example.com")
	t.Setenv("BETTER_AUTH_AUDIENCE", "help-the-hive")
	t.Setenv("BETTER_AUTH_JWKS_URL", "https://auth.example.com/api/auth/jwks")
	t.Setenv("CORS_ALLOWED_ORIGINS", "http://localhost:8081, exp://* ")

	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load() error = %v", err)
	}
	if cfg.AppEnv != "development" {
		t.Fatalf("AppEnv = %q, want development", cfg.AppEnv)
	}
	if cfg.HTTPAddr != ":8080" {
		t.Fatalf("HTTPAddr = %q, want :8080", cfg.HTTPAddr)
	}
	if len(cfg.CORSAllowedOrigins) != 2 {
		t.Fatalf("CORSAllowedOrigins length = %d, want 2", len(cfg.CORSAllowedOrigins))
	}
}

func baseEnv(t *testing.T) {
	t.Helper()
	t.Setenv("DATABASE_URL", "postgres://localhost/test")
	t.Setenv("BETTER_AUTH_ISSUER", "https://auth.example.com")
	t.Setenv("BETTER_AUTH_AUDIENCE", "help-the-hive")
	t.Setenv("BETTER_AUTH_JWKS_URL", "https://auth.example.com/api/auth/jwks")
	t.Setenv("KROGER_CLIENT_ID", "")
	t.Setenv("KROGER_CLIENT_SECRET", "")
	t.Setenv("INSTACART_API_KEY", "")
	t.Setenv("INSTACART_BASE_URL", "")
	t.Setenv("INSTACART_AFFILIATE_URL", "")
}

func TestKrogerPartialConfigFails(t *testing.T) {
	baseEnv(t)
	t.Setenv("KROGER_CLIENT_ID", "id-without-secret")

	if _, err := Load(); err == nil {
		t.Fatal("expected an error for a half-configured Kroger")
	}
}

func TestKrogerAndInstacartLoad(t *testing.T) {
	baseEnv(t)
	t.Setenv("KROGER_CLIENT_ID", "some-id")
	t.Setenv("KROGER_CLIENT_SECRET", "some-secret")
	t.Setenv("KROGER_LOCATION_ID", "12345")
	t.Setenv("INSTACART_API_KEY", "some-key")
	t.Setenv("INSTACART_AFFILIATE_URL", "https://www.instacart.com/store?affiliate=x")

	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load() error = %v", err)
	}
	if !cfg.Kroger.Enabled() || cfg.Kroger.LocationID != "12345" {
		t.Fatalf("Kroger = %+v", cfg.Kroger)
	}
	if !cfg.Instacart.Enabled() || cfg.Instacart.AffiliateURL == "" {
		t.Fatalf("Instacart = %+v", cfg.Instacart)
	}
	if cfg.Instacart.BaseURL != "https://connect.instacart.com" {
		t.Fatalf("BaseURL = %q, want the production default", cfg.Instacart.BaseURL)
	}
}

func TestPartnerIntegrationsOffByDefault(t *testing.T) {
	baseEnv(t)

	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load() error = %v", err)
	}
	if cfg.Kroger.Enabled() {
		t.Fatal("Kroger should be off with no credentials")
	}
	if cfg.Instacart.Enabled() {
		t.Fatal("Instacart should be off with no API key")
	}
}
