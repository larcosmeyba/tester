package config

import (
	"fmt"
	"os"
	"strconv"
	"strings"
)

type Config struct {
	AppEnv             string
	HTTPAddr           string
	DatabaseURL        string
	CORSAllowedOrigins []string
	// RateLimitPerMinute caps GraphQL requests per client IP per minute.
	// 0 or negative disables rate limiting.
	RateLimitPerMinute int
	Auth               AuthConfig
	Penny              PennyConfig
	// PublicBaseURL is the externally reachable base URL of this API
	// (e.g. https://helpthehive-dev-api-....run.app), used to build magic
	// verification links emailed to new users. Empty disables magic links;
	// requestVerificationLink then fails with a clear message.
	PublicBaseURL string
	// AppleTeamID is the Apple Developer Team ID used to build the
	// apple-app-site-association file for iOS universal links
	// (applinks:<host> -> /auth/verified* opens the app). Empty disables
	// the /.well-known/apple-app-site-association endpoint; set it when the
	// production team ID is known.
	AppleTeamID string
	// AndroidSHA256Fingerprints is a comma-separated list of SHA-256
	// certificate fingerprints for the Android app signing key, used to
	// build /.well-known/assetlinks.json for Android app links. Empty
	// disables the endpoint; set it once the release signing key exists.
	AndroidSHA256Fingerprints string
	// InternalJobSecret authenticates internal job endpoints
	// (/internal/jobs/*), called by Cloud Scheduler with the secret in the
	// X-Job-Secret header. Empty disables those endpoints; the server runs
	// fine without it.
	InternalJobSecret string
	// ResourcesPlacesAPIKey is the Google Places API key behind
	// GET /resources/nearby. Empty disables community resource lookup: the
	// endpoint returns 503 and the app renders the lookup as honestly
	// unavailable, exactly like the other optional integrations.
	ResourcesPlacesAPIKey string
}

type AuthConfig struct {
	Issuer   string
	Audience string
	JWKSURL  string
}

// PennyConfig configures the assistant.
//
// Penny is off unless PENNY_AGENT_URL is set, and Help The Hive runs correctly
// with her off — the chat reports itself unavailable and nothing else changes.
// A partially configured Penny is a start-up failure rather than a surprise on
// somebody's first message, which is the same rule the meal AI provider
// follows.
type PennyConfig struct {
	// The agent service. Empty means Penny is disabled.
	AgentURL string
	// Proves a turn request came from this server. The agent answers nothing
	// without it.
	ServiceToken string
	// Signs the per-turn tool tokens the agent calls back with. Never leaves
	// this process except as a signature.
	ToolTokenSecret string
}

func (p PennyConfig) Enabled() bool { return p.AgentURL != "" }

func Load() (Config, error) {
	cfg := Config{
		AppEnv:             getEnv("APP_ENV", "development"),
		HTTPAddr:           getEnv("HTTP_ADDR", ":8080"),
		DatabaseURL:        strings.TrimSpace(os.Getenv("DATABASE_URL")),
		CORSAllowedOrigins: splitCSV(os.Getenv("CORS_ALLOWED_ORIGINS")),
		RateLimitPerMinute: getEnvInt("RATE_LIMIT_PER_MINUTE", 100),
		Auth: AuthConfig{
			Issuer:   strings.TrimSpace(os.Getenv("BETTER_AUTH_ISSUER")),
			Audience: strings.TrimSpace(os.Getenv("BETTER_AUTH_AUDIENCE")),
			JWKSURL:  strings.TrimSpace(os.Getenv("BETTER_AUTH_JWKS_URL")),
		},
		Penny: PennyConfig{
			AgentURL:        strings.TrimSpace(os.Getenv("PENNY_AGENT_URL")),
			ServiceToken:    strings.TrimSpace(os.Getenv("PENNY_SERVICE_TOKEN")),
			ToolTokenSecret: strings.TrimSpace(os.Getenv("PENNY_TOOL_TOKEN_SECRET")),
		},
		InternalJobSecret:         strings.TrimSpace(os.Getenv("INTERNAL_JOB_SECRET")),
		ResourcesPlacesAPIKey:     strings.TrimSpace(os.Getenv("RESOURCES_PLACES_API_KEY")),
		PublicBaseURL:             strings.TrimSuffix(strings.TrimSpace(os.Getenv("APP_PUBLIC_URL")), "/"),
		AppleTeamID:               strings.TrimSpace(os.Getenv("APPLE_TEAM_ID")),
		AndroidSHA256Fingerprints: strings.TrimSpace(os.Getenv("ANDROID_SHA256_FINGERPRINTS")),
	}

	if cfg.DatabaseURL == "" {
		return Config{}, fmt.Errorf("DATABASE_URL is required")
	}
	if cfg.Auth.Issuer == "" {
		return Config{}, fmt.Errorf("BETTER_AUTH_ISSUER is required")
	}
	if cfg.Auth.Audience == "" {
		return Config{}, fmt.Errorf("BETTER_AUTH_AUDIENCE is required")
	}
	if cfg.Auth.JWKSURL == "" {
		return Config{}, fmt.Errorf("BETTER_AUTH_JWKS_URL is required")
	}
	if cfg.Penny.Enabled() {
		if cfg.Penny.ServiceToken == "" {
			return Config{}, fmt.Errorf("PENNY_SERVICE_TOKEN is required when PENNY_AGENT_URL is set")
		}
		if len(cfg.Penny.ToolTokenSecret) < 32 {
			return Config{}, fmt.Errorf("PENNY_TOOL_TOKEN_SECRET must be at least 32 characters when PENNY_AGENT_URL is set")
		}
	}

	return cfg, nil
}

func (c Config) IsDevelopment() bool {
	return c.AppEnv == "development" || c.AppEnv == "local"
}

func getEnv(key string, fallback string) string {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback
	}
	return value
}

func getEnvInt(key string, fallback int) int {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback
	}
	n, err := strconv.Atoi(value)
	if err != nil {
		return fallback
	}
	return n
}

func splitCSV(value string) []string {
	parts := strings.Split(value, ",")
	out := make([]string, 0, len(parts))
	for _, part := range parts {
		trimmed := strings.TrimSpace(part)
		if trimmed != "" {
			out = append(out, trimmed)
		}
	}
	return out
}
