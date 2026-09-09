// Package penny is the assistant's service layer: it owns conversations, calls
// the agent, executes the tools the agent asks for, and decides what the agent
// is allowed to ask for in the first place.
//
// The shape of this package follows from one deployment fact. The agent process
// holds no database credentials. Everything it wants done, it asks this package
// to do, over HTTP, carrying a token this package minted seconds earlier. So
// this package is where authority lives, and the agent is where language lives.
package penny

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/helpthehive/server/internal/auth"
	domain "github.com/helpthehive/server/internal/domain/penny"
)

// A tool token is the agent's authority for one turn.
//
// It is not the user's token. The user's bearer token would let the agent do
// anything the user can do, for as long as it lasts, from anywhere — and the
// agent is the process that hands text to a third-party model, so it is the
// process least entitled to that. This token instead names one turn, expires in
// under two minutes, and carries only the scopes the router granted.
//
// It is signed rather than stored because it is checked on the hot path of
// every tool call and there is nothing about it worth a database round trip.
// Revocation is by expiry: a turn that has finished has no use for its token,
// and one that has not will finish inside the TTL or be abandoned.
type ToolClaims struct {
	TurnID         string         `json:"turn"`
	UserID         string         `json:"sub"`
	ConversationID string         `json:"conv"`
	Scopes         []domain.Scope `json:"scopes"`
	// Unix seconds.
	ExpiresAt int64 `json:"exp"`
}

var (
	ErrTokenInvalid = errors.New("invalid tool token")
	ErrTokenExpired = errors.New("tool token expired")
)

// TokenTTL is short on purpose. It bounds a stolen token to roughly the length
// of the turn it was minted for, and a turn that needs longer than this has
// gone wrong in a way that should fail rather than continue.
const TokenTTL = 90 * time.Second

// Signer mints and verifies tool tokens.
type Signer struct {
	secret []byte
	now    func() time.Time
}

func NewSigner(secret string) (*Signer, error) {
	// 32 bytes because the token is the whole of the gateway's authentication.
	// A short secret here is a forgeable token, and a forged token is a tool
	// call running as a user who did not ask for it.
	if len(secret) < 32 {
		return nil, errors.New("PENNY_TOOL_TOKEN_SECRET must be at least 32 characters")
	}
	return &Signer{secret: []byte(secret), now: time.Now}, nil
}

func (s *Signer) Sign(claims ToolClaims) (string, error) {
	claims.ExpiresAt = s.now().Add(TokenTTL).Unix()
	payload, err := json.Marshal(claims)
	if err != nil {
		return "", err
	}
	encoded := base64.RawURLEncoding.EncodeToString(payload)
	return encoded + "." + s.sign(encoded), nil
}

// Verify checks a token and returns what it claims. A caller must still check
// that the claimed scopes permit the tool being called; this only establishes
// that the claims are ones this server made and that they have not expired.
func (s *Signer) Verify(token string) (ToolClaims, error) {
	encoded, signature, ok := strings.Cut(strings.TrimSpace(token), ".")
	if !ok {
		return ToolClaims{}, ErrTokenInvalid
	}
	// Constant time: a signature check that returns early on the first wrong
	// byte tells an attacker how much of a forgery was right.
	if !hmac.Equal([]byte(signature), []byte(s.sign(encoded))) {
		return ToolClaims{}, ErrTokenInvalid
	}

	payload, err := base64.RawURLEncoding.DecodeString(encoded)
	if err != nil {
		return ToolClaims{}, ErrTokenInvalid
	}
	var claims ToolClaims
	if err := json.Unmarshal(payload, &claims); err != nil {
		return ToolClaims{}, ErrTokenInvalid
	}
	if claims.UserID == "" || claims.TurnID == "" {
		return ToolClaims{}, ErrTokenInvalid
	}
	if s.now().Unix() > claims.ExpiresAt {
		return ToolClaims{}, ErrTokenExpired
	}
	return claims, nil
}

func (s *Signer) sign(encoded string) string {
	mac := hmac.New(sha256.New, s.secret)
	mac.Write([]byte(encoded))
	return base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
}

// Permits reports whether these claims allow a named tool. Both halves matter:
// the tool must exist in the registry, and its scope must have been granted for
// this turn.
func (c ToolClaims) Permits(name string) (domain.Tool, error) {
	tool, err := domain.Lookup(name)
	if err != nil {
		return domain.Tool{}, err
	}
	if !tool.Requires(c.Scopes) {
		return domain.Tool{}, fmt.Errorf("tool %s is not available in this conversation", name)
	}
	return tool, nil
}

// Identity is the user this token was minted for. It is the only identity any
// tool call runs as: nothing a model puts in a tool call's arguments reaches
// this method, and a handler that wanted to act as somebody else would have to
// be given a different token to do it.
//
// Email is deliberately empty. Tools do not need it, and an identity that
// carries one is an identity that can leak one.
func (c ToolClaims) Identity() auth.Identity {
	return auth.Identity{Subject: c.UserID}
}

func (c ToolClaims) Turn() string { return c.TurnID }

func (c ToolClaims) Conversation() string { return c.ConversationID }
