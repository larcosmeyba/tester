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

// BenefitsFilingKit serves the transcription answer-sheet PDF for an
// application: the applicant's answers laid out as a ruled sheet for copying
// onto the official paper form by hand.
//
// It is served exactly like the generated application PDFs: behind the Bearer
// <redacted>, scoped to the viewer by the service, over a path that means
// nothing to anyone else. The answer sheet carries the same household data as
// the application, so it gets the same treatment — no public link, no signed
// object-storage URL.
func BenefitsFilingKit(service *benefits.Service, logger *slog.Logger) http.HandlerFunc {
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

		applicationID := strings.TrimSpace(chi.URLParam(r, "applicationID"))
		if applicationID == "" {
			http.Error(w, "not found", http.StatusNotFound)
			return
		}

		data, err := service.FilingKit(r.Context(), identity, applicationID)
		if errors.Is(err, domain.ErrNotFound) {
			// Not found rather than forbidden: an application belonging to
			// somebody else must be indistinguishable from one that does not
			// exist.
			http.Error(w, "not found", http.StatusNotFound)
			return
		}
		if err != nil {
			logger.Error("benefits filing kit could not be generated",
				"application_id", applicationID, "error", err)
			http.Error(w, "the filing kit could not be generated", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/pdf")
		w.Header().Set("Content-Length", strconv.Itoa(len(data)))
		w.Header().Set("Content-Disposition", `attachment; filename="filing-kit.pdf"`)
		w.Header().Set("X-Content-Type-Options", "nosniff")
		// Never cached by a proxy, and never written to a shared disk cache.
		w.Header().Set("Cache-Control", "private, no-store, max-age=0")
		w.Header().Set("Referrer-Policy", "no-referrer")

		if _, err := w.Write(data); err != nil {
			logger.Warn("benefits filing kit write interrupted", "application_id", applicationID, "error", err)
		}
	}
}
