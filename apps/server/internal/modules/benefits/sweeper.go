package benefits

import (
	"context"
	"time"
)

// The retention sweep.
//
// PurgeExpiredDocuments has existed since drafts were given a retention date,
// and nothing ever called it — so every abandoned draft stayed on disk
// indefinitely. A draft benefits application is a household roster and an income
// statement; keeping one for longer than it is useful is a liability with no
// upside, and "we have a retention policy" is only true if something enforces it.
//
// This runs it on a timer inside the server. A separate scheduled job would be
// tidier at scale, but it would also be a second thing to deploy and a second
// thing to forget, and the failure mode of forgetting is that the policy quietly
// does not exist.

const (
	// sweepInterval is how often expired drafts are looked for. Retention is
	// measured in days, so an hour is frequent enough to be prompt and rare
	// enough to be invisible.
	sweepInterval = time.Hour
	// sweepBatch bounds one pass, so a large backlog is cleared over several
	// sweeps instead of one long transaction.
	sweepBatch = 200
	// firstSweepDelay lets the server finish starting before the first pass.
	firstSweepDelay = time.Minute
)

// StartRetentionSweep runs the purge on a timer until ctx is cancelled.
//
// It never returns an error: a failed sweep is logged and retried on the next
// tick. A storage hiccup must not take the server down, and it must not stop
// later sweeps from happening either.
func (s *Service) StartRetentionSweep(ctx context.Context) {
	go func() {
		timer := time.NewTimer(firstSweepDelay)
		defer timer.Stop()

		for {
			select {
			case <-ctx.Done():
				return
			case <-timer.C:
			}

			s.sweepOnce(ctx)
			timer.Reset(sweepInterval)
		}
	}()
}

func (s *Service) sweepOnce(ctx context.Context) {
	removed, err := s.PurgeExpiredDocuments(ctx, sweepBatch)
	if err != nil {
		// No identifiers here: which documents expired is not something to put
		// in a log line, and the count is all an operator needs.
		s.logger.WarnContext(ctx, "benefits retention sweep failed", "error", err.Error())
		return
	}
	if removed > 0 {
		s.logger.InfoContext(ctx, "benefits retention sweep removed expired drafts", "count", removed)
	}
}
