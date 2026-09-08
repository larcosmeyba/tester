// Package secrets encrypts the handful of benefits answers that must not sit in
// the database in the clear: Social Security numbers, immigration status, and
// benefit case numbers.
//
// The key lives in the server's environment and nowhere else. It is never
// logged, never returned by the API, and never sent to an AI provider. What the
// API returns for a sensitive answer is at most its last four characters.
package secrets

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"errors"
	"fmt"
	"os"
	"strings"
)

// ErrNoKey means no encryption key is configured. It is a hard failure, not a
// fallback to plaintext: writing an SSN unencrypted because a key was missing
// is exactly the sort of quiet degradation that turns into a breach.
var ErrNoKey = errors.New("BENEFITS_ENCRYPTION_KEY is not set, so sensitive answers cannot be stored")

// Cipher seals and opens sensitive answers.
type Cipher struct {
	aead cipher.AEAD
}

// LoadCipher reads the key from the environment. BENEFITS_ENCRYPTION_KEY is a
// base64-encoded 32-byte key.
//
// A nil Cipher is returned when no key is set, and that is a usable state: the
// benefits system runs, but any mapping that asks for a sensitive answer
// reports it as unavailable rather than storing one. That way a development
// machine without a key is not silently a machine that stores SSNs in the open.
func LoadCipher() (*Cipher, error) {
	raw := strings.TrimSpace(os.Getenv("BENEFITS_ENCRYPTION_KEY"))
	if raw == "" {
		return nil, nil
	}
	key, err := base64.StdEncoding.DecodeString(raw)
	if err != nil {
		return nil, fmt.Errorf("BENEFITS_ENCRYPTION_KEY is not valid base64")
	}
	return NewCipher(key)
}

func NewCipher(key []byte) (*Cipher, error) {
	if len(key) != 32 {
		return nil, fmt.Errorf("BENEFITS_ENCRYPTION_KEY must decode to 32 bytes, got %d", len(key))
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	aead, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	return &Cipher{aead: aead}, nil
}

// Seal encrypts a value, binding it to the user and field path it belongs to.
//
// The binding matters: without it, a ciphertext copied from one row to another
// would still decrypt, so a bug or a malicious write could move one applicant's
// Social Security number onto another applicant's form. With it, a ciphertext
// that has been moved simply fails to open.
func (c *Cipher) Seal(userID, fieldPath, rowID, plaintext string) ([]byte, error) {
	if c == nil {
		return nil, ErrNoKey
	}
	nonce := make([]byte, c.aead.NonceSize())
	if _, err := rand.Read(nonce); err != nil {
		return nil, err
	}
	sealed := c.aead.Seal(nil, nonce, []byte(plaintext), associatedData(userID, fieldPath, rowID))
	return append(nonce, sealed...), nil
}

// Open decrypts a value. It fails if the ciphertext was written for a different
// user, a different field, or a different group row.
func (c *Cipher) Open(userID, fieldPath, rowID string, ciphertext []byte) (string, error) {
	if c == nil {
		return "", ErrNoKey
	}
	nonceSize := c.aead.NonceSize()
	if len(ciphertext) <= nonceSize {
		return "", errors.New("stored value is too short to be a sealed answer")
	}
	plaintext, err := c.aead.Open(nil, ciphertext[:nonceSize], ciphertext[nonceSize:], associatedData(userID, fieldPath, rowID))
	if err != nil {
		return "", errors.New("a sensitive answer could not be decrypted; it may have been written with a different key")
	}
	return string(plaintext), nil
}

// Available reports whether sensitive answers can be stored at all.
func (c *Cipher) Available() bool { return c != nil }

func associatedData(userID, fieldPath, rowID string) []byte {
	return []byte(userID + "\x00" + fieldPath + "\x00" + rowID)
}

// Hint is what the API is allowed to show for a sensitive answer: the last four
// characters, so an applicant can recognise which number is on file without the
// server ever handing it back.
func Hint(plaintext string) string {
	runes := []rune(plaintext)
	if len(runes) <= 4 {
		return strings.Repeat("*", len(runes))
	}
	return "*** " + string(runes[len(runes)-4:])
}
