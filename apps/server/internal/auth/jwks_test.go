package auth

import (
	"context"
	"crypto/ed25519"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

func TestVerifierValidatesEd25519JWTFromJWKS(t *testing.T) {
	publicKey, privateKey, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatalf("GenerateKey() error = %v", err)
	}

	jwks := jwksDocument{Keys: []jwkDocument{{
		Kty: "OKP",
		Kid: "test-key",
		Alg: "EdDSA",
		Crv: "Ed25519",
		X:   base64.RawURLEncoding.EncodeToString(publicKey),
	}}}
	now := time.Date(2026, 8, 14, 12, 0, 0, 0, time.UTC)
	claims := Claims{
		Email:         "sam@example.com",
		EmailVerified: true,
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   "better-auth-user-1",
			Issuer:    "https://auth.example.com",
			Audience:  jwt.ClaimStrings{"help-the-hive"},
			ExpiresAt: jwt.NewNumericDate(now.Add(time.Hour)),
			NotBefore: jwt.NewNumericDate(now.Add(-time.Minute)),
			IssuedAt:  jwt.NewNumericDate(now),
		},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodEdDSA, claims)
	token.Header["kid"] = "test-key"
	tokenString, err := token.SignedString(privateKey)
	if err != nil {
		t.Fatalf("SignedString() error = %v", err)
	}

	verifier := NewVerifier(VerifierConfig{
		Issuer:   "https://auth.example.com",
		Audience: "help-the-hive",
		JWKSURL:  "https://auth.example.com/api/auth/jwks",
	})
	verifier.now = func() time.Time { return now }
	verifier.client = jwksClient(t, jwks)

	identity, err := verifier.Verify(context.Background(), tokenString)
	if err != nil {
		t.Fatalf("Verify() error = %v", err)
	}
	if identity.Subject != "better-auth-user-1" {
		t.Fatalf("Subject = %q", identity.Subject)
	}
	if identity.Email != "sam@example.com" {
		t.Fatalf("Email = %q", identity.Email)
	}
	if !identity.EmailVerified {
		t.Fatal("EmailVerified = false")
	}
}

func TestVerifierRejectsUnverifiedEmail(t *testing.T) {
	publicKey, privateKey, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatalf("GenerateKey() error = %v", err)
	}
	jwks := jwksDocument{Keys: []jwkDocument{{
		Kty: "OKP", Kid: "test-key", Alg: "EdDSA", Crv: "Ed25519",
		X: base64.RawURLEncoding.EncodeToString(publicKey),
	}}}
	now := time.Date(2026, 8, 14, 12, 0, 0, 0, time.UTC)
	claims := Claims{
		Email: "sam@example.com",
		RegisteredClaims: jwt.RegisteredClaims{
			Subject: "better-auth-user-1", Issuer: "https://auth.example.com",
			Audience: jwt.ClaimStrings{"help-the-hive"}, ExpiresAt: jwt.NewNumericDate(now.Add(time.Hour)),
		},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodEdDSA, claims)
	token.Header["kid"] = "test-key"
	tokenString, err := token.SignedString(privateKey)
	if err != nil {
		t.Fatalf("SignedString() error = %v", err)
	}
	verifier := NewVerifier(VerifierConfig{
		Issuer: "https://auth.example.com", Audience: "help-the-hive",
		JWKSURL: "https://auth.example.com/api/auth/jwks",
	})
	verifier.now = func() time.Time { return now }
	verifier.client = jwksClient(t, jwks)

	if _, err := verifier.Verify(context.Background(), tokenString); err == nil || !strings.Contains(err.Error(), "verified email") {
		t.Fatalf("Verify() error = %v, want verified email error", err)
	}
}

func TestVerifierRejectsWrongAudience(t *testing.T) {
	publicKey, privateKey, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatalf("GenerateKey() error = %v", err)
	}
	jwks := jwksDocument{Keys: []jwkDocument{{
		Kty: "OKP",
		Kid: "test-key",
		Alg: "EdDSA",
		Crv: "Ed25519",
		X:   base64.RawURLEncoding.EncodeToString(publicKey),
	}}}

	now := time.Date(2026, 8, 14, 12, 0, 0, 0, time.UTC)
	claims := Claims{RegisteredClaims: jwt.RegisteredClaims{
		Subject:   "better-auth-user-1",
		Issuer:    "https://auth.example.com",
		Audience:  jwt.ClaimStrings{"other-api"},
		ExpiresAt: jwt.NewNumericDate(now.Add(time.Hour)),
	}}
	token := jwt.NewWithClaims(jwt.SigningMethodEdDSA, claims)
	token.Header["kid"] = "test-key"
	tokenString, err := token.SignedString(privateKey)
	if err != nil {
		t.Fatalf("SignedString() error = %v", err)
	}

	verifier := NewVerifier(VerifierConfig{
		Issuer:   "https://auth.example.com",
		Audience: "help-the-hive",
		JWKSURL:  "https://auth.example.com/api/auth/jwks",
	})
	verifier.now = func() time.Time { return now }
	verifier.client = jwksClient(t, jwks)

	if _, err := verifier.Verify(context.Background(), tokenString); err == nil {
		t.Fatal("expected wrong audience to be rejected")
	}
}

func jwksClient(t *testing.T, jwks jwksDocument) *http.Client {
	t.Helper()
	payload, err := json.Marshal(jwks)
	if err != nil {
		t.Fatalf("Marshal() error = %v", err)
	}
	return &http.Client{Transport: roundTripFunc(func(*http.Request) (*http.Response, error) {
		return &http.Response{
			StatusCode: http.StatusOK,
			Body:       io.NopCloser(strings.NewReader(string(payload))),
			Header:     make(http.Header),
		}, nil
	})}
}

type roundTripFunc func(*http.Request) (*http.Response, error)

func (f roundTripFunc) RoundTrip(r *http.Request) (*http.Response, error) {
	return f(r)
}
