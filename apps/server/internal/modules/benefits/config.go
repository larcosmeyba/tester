package benefits

import (
	"fmt"
	"log/slog"
	"os"
	"strings"

	"github.com/helpthehive/server/internal/db"
	domain "github.com/helpthehive/server/internal/domain/benefits"
	"github.com/helpthehive/server/internal/modules/benefits/secrets"
	"github.com/helpthehive/server/internal/modules/users"
)

// Config selects where the benefits system reads forms from and writes
// documents to. It is read from the environment here rather than through
// internal/config, matching how the meal AI provider is configured.
type Config struct {
	// FormsDir holds the versioned mapping files and their official templates.
	// Empty means no forms are installed: the server runs, and every benefits
	// query reports that there is nothing to fill.
	FormsDir string
	// DocumentsDir is where generated PDFs are kept.
	DocumentsDir string
}

func LoadConfig() Config {
	return Config{
		FormsDir:     getEnv("BENEFITS_FORMS_DIR", "forms"),
		DocumentsDir: getEnv("BENEFITS_DOCUMENTS_DIR", ""),
	}
}

func getEnv(key, fallback string) string {
	if value := strings.TrimSpace(os.Getenv(key)); value != "" {
		return value
	}
	return fallback
}

// New builds the benefits service from configuration.
//
// Two things fail at start-up rather than in front of an applicant: a mapping
// file that does not match its template, and a missing document directory. Both
// are configuration mistakes, and both would otherwise surface as a broken
// application halfway through somebody's SNAP form.
func New(cfg Config, store *db.Store, usersService *users.Service, logger *slog.Logger) (*Service, error) {
	if logger == nil {
		logger = slog.Default()
	}

	registry, err := LoadRegistry(cfg.FormsDir)
	if err != nil {
		return nil, fmt.Errorf("benefits forms: %w", err)
	}

	cipher, err := secrets.LoadCipher()
	if err != nil {
		return nil, fmt.Errorf("benefits encryption: %w", err)
	}
	if !cipher.Available() {
		// Not fatal — most fields are not sensitive and the system is useful
		// without one — but it must be visible, because any form asking for a
		// Social Security number will report it as unavailable rather than
		// storing one in the clear.
		logger.Warn("BENEFITS_ENCRYPTION_KEY is not set: sensitive benefits answers cannot be stored on this server")
	}

	documentsDir := cfg.DocumentsDir
	if documentsDir == "" {
		documentsDir = "data/benefits-documents"
		// Worth saying out loud: on a container filesystem this directory does
		// not survive a restart or a second instance, so a draft can vanish
		// between requests. Set BENEFITS_DOCUMENTS_DIR to a durable volume, or
		// give DocumentStore a bucket-backed implementation, before this is
		// relied on in production.
		logger.Warn("BENEFITS_DOCUMENTS_DIR is not set: generated applications are being written to a local directory that may not be durable",
			"directory", documentsDir)
	}
	documents, err := NewFileDocumentStore(documentsDir)
	if err != nil {
		return nil, fmt.Errorf("benefits documents: %w", err)
	}

	logger.Info("benefits system ready",
		"forms", registry.Len(),
		"vocabulary_version", domain.VocabularyVersion,
		"encryption", cipher.Available(),
	)

	return NewService(store, usersService, registry, documents, cipher, logger), nil
}
