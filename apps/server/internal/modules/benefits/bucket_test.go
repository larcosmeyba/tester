package benefits

import (
	"context"
	"strings"
	"testing"
)

// The bucket store's object naming and its refusals. Reaching Cloud Storage
// needs credentials and a bucket, so what is tested here is everything that
// happens before the network: the rules that decide which object a key names,
// which is where a path-traversal or a cross-tenant leak would come from.

func TestABucketStoreNeedsABucketName(t *testing.T) {
	for _, name := range []string{"", "   ", "gs://"} {
		if _, err := NewBucketDocumentStore(context.Background(), BucketConfig{Bucket: name}); err == nil {
			t.Errorf("NewBucketDocumentStore(%q) succeeded; a store with no bucket would write nowhere", name)
		}
	}
}

func TestObjectNamesStayInsideTheirPrefix(t *testing.T) {
	store := &BucketDocumentStore{bucket: "b", prefix: "benefits"}

	name, err := store.objectName("user-1/app-2/final.pdf")
	if err != nil {
		t.Fatalf("objectName() error = %v", err)
	}
	if name != "benefits/user-1/app-2/final.pdf" {
		t.Fatalf("object name = %q, want it under the prefix", name)
	}

	unprefixed := &BucketDocumentStore{bucket: "b"}
	name, err = unprefixed.objectName("user-1/app-2/final.pdf")
	if err != nil {
		t.Fatalf("objectName() error = %v", err)
	}
	if name != "user-1/app-2/final.pdf" {
		t.Fatalf("object name = %q, want the key unchanged when there is no prefix", name)
	}
}

// The rule that matters: a key must not be able to address another user's
// document, or anything outside the prefix.
func TestATraversingKeyIsRefused(t *testing.T) {
	store := &BucketDocumentStore{bucket: "b", prefix: "benefits"}

	for _, key := range []string{
		"../other-user/app/final.pdf",
		"user-1/../../etc/passwd",
		"user-1/./app/final.pdf",
		"user-1//app/final.pdf",
		"",
		"   ",
	} {
		if _, err := store.objectName(key); err == nil {
			t.Errorf("object(%q) was accepted; a key must not be able to leave its prefix", key)
		}
	}
}

func TestKeysAreNamespacedByUser(t *testing.T) {
	// documentKey is what the service uses, and it puts the user id first so
	// one person's documents cannot collide with another's.
	a := documentKey("user-a", "app-1", "final")
	b := documentKey("user-b", "app-1", "final")
	if a == b {
		t.Fatal("two users' documents for the same application id share a key")
	}
	if !strings.HasPrefix(a, "user-a") || !strings.HasPrefix(b, "user-b") {
		t.Fatalf("keys = %q and %q, want each namespaced by its owner", a, b)
	}
}

func TestPublicAccessWarningIsDistinguishableFromAFailure(t *testing.T) {
	if !IsPublicAccessWarning(errPublicAccessNotPrevented) {
		t.Error("the public-access warning is not recognised as one")
	}
	if IsPublicAccessWarning(ErrDocumentNotFound) {
		t.Error("an unrelated error was treated as the public-access warning; a real connection failure must fail the boot")
	}
}
