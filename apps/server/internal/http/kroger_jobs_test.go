package serverhttp

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/helpthehive/server/internal/modules/grocery"
)

type stubPriceSyncer struct {
	stats grocery.FeedStats
	err   error
	calls int
}

func (s *stubPriceSyncer) Sync(context.Context) (grocery.FeedStats, error) {
	s.calls++
	return s.stats, s.err
}

func krogerSyncTestHandler(deps JobsDeps) http.Handler {
	return KrogerPriceSync(deps, slog.New(slog.DiscardHandler))
}

func jobRequest(secret string) *http.Request {
	request := httptest.NewRequest(http.MethodPost, "/internal/jobs/kroger-price-sync", nil)
	if secret != "" {
		request.Header.Set("X-Job-Secret", secret)
	}
	return request
}

func TestKrogerPriceSyncRuns(t *testing.T) {
	syncer := &stubPriceSyncer{stats: grocery.FeedStats{Checked: 70, Live: 12}}
	handler := krogerSyncTestHandler(JobsDeps{JobSecret: "secret", KrogerFeed: syncer})

	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, jobRequest("secret"))
	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200; body = %s", recorder.Code, recorder.Body.String())
	}
	if syncer.calls != 1 {
		t.Fatalf("sync calls = %d, want 1", syncer.calls)
	}
	if !strings.Contains(recorder.Body.String(), `"Live":12`) {
		t.Fatalf("body = %s, want the stats", recorder.Body.String())
	}
}

func TestKrogerPriceSyncRejectsBadSecret(t *testing.T) {
	syncer := &stubPriceSyncer{}
	handler := krogerSyncTestHandler(JobsDeps{JobSecret: "secret", KrogerFeed: syncer})

	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, jobRequest("wrong"))
	if recorder.Code != http.StatusForbidden {
		t.Fatalf("status = %d, want 403", recorder.Code)
	}
	if syncer.calls != 0 {
		t.Fatalf("sync calls = %d, want 0", syncer.calls)
	}
}

func TestKrogerPriceSyncDisabledWithoutSecret(t *testing.T) {
	syncer := &stubPriceSyncer{}
	handler := krogerSyncTestHandler(JobsDeps{KrogerFeed: syncer})

	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, jobRequest("secret"))
	if recorder.Code != http.StatusServiceUnavailable {
		t.Fatalf("status = %d, want 503", recorder.Code)
	}
}

func TestKrogerPriceSyncUnavailableWithoutFeed(t *testing.T) {
	handler := krogerSyncTestHandler(JobsDeps{JobSecret: "secret"})

	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, jobRequest("secret"))
	if recorder.Code != http.StatusServiceUnavailable {
		t.Fatalf("status = %d, want 503", recorder.Code)
	}
}

func TestKrogerPriceSyncFailureIs500(t *testing.T) {
	syncer := &stubPriceSyncer{err: errors.New("db down")}
	handler := krogerSyncTestHandler(JobsDeps{JobSecret: "secret", KrogerFeed: syncer})

	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, jobRequest("secret"))
	if recorder.Code != http.StatusInternalServerError {
		t.Fatalf("status = %d, want 500", recorder.Code)
	}
	if strings.Contains(recorder.Body.String(), "db down") {
		t.Fatalf("body leaks internals: %s", recorder.Body.String())
	}
}
