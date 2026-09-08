package serverhttp

import (
	"errors"
	"log/slog"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/helpthehive/server/internal/auth"
	domain "github.com/helpthehive/server/internal/domain/benefits"
	"github.com/helpthehive/server/internal/modules/benefits"
)

// The one route in this server that returns bytes rather than JSON.
//
// A completed benefits application is a household roster, an income statement
// and often a Social Security number in a single file, so it is served the same
// way every other piece of a user's data is: behind the bearer token, scoped to
// the viewer, over a path that means nothing to anyone else. There is no signed
// object-storage URL, because a signed URL is a shareable capability to read
// somebody's application, and no public link of any kind.

// BenefitsDocuments serves generated application PDFs.
func BenefitsDocuments(service *benefits.Service, logger *slog.Logger) http.HandlerFunc {
	if logger == nil {
		logger = slog.Default()
	}
	return func(w http.ResponseWriter, r *http.Request) {
		if service == nil {
			http.Error(w, "the benefits system is not available on this server", http.StatusNotFound)
			return
		}
		identity, err := auth.RequireIdentity(r.Context())
		if err != nil {
			http.Error(w, "authentication required", http.StatusUnauthorized)
			return
		}

		applicationID := chi.URLParam(r, "applicationID")
		kind := strings.TrimSpace(r.URL.Query().Get("kind"))
		if kind == "" {
			kind = "draft"
		}
		if kind != "draft" && kind != "final" {
			http.Error(w, "kind must be draft or final", http.StatusBadRequest)
			return
		}

		data, record, err := service.Document(r.Context(), identity, applicationID, kind)
		if errors.Is(err, domain.ErrNotFound) {
			// Not found rather than forbidden: an application belonging to
			// somebody else must be indistinguishable from one that does not
			// exist.
			http.Error(w, "not found", http.StatusNotFound)
			return
		}
		if err != nil {
			logger.Error("benefits document could not be served",
				"application_id", applicationID, "kind", kind, "error", err)
			http.Error(w, "the document could not be read", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/pdf")
		w.Header().Set("Content-Length", strconv.Itoa(len(data)))
		w.Header().Set("Content-Disposition", `attachment; filename="application-`+kind+`.pdf"`)
		w.Header().Set("X-Content-Type-Options", "nosniff")
		// Never cached by a proxy, and never written to a shared disk cache.
		w.Header().Set("Cache-Control", "private, no-store, max-age=0")
		w.Header().Set("Referrer-Policy", "no-referrer")
		w.Header().Set("ETag", `"`+record.SHA256+`"`)

		if _, err := w.Write(data); err != nil {
			logger.Warn("benefits document write interrupted", "application_id", applicationID, "error", err)
		}
	}
}
