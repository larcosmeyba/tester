package auth

import (
	"context"
	"crypto/ecdsa"
	"crypto/ed25519"
	"crypto/elliptic"
	"crypto/rsa"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"math/big"
	"net/http"
	"sync"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

type VerifierConfig struct {
	Issuer   string
	Audience string
	JWKSURL  string
	TTL      time.Duration
}

type Verifier struct {
	issuer   string
	audience string
	jwksURL  string
	ttl      time.Duration
	client   *http.Client
	now      func() time.Time

	mu        sync.RWMutex
	fetchedAt time.Time
	keys      map[string]verificationKey
}

type verificationKey struct {
	key any
	alg string
}

type Claims struct {
	Email         string `json:"email,omitempty"`
	EmailVerified bool   `json:"emailVerified"`
	jwt.RegisteredClaims
}

func NewVerifier(cfg VerifierConfig) *Verifier {
	ttl := cfg.TTL
	if ttl <= 0 {
		ttl = 5 * time.Minute
	}
	return &Verifier{
		issuer:   cfg.Issuer,
		audience: cfg.Audience,
		jwksURL:  cfg.JWKSURL,
		ttl:      ttl,
		client:   &http.Client{Timeout: 5 * time.Second},
		now:      time.Now,
		keys:     map[string]verificationKey{},
	}
}

func (v *Verifier) Verify(ctx context.Context, tokenString string) (Identity, error) {
	if tokenString == "" {
		return Identity{}, errors.New("token is empty")
	}

	claims := &Claims{}
	parser := jwt.NewParser(
		jwt.WithAudience(v.audience),
		jwt.WithExpirationRequired(),
		jwt.WithIssuer(v.issuer),
		jwt.WithLeeway(30*time.Second),
		jwt.WithTimeFunc(v.now),
		jwt.WithValidMethods([]string{"EdDSA", "RS256", "RS384", "RS512", "PS256", "PS384", "PS512", "ES256", "ES384", "ES512"}),
	)

	token, err := parser.ParseWithClaims(tokenString, claims, func(token *jwt.Token) (any, error) {
		return v.keyForToken(ctx, token)
	})
	if err != nil {
		return Identity{}, err
	}
	if !token.Valid {
		return Identity{}, errors.New("token is invalid")
	}
	if claims.Subject == "" {
		return Identity{}, errors.New("token subject is required")
	}
	if !claims.EmailVerified {
		return Identity{}, errors.New("verified email is required")
	}

	return Identity{Subject: claims.Subject, Email: claims.Email, EmailVerified: true}, nil
}

func (v *Verifier) keyForToken(ctx context.Context, token *jwt.Token) (any, error) {
	alg, _ := token.Header["alg"].(string)
	kid, _ := token.Header["kid"].(string)

	if key, ok := v.cachedKey(kid, alg); ok {
		return key.key, nil
	}
	if err := v.refreshKeys(ctx); err != nil {
		return nil, err
	}
	if key, ok := v.cachedKey(kid, alg); ok {
		return key.key, nil
	}

	return nil, fmt.Errorf("verification key not found")
}

func (v *Verifier) cachedKey(kid string, alg string) (verificationKey, bool) {
	v.mu.RLock()
	defer v.mu.RUnlock()

	if v.fetchedAt.IsZero() || v.now().Sub(v.fetchedAt) > v.ttl {
		return verificationKey{}, false
	}
	if kid != "" {
		key, ok := v.keys[kid]
		return key, ok && algMatches(key.alg, alg)
	}
	if len(v.keys) == 1 {
		for _, key := range v.keys {
			return key, algMatches(key.alg, alg)
		}
	}
	return verificationKey{}, false
}

func (v *Verifier) refreshKeys(ctx context.Context) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, v.jwksURL, nil)
	if err != nil {
		return err
	}

	resp, err := v.client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("jwks endpoint returned %d", resp.StatusCode)
	}

	var set jwksDocument
	if err := json.NewDecoder(resp.Body).Decode(&set); err != nil {
		return err
	}

	keys := make(map[string]verificationKey, len(set.Keys))
	for index, raw := range set.Keys {
		key, err := raw.toVerificationKey()
		if err != nil {
			return fmt.Errorf("parse jwk %d: %w", index, err)
		}
		keyID := raw.Kid
		if keyID == "" {
			keyID = fmt.Sprintf("key-%d", index)
		}
		keys[keyID] = key
	}
	if len(keys) == 0 {
		return errors.New("jwks endpoint returned no keys")
	}

	v.mu.Lock()
	v.keys = keys
	v.fetchedAt = v.now()
	v.mu.Unlock()
	return nil
}

