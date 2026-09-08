-- +goose Up

-- A recipe import from a cooking video. One row per attempt by one user.
--
-- This table, not the transcription service, is the source of truth for an
-- import's state. The service that does the extraction holds its jobs in
-- memory and is free to lose them; a restart there must not lose a user's
-- import, and a second instance must not be unable to answer for the first.
--
-- The imported recipe is not written to `recipes` until the user accepts it.
-- An extraction is a proposal: it is reviewed first, and the review is where
-- missing quantities get filled in by the person who chose the video.
CREATE TABLE recipe_imports (
  id                TEXT PRIMARY KEY,
  user_id           TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source_url        TEXT NOT NULL,
  source_platform   TEXT NOT NULL,
  -- queued | running | succeeded | failed | cancelled
  status            TEXT NOT NULL DEFAULT 'queued',
  -- The extraction service's own job id, so a running import can be polled.
  -- Null until the service has accepted the job.
  provider_job_id   TEXT,
  -- Set only once the user accepts the draft and it becomes a real recipe.
  recipe_id         TEXT REFERENCES recipes(id) ON DELETE SET NULL,
  -- The normalized draft, held here between extraction and acceptance so an
  -- unreviewed recipe never has to exist in `recipes` to be looked at.
  recipe_draft      JSONB,
  -- Bounds retries. Starting an extraction is not idempotent — it costs a
  -- transcription — so a retry is a deliberate act, counted.
  attempt_count     INTEGER NOT NULL DEFAULT 0,
  -- A named code from the extraction service (VIDEO_UNAVAILABLE,
  -- NO_TRANSCRIPT, …). The message is safe to show; it never echoes
  -- transcript content.
  error_code        TEXT,
  error_message     TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at        TIMESTAMPTZ,
  completed_at      TIMESTAMPTZ,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Every read of this table is "this user's imports, newest first".
CREATE INDEX recipe_imports_user_idx ON recipe_imports (user_id, created_at DESC);

-- Finding work that is still in flight, for polling and for reaping imports
-- abandoned by a service restart.
CREATE INDEX recipe_imports_pending_idx ON recipe_imports (status, updated_at)
  WHERE status IN ('queued', 'running');

-- One live import per user per video. A double tap on the button, or a retry
-- of a request whose response was lost, must not buy two transcriptions.
CREATE UNIQUE INDEX recipe_imports_active_source_idx
  ON recipe_imports (user_id, source_url)
  WHERE status IN ('queued', 'running');

-- +goose Down
DROP TABLE IF EXISTS recipe_imports;
