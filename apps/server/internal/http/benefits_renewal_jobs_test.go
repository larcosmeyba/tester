package serverhttp

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/helpthehive/server/internal/modules/benefits"
	"github.com/helpthehive/server/internal/notify"
)

type stubSweeper struct {
	counts benefits.SweepCounts
	err    error
	calls  int
}

func (s *stubSweeper) SweepRenewals(_ context.Context, _ benefits.RenewalPushSender) (benefits.SweepCounts, error) {
	s.calls++
	return s.counts, s.err
}

type stubSender struct{}

func (stubSender) Send(context.Context, []string, notify.Message) ([]string, error) {
	return nil, nil
}

func sweepTestHandler(t *testing.T, deps JobsDeps) http.Handler {
	t.Helper()
	return BenefitsRenewalSweep(deps, slog.New(slog.DiscardHandler))
}

func TestBenefitsRenewalSweepRejectsBadMethods(t *testing.T) {
	sweeper := &stubSweeper{}
	handler := sweepTestHandler(t, JobsDeps{Benefits: sweeper, Sender: stubSender{}, JobSecret: "secret"})
	for _, method := range []string{http.MethodGet, http.MethodPut, http.MethodDelete} {
		request := httptest.NewRequest(method, "/internal/jobs/benefits-renewal-sweep", nil)
		request.Header.Set("X-Job-Secret", "secret")
		recorder := httptest.NewRecorder()
		handler.ServeHTTP(recorder, request)
		if recorder.Code != http.StatusMethodNotAllowed {
			t.Fatalf("%s status = %d, want 405", method, recorder.Code)
		}
	}
	if sweeper.calls != 0 {
		t.Fatalf("sweeper calls = %d, want 0 for rejected methods", sweeper.calls)
	}
}

func TestBenefitsRenewalSweepDisabledWithoutSecret(t *testing.T) {
	sweeper := &stubSweeper{}
	handler := sweepTestHandler(t, JobsDeps{Benefits: sweeper, Sender: stubSender{}})
	request := httptest.NewRequest(http.MethodPost, "/internal/jobs/benefits-renewal-sweep", nil)
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, request)
	if recorder.Code != http.StatusServiceUnavailable {
		t.Fatalf("status = %d, want 503 when the secret is not configured", recorder.Code)
	}
	if sweeper.calls != 0 {
		t.Fatalf("sweeper calls = %d, want 0", sweeper.calls)
	}
}

func TestBenefitsRenewalSweepRejectsWrongSecret(t *testing.T) {
	sweeper := &stubSweeper{}
	handler := sweepTestHandler(t, JobsDeps{Benefits: sweeper, Sender: stubSender{}, JobSecret: "correct-secret"})
	for _, given := range []string{"", "wrong-secret", "correct-secret\x00extra"} {
		request := httptest.NewRequest(http.MethodPost, "/internal/jobs/benefits-renewal-sweep", nil)
		if given != "" {
			request.Header.Set("X-Job-Secret", given)
		}
		recorder := httptest.NewRecorder()
		handler.ServeHTTP(recorder, request)
		if recorder.Code != http.StatusForbidden {
			t.Fatalf("secret %q: status = %d, want 403", given, recorder.Code)
		}
	}
	if sweeper.calls != 0 {
		t.Fatalf("sweeper calls = %d, want 0 for bad secrets", sweeper.calls)
	}
}

func TestBenefitsRenewalSweepRunsWithCorrectSecret(t *testing.T) {
	sweeper := &stubSweeper{counts: benefits.SweepCounts{Due: 3, Sent: 2, Skipped: 1}}
	handler := sweepTestHandler(t, JobsDeps{Benefits: sweeper, Sender: stubSender{}, JobSecret: "correct-secret"})
	request := httptest.NewRequest(http.MethodPost, "/internal/jobs/benefits-renewal-sweep", nil)
	request.Header.Set("X-Job-Secret", "correct-secret")
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, request)
	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", recorder.Code)
	}
	if sweeper.calls != 1 {
		t.Fatalf("sweeper calls = %d, want exactly 1", sweeper.calls)
	}
	var counts benefits.SweepCounts
	if err := json.NewDecoder(recorder.Body).Decode(&counts); err != nil {
		t.Fatalf("decode sweep counts: %v", err)
	}
	if counts != sweeper.counts {
		t.Fatalf("counts = %#v, want %#v", counts, sweeper.counts)
	}
}

func TestBenefitsRenewalSweepPropagatesFailure(t *testing.T) {
	sweeper := &stubSweeper{err: errors.New("database is down")}
	handler := sweepTestHandler(t, JobsDeps{Benefits: sweeper, Sender: stubSender{}, JobSecret: "correct-secret"})
	request := httptest.NewRequest(http.MethodPost, "/internal/jobs/benefits-renewal-sweep", nil)
	request.Header.Set("X-Job-Secret", "correct-secret")
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, request)
	if recorder.Code != http.StatusInternalServerError {
		t.Fatalf("status = %d, want 500 when the sweep fails", recorder.Code)
	}
}
