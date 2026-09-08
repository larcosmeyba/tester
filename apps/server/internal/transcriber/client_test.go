package transcriber

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"
)

func testClient(t *testing.T, handler http.HandlerFunc) (*Client, *httptest.Server) {
	t.Helper()
	server := httptest.NewServer(handler)
	t.Cleanup(server.Close)

	client, err := New(
		Config{BaseURL: server.URL, SharedSecret: "s3cret"},
		WithLogger(slog.New(slog.NewTextHandler(io.Discard, nil))),
		withSleep(func(time.Duration) {}),
	)
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	return client, server
}

func TestNewRequiresURLAndSecret(t *testing.T) {
	if _, err := New(Config{SharedSecret: "s"}); err == nil {
		t.Error("a client with no URL was accepted")
	}
	if _, err := New(Config{BaseURL: "http://x"}); err == nil {
		t.Error("a client with no shared secret was accepted")
	}
}

func TestConfiguredReportsWhetherImportIsSwitchedOn(t *testing.T) {
	if (Config{}).Configured() {
		t.Error("empty config reported as configured")
	}
	if !(Config{BaseURL: "http://x"}).Configured() {
		t.Error("config with a URL reported as unconfigured")
	}
}

func TestStartSendsCredentialsAndReturnsTheJob(t *testing.T) {
	var gotAuth, gotPath, gotMethod string
	client, _ := testClient(t, func(w http.ResponseWriter, r *http.Request) {
		gotAuth, gotPath, gotMethod = r.Header.Get("Authorization"), r.URL.Path, r.Method
		w.WriteHeader(http.StatusAccepted)
		io.WriteString(w, `{"importId":"job_1","status":"queued","url":"https://youtu.be/a"}`)
	})

	job, err := client.Start(context.Background(), StartRequest{URL: "https://youtu.be/a", OwnerUserID: "user_1"})
	if err != nil {
		t.Fatalf("Start: %v", err)
	}

	if gotAuth != "Bearer s3cret" {
		t.Errorf("Authorization = %q", gotAuth)
	}
	if gotMethod != http.MethodPost || gotPath != "/v1/imports" {
		t.Errorf("called %s %s", gotMethod, gotPath)
	}
	if job.ID != "job_1" || job.Status != StatusQueued {
		t.Errorf("job = %+v", job)
	}
	if job.Done() {
		t.Error("a queued job reported as done")
	}
}

// Starting an import spends a transcription, so a lost response must never be
// resolved by silently asking for a second one.
func TestStartIsNeverRetried(t *testing.T) {
	var calls int32
	client, _ := testClient(t, func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(&calls, 1)
		w.WriteHeader(http.StatusInternalServerError)
	})

	_, err := client.Start(context.Background(), StartRequest{URL: "https://youtu.be/a"})

	if !errors.Is(err, ErrUnavailable) {
		t.Errorf("err = %v, want ErrUnavailable", err)
	}
	if got := atomic.LoadInt32(&calls); got != 1 {
		t.Errorf("start was attempted %d times, want exactly 1", got)
	}
}

func TestJobRetriesTransientFailures(t *testing.T) {
	var calls int32
	client, _ := testClient(t, func(w http.ResponseWriter, r *http.Request) {
		if atomic.AddInt32(&calls, 1) == 1 {
			w.WriteHeader(http.StatusBadGateway)
			return
		}
		io.WriteString(w, `{"importId":"job_1","status":"running"}`)
	})

	job, err := client.Job(context.Background(), "job_1")
	if err != nil {
		t.Fatalf("Job: %v", err)
	}
	if job.Status != StatusRunning {
		t.Errorf("status = %q", job.Status)
	}
	if got := atomic.LoadInt32(&calls); got != 2 {
		t.Errorf("polled %d times, want 2", got)
	}
}

// A private video is still private on the second ask; retrying only spends
// time and money to fail identically.
func TestJobDoesNotRetryPermanentFailures(t *testing.T) {
	var calls int32
	client, _ := testClient(t, func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(&calls, 1)
		w.WriteHeader(http.StatusUnprocessableEntity)
		io.WriteString(w, `{"error":{"code":"VIDEO_UNAVAILABLE","message":"That video is private."}}`)
	})

	_, err := client.Job(context.Background(), "job_1")

	if !errors.Is(err, ErrVideoUnavailable) {
		t.Errorf("err = %v, want ErrVideoUnavailable", err)
	}
	if got := atomic.LoadInt32(&calls); got != 1 {
		t.Errorf("polled %d times, want exactly 1", got)
	}
}

func TestNamedFailuresSurviveAsSentinels(t *testing.T) {
	cases := map[string]error{
		"UNSUPPORTED_SOURCE": ErrUnsupportedSource,
		"VIDEO_UNAVAILABLE":  ErrVideoUnavailable,
		"VIDEO_TOO_LONG":     ErrVideoTooLong,
		"NO_TRANSCRIPT":      ErrNoTranscript,
		"NO_RECIPE_FOUND":    ErrNoRecipeFound,
		"PROVIDER_ERROR":     ErrProviderFailure,
	}
	for code, want := range cases {
		err := &ServiceError{Code: code, Message: "x"}
		if !errors.Is(err, want) {
			t.Errorf("%s did not map to %v", code, want)
		}
	}
}

