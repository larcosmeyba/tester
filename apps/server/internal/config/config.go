package config

import (
	"fmt"
	"os"
	"strings"
)

type Config struct {
	AppEnv             string
	HTTPAddr           string
	DatabaseURL        string
	CORSAllowedOrigins []string
	Auth               AuthConfig
}

type AuthConfig struct {
	Issuer   string
	Audience string
	JWKSURL  string
}

func Load() (Config, error) {
	cfg := Config{
		AppEnv:             getEnv("APP_ENV", "development"),
		HTTPAddr:           getEnv("HTTP_ADDR", ":8080"),
		DatabaseURL:        strings.TrimSpace(os.Getenv("DATABASE_URL")),
		CORSAllowedOrigins: splitCSV(os.Getenv("CORS_ALLOWED_ORIGINS")),
		Auth: AuthConfig{
			Issuer:   strings.TrimSpace(os.Getenv("BETTER_AUTH_ISSUER")),
			Audience: strings.TrimSpace(os.Getenv("BETTER_AUTH_AUDIENCE")),
			JWKSURL:  strings.TrimSpace(os.Getenv("BETTER_AUTH_JWKS_URL")),
		},
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
