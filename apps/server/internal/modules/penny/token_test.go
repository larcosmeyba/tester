package penny

import (
	"strings"
	"testing"
	"time"

	domain "github.com/helpthehive/server/internal/domain/penny"
)

const testSecret = "0123456789abcdef0123456789abcdef"

func TestSignerRejectsWeakSecrets(t *testing.T) {
	if _, err := NewSigner("short"); err == nil {
		t.Fatal("a short secret was accepted; a forgeable token is a tool call as somebody else")
	}
}

func TestTokenRoundTrip(t *testing.T) {
	signer, err := NewSigner(testSecret)
	if err != nil {
		t.Fatal(err)
	}

	token, err := signer.Sign(ToolClaims{
		TurnID: "turn-1", UserID: "user-1", ConversationID: "conv-1",
		Scopes: []domain.Scope{domain.ScopePantry},
	})
	if err != nil {
		t.Fatal(err)
	}

	claims, err := signer.Verify(token)
	if err != nil {
		t.Fatal(err)
	}
	if claims.UserID != "user-1" || claims.TurnID != "turn-1" {
		t.Fatalf("claims did not survive the round trip: %+v", claims)
	}
	if claims.Identity().Subject != "user-1" {
		t.Fatal("Identity did not return the token's subject")
	}
	// The identity a tool runs as must carry nothing it does not need.
	if claims.Identity().Email != "" {
		t.Fatal("the tool identity carried an email address")
	}
}

// A token whose payload was edited must not verify, however plausible the edit.
func TestTamperedTokenIsRejected(t *testing.T) {
	signer, _ := NewSigner(testSecret)
	token, _ := signer.Sign(ToolClaims{TurnID: "t", UserID: "user-1"})

	payload, signature, _ := strings.Cut(token, ".")
	// Flip a character in the payload, keeping the original signature.
	tampered := payload[:len(payload)-1] + "A" + "." + signature
	if _, err := signer.Verify(tampered); err == nil {
		t.Fatal("a tampered token verified")
	}

	// And a payload re-signed with a different secret.
	other, _ := NewSigner("ffffffffffffffffffffffffffffffff")
	forged, _ := other.Sign(ToolClaims{TurnID: "t", UserID: "user-1"})
	if _, err := signer.Verify(forged); err == nil {
		t.Fatal("a token signed with a different secret verified")
	}
}

func TestExpiredTokenIsRejected(t *testing.T) {
	signer, _ := NewSigner(testSecret)
	token, _ := signer.Sign(ToolClaims{TurnID: "t", UserID: "user-1"})

	signer.now = func() time.Time { return time.Now().Add(TokenTTL + time.Second) }
	if _, err := signer.Verify(token); err != ErrTokenExpired {
		t.Fatalf("expired token error = %v, want ErrTokenExpired", err)
	}
}

// The router narrows what a turn may do. The token carries that narrowing, and
// this is where it is enforced.
func TestPermitsHonoursTheGrantedScopes(t *testing.T) {
	claims := ToolClaims{Scopes: []domain.Scope{domain.ScopePantry}}

	if _, err := claims.Permits("pantry.list"); err != nil {
		t.Fatalf("a granted tool was refused: %v", err)
	}
	if _, err := claims.Permits("budget.set_weekly"); err == nil {
		t.Fatal("a tool outside the granted scopes was permitted")
	}
	if _, err := claims.Permits("pantry.delete_everything"); err == nil {
		t.Fatal("a tool that does not exist was permitted")
	}
}
