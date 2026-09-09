package benefits

import (
	"context"
	"errors"
	"fmt"
	"io"
	"strings"
	"time"

	"cloud.google.com/go/storage"
)

// BucketDocumentStore keeps generated applications in a private Cloud Storage
// bucket, so they survive a restart and are the same on every instance.
//
// It satisfies DocumentStore exactly, which is why the service does not change
// to use it: the seam was there from the start.
//
// What it deliberately does NOT do is hand out signed URLs. A signed URL is a
// bearer capability to read somebody's completed benefits application — their
// household, their income, often their Social Security number — that works for
// anyone who has the link, outlives the session, and leaves no trace of who
// used it. Bytes are read here, on the server, and served through the same
// authenticated route as before. The bucket must have uniform bucket-level
// access with no public members; nothing in this file will save an operator who
// makes it public.
type BucketDocumentStore struct {
	client *storage.Client
	bucket string
	prefix string
}

// BucketConfig is what the store needs to reach a bucket.
type BucketConfig struct {
	// Bucket is the name only, no gs:// scheme.
	Bucket string
	// Prefix optionally namespaces objects, for a bucket shared with something
	// else. Most deployments leave it empty.
	Prefix string
}

// NewBucketDocumentStore connects to Cloud Storage.
//
// Credentials come from the ambient service account — Application Default
// Credentials — which on Cloud Run is the revision's own identity. No key file
// is read and none should exist.
func NewBucketDocumentStore(ctx context.Context, cfg BucketConfig) (*BucketDocumentStore, error) {
	bucket := strings.TrimSpace(strings.TrimPrefix(cfg.Bucket, "gs://"))
	if bucket == "" {
		return nil, fmt.Errorf("a bucket document store needs a bucket name")
	}
	client, err := storage.NewClient(ctx)
	if err != nil {
		return nil, fmt.Errorf("connect to cloud storage: %w", err)
	}
	return &BucketDocumentStore{
		client: client,
		bucket: bucket,
		prefix: strings.Trim(strings.TrimSpace(cfg.Prefix), "/"),
	}, nil
}

// Close releases the underlying client.
func (s *BucketDocumentStore) Close() error { return s.client.Close() }

// objectName turns a storage key into the object it names, or refuses it.
//
// Kept free of the storage client so the rule that stops one user's key
// addressing another user's document can be tested without a bucket.
func (s *BucketDocumentStore) objectName(key string) (string, error) {
	cleaned := strings.Trim(strings.TrimSpace(key), "/")
	if cleaned == "" {
		return "", fmt.Errorf("empty document key")
	}
	// The keys this package generates contain no traversal, but an object name
	// that walks out of its prefix is not a thing to leave to convention.
	for _, segment := range strings.Split(cleaned, "/") {
		if segment == "." || segment == ".." || segment == "" {
			return "", fmt.Errorf("document key %q is not a valid object name", key)
		}
	}
	if s.prefix != "" {
		return s.prefix + "/" + cleaned, nil
	}
	return cleaned, nil
}

func (s *BucketDocumentStore) object(key string) (*storage.ObjectHandle, error) {
	name, err := s.objectName(key)
	if err != nil {
		return nil, err
	}
	return s.client.Bucket(s.bucket).Object(name), nil
}

func (s *BucketDocumentStore) Put(ctx context.Context, key string, data []byte) error {
	object, err := s.object(key)
	if err != nil {
		return err
	}

	writer := object.NewWriter(ctx)
	writer.ContentType = "application/pdf"
	// Not a document any cache should hold a copy of.
	writer.CacheControl = "private, no-store"
	if _, err := writer.Write(data); err != nil {
		// Abandon the object rather than leaving a half-written application in
		// the bucket for someone to download later.
		_ = writer.Close()
		return fmt.Errorf("write document: %w", err)
	}
	if err := writer.Close(); err != nil {
		return fmt.Errorf("write document: %w", err)
	}
	return nil
}

func (s *BucketDocumentStore) Get(ctx context.Context, key string) ([]byte, error) {
	object, err := s.object(key)
	if err != nil {
		return nil, err
	}
	reader, err := object.NewReader(ctx)
	if err != nil {
		if errors.Is(err, storage.ErrObjectNotExist) {
			return nil, ErrDocumentNotFound
		}
		return nil, fmt.Errorf("read document: %w", err)
	}
	defer reader.Close()

	data, err := io.ReadAll(reader)
	if err != nil {
		return nil, fmt.Errorf("read document: %w", err)
	}
	return data, nil
}

func (s *BucketDocumentStore) Delete(ctx context.Context, key string) error {
	object, err := s.object(key)
	if err != nil {
		return err
	}
	if err := object.Delete(ctx); err != nil && !errors.Is(err, storage.ErrObjectNotExist) {
		return fmt.Errorf("delete document: %w", err)
	}
	return nil
}

// ErrDocumentNotFound is returned when a key has no document behind it. It is
// declared here so both stores can report the same absence.
var ErrDocumentNotFound = errors.New("document not found")

// bucketProbeTimeout bounds the start-up check below. A bucket that cannot be
// reached should fail the boot quickly rather than on somebody's first
// application.
const bucketProbeTimeout = 10 * time.Second

// Verify checks the bucket exists and this service account can see it.
//
// It runs at start-up on purpose: discovering a missing bucket or a missing IAM
// binding when a user presses Generate means losing their work and showing them
// an error they cannot act on.
func (s *BucketDocumentStore) Verify(ctx context.Context) error {
	ctx, cancel := context.WithTimeout(ctx, bucketProbeTimeout)
	defer cancel()

	attrs, err := s.client.Bucket(s.bucket).Attrs(ctx)
	if err != nil {
		return fmt.Errorf("benefits document bucket %q is not reachable: %w", s.bucket, err)
	}
	if attrs.PublicAccessPrevention == storage.PublicAccessPreventionUnknown ||
		attrs.PublicAccessPrevention == storage.PublicAccessPreventionInherited {
		// Not fatal — an organisation policy may enforce it above the bucket —
		// but a bucket of completed benefits applications without public access
		// prevention set on it is worth saying out loud every single boot.
		return errPublicAccessNotPrevented
	}
	return nil
}

// errPublicAccessNotPrevented is returned by Verify as a warning-level result.
var errPublicAccessNotPrevented = errors.New(
	"public access prevention is not enforced on the benefits document bucket")

// IsPublicAccessWarning reports whether an error from Verify is the
// public-access warning rather than a connection failure.
func IsPublicAccessWarning(err error) bool { return errors.Is(err, errPublicAccessNotPrevented) }
