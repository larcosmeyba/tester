package recipes

import (
	"context"
	"log/slog"
	"time"
)

// The import worker.
//
// Without it, an import only moves while somebody is looking at it: start an
// import, close the app, and the row stays running forever. The extraction
// service holds its jobs in memory and is free to lose them, so "somebody will
// poll eventually" is not a completion guarantee — this is.
//
// It is deliberately a poller rather than a queue. The work is already durable
// in `recipe_imports`, sweeps are cheap, and a queue would add a second thing
// that can be down. Claiming is done in SQL, so running more than one worker
// is safe: two of them sweeping at the same instant take disjoint rows.

const (
	defaultSweepInterval = 30 * time.Second
	defaultSweepBatch    = 20
)

type ImportWorker struct {
	service  *ImportService
	interval time.Duration
	batch    int
	log      *slog.Logger
}

type WorkerOption func(*ImportWorker)

func WithSweepInterval(d time.Duration) WorkerOption {
	return func(w *ImportWorker) {
		if d > 0 {
			w.interval = d
		}
	}
}

func WithSweepBatch(n int) WorkerOption {
	return func(w *ImportWorker) {
		if n > 0 {
			w.batch = n
		}
	}
}

func NewImportWorker(service *ImportService, logger *slog.Logger, opts ...WorkerOption) *ImportWorker {
	if logger == nil {
		logger = slog.Default()
	}
	worker := &ImportWorker{
		service:  service,
		interval: defaultSweepInterval,
		batch:    defaultSweepBatch,
		log:      logger,
	}
	for _, opt := range opts {
		opt(worker)
	}
	return worker
}

// Run sweeps until the context is cancelled.
//
// A failing sweep is logged and the loop continues: the database being briefly
// unavailable is not a reason to stop advancing imports forever, and the next
// sweep will pick up exactly the same rows.
func (w *ImportWorker) Run(ctx context.Context) {
	if w.service == nil || !w.service.Enabled() {
		w.log.Info("recipe import worker not started", "reason", "import is not enabled")
		return
	}

	w.log.Info("recipe import worker started",
		"interval", w.interval.String(),
		"batch", w.batch,
	)

	ticker := time.NewTicker(w.interval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			w.log.Info("recipe import worker stopped")
			return
		case <-ticker.C:
			w.sweepOnce(ctx)
		}
	}
}

func (w *ImportWorker) sweepOnce(ctx context.Context) {
	started := time.Now()
	touched, err := w.service.Sweep(ctx, w.batch)
	if err != nil {
		if ctx.Err() != nil {
			return // shutting down; not a failure worth logging as one
		}
		w.log.Error("recipe import sweep failed", "error", err)
		return
	}
	if touched > 0 {
		w.log.Info("recipe import sweep",
			"imports", touched,
			"took", time.Since(started).String(),
		)
	}
}
