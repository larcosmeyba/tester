-- +goose Up

-- Penny: conversations, what she remembers, what she is allowed to know, and
-- every tool call she ever made.
--
-- One property shapes this schema: the agent process that talks to the model
-- has no credentials for this database. Everything below is written by the Go
-- backend on the agent's behalf, after the backend has checked who is asking.
-- A table here is therefore a record of something the backend decided to do,
-- never something a model did on its own.

CREATE TABLE penny_conversations (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title       TEXT NOT NULL DEFAULT '',
  -- Rolling summary of the turns that have aged out of the live window. Kept
  -- here so it is computed once when the window overflows rather than on every
  -- request.
  summary     TEXT NOT NULL DEFAULT '',
  -- How many messages the summary already covers, so summarization resumes
  -- where it stopped instead of re-reading the thread.
  summarized_through INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX penny_conversations_user_idx
  ON penny_conversations (user_id, updated_at DESC);

CREATE TABLE penny_messages (
  id              TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES penny_conversations(id) ON DELETE CASCADE,
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- 'user' or 'penny'. Tool traffic is not a message: it lives in
  -- penny_tool_calls, so the transcript stays what the two of them said.
  role            TEXT NOT NULL CHECK (role IN ('user', 'penny')),
  content         TEXT NOT NULL,
  -- Monotonic within a conversation. Ordering by a timestamp would tie when two
  -- messages land in the same millisecond, which is exactly what a turn does.
  position        INTEGER NOT NULL,
  -- Set when the turn ended in a refusal or a failure, so the app can offer a
  -- retry and evals can count them without parsing prose.
  outcome         TEXT NOT NULL DEFAULT 'ok'
                  CHECK (outcome IN ('ok', 'refused', 'failed', 'rate_limited')),
  -- Citations backing this message, as authored by the retrieval step. Empty
  -- for anything that made no factual claim about a benefits program.
  citations       JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- A high-impact write Penny proposed and did not perform. The app renders it
  -- as a confirmation card; the backend executes it only when the user taps.
  proposed_action JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (conversation_id, position)
);

CREATE INDEX penny_messages_conversation_idx
  ON penny_messages (conversation_id, position);

-- What Penny learned about a user, as opposed to what was said to her.
--
-- A memory is an extracted claim, not a copy of a sentence: it carries the turn
-- it came from and when it was written, so a stale one can be found and
-- expired. It is never authoritative. Household size is read from the profile
-- every time; it is not recalled from here.
CREATE TABLE penny_memories (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL
              CHECK (kind IN ('preference', 'constraint', 'situation', 'goal')),
  -- The claim itself, in one sentence, as Penny would say it back.
  content     TEXT NOT NULL,
  -- Why it was saved. Cheap for a human auditing the store to read.
  context     TEXT NOT NULL DEFAULT '',
  -- The message that produced it. Null only for memories seeded by a migration.
  source_message_id TEXT REFERENCES penny_messages(id) ON DELETE SET NULL,
  -- text-embedding-3-small and most open alternatives are 1536-dimensional.
  -- Changing this is a re-embed, so it is pinned rather than inferred.
  embedding   vector(1536),
  -- Superseded memories are kept, not deleted, so a correction is auditable.
  superseded_by TEXT REFERENCES penny_memories(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Recall is always scoped to one user before it is scoped by similarity. The
-- partial index is on live memories because superseded ones are never recalled.
CREATE INDEX penny_memories_user_idx
  ON penny_memories (user_id, kind) WHERE superseded_by IS NULL;

-- Authoritative Help The Hive knowledge: SNAP, WIC, Medicaid, LIHEAP, state
-- guides, educational content. Authored and reviewed by people, never written
-- by a model.
CREATE TABLE penny_knowledge_documents (
  id            TEXT PRIMARY KEY,
  -- 'SNAP', 'WIC', 'MEDICAID', 'LIHEAP', 'EDUCATION', ...
  program       TEXT NOT NULL,
  -- 'US' for federal rules, 'US-OH' for a state guide. Retrieval filters on
  -- this before it ranks by similarity: an Ohio income limit must never be
  -- returned to a Texas user because it embedded well.
  jurisdiction  TEXT NOT NULL,
  title         TEXT NOT NULL,
  source_url    TEXT NOT NULL DEFAULT '',
  -- Who says so. A state agency and a Help The Hive explainer are both useful
  -- and are not the same kind of claim.
  authority     TEXT NOT NULL DEFAULT 'help-the-hive'
                CHECK (authority IN ('federal-agency', 'state-agency', 'help-the-hive')),
  effective_date DATE,
  -- Past this date the content is still retrievable but Penny must say when it
  -- was last reviewed. Silently serving expired benefits rules is worse than
  -- saying the date.
  review_by     DATE,
  -- Hash of the source file, so ingest can skip unchanged documents.
  content_hash  TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX penny_knowledge_documents_scope_idx
  ON penny_knowledge_documents (program, jurisdiction);

CREATE TABLE penny_knowledge_chunks (
  id          TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES penny_knowledge_documents(id) ON DELETE CASCADE,
  -- Chunks are split on heading boundaries, so this is the heading trail. It is
  -- what a citation shows the user.
  heading     TEXT NOT NULL DEFAULT '',
  content     TEXT NOT NULL,
  position    INTEGER NOT NULL,
  embedding   vector(1536),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (document_id, position)
);

-- Retrieval reaches this table only after the jurisdiction filter has cut the
-- candidate set, so an approximate index over the whole corpus would rank rows
-- that are about to be discarded. Exact search over a filtered set is both
-- correct and, at this corpus size, fast.
CREATE INDEX penny_knowledge_chunks_document_idx
  ON penny_knowledge_chunks (document_id);

-- Every tool call, whether or not it ran.
--
-- This is the audit trail for the one rule: the model proposes, the backend
-- disposes. A denied call is as important to record as an executed one, because
-- a run of denials is what an attempted prompt injection looks like.
CREATE TABLE penny_tool_calls (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  conversation_id TEXT REFERENCES penny_conversations(id) ON DELETE CASCADE,
  turn_id         TEXT NOT NULL,
  tool            TEXT NOT NULL,
  -- Redacted before it gets here. The gateway strips anything the tool's schema
  -- marks sensitive.
  arguments       JSONB NOT NULL DEFAULT '{}'::jsonb,
  outcome         TEXT NOT NULL
                  CHECK (outcome IN ('executed', 'proposed', 'denied', 'failed')),
  -- Why a call was denied or failed. Never a provider error body, which can
  -- echo the prompt back.
  detail          TEXT NOT NULL DEFAULT '',
  duration_ms     INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX penny_tool_calls_turn_idx
  ON penny_tool_calls (turn_id);

CREATE INDEX penny_tool_calls_user_idx
  ON penny_tool_calls (user_id, created_at DESC);

-- +goose Down
DROP TABLE IF EXISTS penny_tool_calls;
DROP TABLE IF EXISTS penny_knowledge_chunks;
DROP TABLE IF EXISTS penny_knowledge_documents;
DROP TABLE IF EXISTS penny_memories;
DROP TABLE IF EXISTS penny_messages;
DROP TABLE IF EXISTS penny_conversations;