type jwksDocument struct {
	Keys []jwkDocument `json:"keys"`
}

type jwkDocument struct {
	Kty string `json:"kty"`
	Kid string `json:"kid,omitempty"`
	Alg string `json:"alg,omitempty"`
	Use string `json:"use,omitempty"`
	Crv string `json:"crv,omitempty"`
	N   string `json:"n,omitempty"`
	E   string `json:"e,omitempty"`
	X   string `json:"x,omitempty"`
	Y   string `json:"y,omitempty"`
}

func (j jwkDocument) toVerificationKey() (verificationKey, error) {
	switch j.Kty {
	case "OKP":
		if j.Crv != "Ed25519" {
			return verificationKey{}, fmt.Errorf("unsupported OKP curve %q", j.Crv)
		}
		x, err := decodeBase64URL(j.X)
		if err != nil {
			return verificationKey{}, err
		}
		if len(x) != ed25519.PublicKeySize {
			return verificationKey{}, fmt.Errorf("invalid Ed25519 public key length")
		}
		return verificationKey{key: ed25519.PublicKey(x), alg: defaultAlg(j.Alg, "EdDSA")}, nil
	case "RSA":
		n, err := decodeBase64URL(j.N)
		if err != nil {
			return verificationKey{}, err
		}
		e, err := decodeBase64URL(j.E)
		if err != nil {
			return verificationKey{}, err
		}
		exponent := new(big.Int).SetBytes(e).Int64()
		if exponent <= 0 {
			return verificationKey{}, fmt.Errorf("invalid RSA exponent")
		}
		return verificationKey{
			key: &rsa.PublicKey{N: new(big.Int).SetBytes(n), E: int(exponent)},
			alg: defaultAlg(j.Alg, "RS256"),
		}, nil
	case "EC":
		curve, err := ellipticCurve(j.Crv)
		if err != nil {
			return verificationKey{}, err
		}
		x, err := decodeBase64URL(j.X)
		if err != nil {
			return verificationKey{}, err
		}
		y, err := decodeBase64URL(j.Y)
		if err != nil {
			return verificationKey{}, err
		}
		pub := &ecdsa.PublicKey{Curve: curve, X: new(big.Int).SetBytes(x), Y: new(big.Int).SetBytes(y)}
		if !curve.IsOnCurve(pub.X, pub.Y) {
			return verificationKey{}, fmt.Errorf("invalid EC public key")
		}
		return verificationKey{key: pub, alg: defaultAlg(j.Alg, defaultECAlg(j.Crv))}, nil
	default:
		return verificationKey{}, fmt.Errorf("unsupported key type %q", j.Kty)
	}
}

func decodeBase64URL(value string) ([]byte, error) {
	if value == "" {
		return nil, errors.New("base64url value is required")
	}
	decoded, err := base64.RawURLEncoding.DecodeString(value)
	if err == nil {
		return decoded, nil
	}
	return base64.URLEncoding.DecodeString(value)
}

func algMatches(keyAlg string, tokenAlg string) bool {
	return keyAlg == "" || tokenAlg == "" || keyAlg == tokenAlg
}

func defaultAlg(value string, fallback string) string {
	if value != "" {
		return value
	}
	return fallback
}

func defaultECAlg(curve string) string {
	switch curve {
	case "P-384":
		return "ES384"
	case "P-521":
		return "ES512"
	default:
		return "ES256"
	}
}

func ellipticCurve(name string) (elliptic.Curve, error) {
	switch name {
	case "P-256":
		return elliptic.P256(), nil
	case "P-384":
		return elliptic.P384(), nil
	case "P-521":
		return elliptic.P521(), nil
	default:
		return nil, fmt.Errorf("unsupported EC curve %q", name)
	}
}
