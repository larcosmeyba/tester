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