func TestUnauthorizedAndMissingJobAreDistinct(t *testing.T) {
	unauth, _ := testClient(t, func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusUnauthorized)
	})
	if _, err := unauth.Job(context.Background(), "job_1"); !errors.Is(err, ErrUnauthorized) {
		t.Errorf("err = %v, want ErrUnauthorized", err)
	}

	missing, _ := testClient(t, func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNotFound)
	})
	if _, err := missing.Job(context.Background(), "job_1"); !errors.Is(err, ErrJobNotFound) {
		t.Errorf("err = %v, want ErrJobNotFound", err)
	}
}

func TestEmptyJobIDIsNotSentToTheService(t *testing.T) {
	var calls int32
	client, _ := testClient(t, func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(&calls, 1)
	})

	if _, err := client.Job(context.Background(), "  "); !errors.Is(err, ErrJobNotFound) {
		t.Errorf("err = %v, want ErrJobNotFound", err)
	}
	if atomic.LoadInt32(&calls) != 0 {
		t.Error("an empty job id reached the service")
	}
}

func TestASucceededJobCarriesTheDraft(t *testing.T) {
	client, _ := testClient(t, func(w http.ResponseWriter, r *http.Request) {
		io.WriteString(w, `{
			"importId":"job_1","status":"succeeded",
			"recipe":{"title":"Dal","sourceUrl":"https://youtu.be/a",
			  "ingredients":[{"position":1,"rawText":"200g lentils","quantity":200,"unit":"g"}],
			  "instructions":[{"step":1,"text":"Simmer."}],
			  "missingInformation":[]}
		}`)
	})

	job, err := client.Job(context.Background(), "job_1")
	if err != nil {
		t.Fatalf("Job: %v", err)
	}
	if !job.Done() || job.Draft == nil {
		t.Fatalf("job = %+v", job)
	}

	recipe := job.Draft.ToRecipe("recipe_1", "user_1")
	if recipe.Title != "Dal" || len(recipe.Ingredients) != 1 {
		t.Errorf("recipe = %+v", recipe)
	}
	if !recipe.BaseMealPlanEligible {
		t.Error("a complete draft should arrive plannable")
	}
}

func TestAFailedJobCarriesANamedError(t *testing.T) {
	client, _ := testClient(t, func(w http.ResponseWriter, r *http.Request) {
		io.WriteString(w, `{"importId":"job_1","status":"failed",
			"error":{"code":"NO_TRANSCRIPT","message":"Nothing to read."}}`)
	})

	job, err := client.Job(context.Background(), "job_1")
	if err != nil {
		t.Fatalf("Job: %v", err)
	}

	failure := job.Failure()
	if failure == nil {
		t.Fatal("a failed job reported no error")
	}
	if !errors.Is(failure, ErrNoTranscript) {
		t.Errorf("failure = %v, want ErrNoTranscript", failure)
	}
	if failure.Message != "Nothing to read." {
		t.Errorf("message = %q", failure.Message)
	}
}

func TestAHangingServiceTimesOutRatherThanBlocking(t *testing.T) {
	client, _ := testClient(t, func(w http.ResponseWriter, r *http.Request) {
		<-r.Context().Done()
	})
	client.cfg.PollTimeout = 50 * time.Millisecond
	client.cfg.MaxPollAttempts = 1

	start := time.Now()
	_, err := client.Job(context.Background(), "job_1")

	if !errors.Is(err, ErrUnavailable) {
		t.Errorf("err = %v, want ErrUnavailable", err)
	}
	if elapsed := time.Since(start); elapsed > 2*time.Second {
		t.Errorf("took %v: the per-request timeout did not apply", elapsed)
	}
}

func TestAGiantResponseIsNotReadIntoMemory(t *testing.T) {
	client, _ := testClient(t, func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		io.WriteString(w, `{"importId":"job_1","status":"running","url":"`)
		for i := 0; i < 300_000; i++ {
			io.WriteString(w, "aaaaaaaaaaaaaaaa")
		}
	})

	// Truncated at the limit, so it fails to parse rather than being absorbed.
	if _, err := client.Job(context.Background(), "job_1"); err == nil {
		t.Error("an oversized response was accepted")
	}
}

func TestReadyReportsTheServiceState(t *testing.T) {
	ok, _ := testClient(t, func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/readyz" {
			t.Errorf("probed %s, want /readyz", r.URL.Path)
		}
		io.WriteString(w, `{"status":"ready"}`)
	})
	if err := ok.Ready(context.Background()); err != nil {
		t.Errorf("Ready() = %v, want nil", err)
	}

	notReady, _ := testClient(t, func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusServiceUnavailable)
		io.WriteString(w, `{"status":"not_ready"}`)
	})
	if err := notReady.Ready(context.Background()); !errors.Is(err, ErrUnavailable) {
		t.Errorf("Ready() = %v, want ErrUnavailable", err)
	}
}
