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
	// InternalJobSecret authenticates internal job endpoints
	// (/internal/jobs/*), called by Cloud Scheduler with the secret in the
	// X-Job-Secret header. Empty disables those endpoints; the server runs
	// fine without it.
	InternalJobSecret string
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
		InternalJobSecret: strings.TrimSpace(os.Getenv("INTERNAL_JOB_SECRET")),
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
