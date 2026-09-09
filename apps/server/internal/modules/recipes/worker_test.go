package recipes

import (
	"context"
	"io"
	"log/slog"
	"sync/atomic"
	"testing"
	"time"

	"github.com/helpthehive/server/internal/domain/meals"
	"github.com/helpthehive/server/internal/modules/transcriber"
)

func quietLogger() *slog.Logger {
	return slog.New(slog.NewTextHandler(io.Discard, nil))
}

// The worker exists so that an import finishes when nobody is watching. This
// is that guarantee: start an import, never poll it, and it still settles.
func TestTheWorkerFinishesAnImportNobodyPolls(t *testing.T) {
	repo := newFakeRepo()
	extractor := &fakeExtractor{}
	policy := DefaultImportPolicy()
	policy.StaleAfter = time.Millisecond
	svc := newTestServiceWith(repo, extractor, knownCatalog(), policy)

	started, err := svc.Start(context.Background(), identityFor(viewer), "https://youtu.be/abc", "")
	if err != nil {
		t.Fatalf("Start: %v", err)
	}
	extractor.setJob(func() (transcriber.Job, error) {
		return transcriber.Job{ID: "job_1", Status: transcriber.StatusSucceeded, Draft: completeDraft()}, nil
	})

	worker := NewImportWorker(svc, quietLogger(), WithSweepInterval(5*time.Millisecond))

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	done := make(chan struct{})
	go func() { worker.Run(ctx); close(done) }()

	deadline := time.After(2 * time.Second)
	for !repo.snapshot(started.ID).Settled() {
		select {
		case <-deadline:
			t.Fatalf("import never settled; status = %q", repo.snapshot(started.ID).Status)
		case <-time.After(5 * time.Millisecond):
		}
	}
	cancel()

	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatal("worker did not stop when its context was cancelled")
	}

	settled := repo.snapshot(started.ID)
	if settled.Status != meals.ImportStatusSucceeded || settled.Draft == nil {
		t.Errorf("import = %+v", settled)
	}
}

func TestTheWorkerStopsOnCancellation(t *testing.T) {
	svc := newTestServiceWith(newFakeRepo(), &fakeExtractor{}, knownCatalog(), DefaultImportPolicy())
	worker := NewImportWorker(svc, quietLogger(), WithSweepInterval(time.Millisecond))

	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan struct{})
	go func() { worker.Run(ctx); close(done) }()

	cancel()
	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatal("worker ignored cancellation")
	}
}

func TestTheWorkerDoesNotRunWhenImportIsDisabled(t *testing.T) {
	svc := newTestServiceWith(newFakeRepo(), nil, knownCatalog(), DefaultImportPolicy())
	worker := NewImportWorker(svc, quietLogger(), WithSweepInterval(time.Millisecond))

	done := make(chan struct{})
	go func() { worker.Run(context.Background()); close(done) }()

	select {
	case <-done: // returns immediately rather than sweeping forever
	case <-time.After(time.Second):
		t.Fatal("a disabled worker kept running")
	}
}

// A failing sweep must not stop the loop: the database being briefly
// unavailable is not a reason to stop advancing imports forever.
func TestASweepFailureDoesNotStopTheWorker(t *testing.T) {
	var sweeps int32
	repo := &failingClaimRepo{fakeRepo: newFakeRepo(), calls: &sweeps}
	svc := newTestServiceWith(repo, &fakeExtractor{}, knownCatalog(), DefaultImportPolicy())
	worker := NewImportWorker(svc, quietLogger(), WithSweepInterval(2*time.Millisecond))

	ctx, cancel := context.WithTimeout(context.Background(), 200*time.Millisecond)
	defer cancel()
	worker.Run(ctx)

	if got := atomic.LoadInt32(&sweeps); got < 2 {
		t.Errorf("swept %d times; the loop stopped after a failure", got)
	}
}

type failingClaimRepo struct {
	*fakeRepo
	calls *int32
}

func (r *failingClaimRepo) ClaimStaleRecipeImports(context.Context, time.Time, int) ([]meals.RecipeImport, error) {
	atomic.AddInt32(r.calls, 1)
	return nil, context.DeadlineExceeded
}

func TestWorkerOptionsRejectNonsense(t *testing.T) {
	svc := newTestServiceWith(newFakeRepo(), &fakeExtractor{}, knownCatalog(), DefaultImportPolicy())
	worker := NewImportWorker(svc, nil, WithSweepInterval(-time.Second), WithSweepBatch(0))

	if worker.interval != defaultSweepInterval {
		t.Errorf("interval = %v, want the default", worker.interval)
	}
	if worker.batch != defaultSweepBatch {
		t.Errorf("batch = %d, want the default", worker.batch)
	}
	if worker.log == nil {
		t.Error("a nil logger was kept")
	}
}
