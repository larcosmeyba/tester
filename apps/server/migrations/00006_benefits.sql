-- +goose Up

-- Government benefits autofill.
--
-- The shape of this schema follows one rule from the domain: an answer that was
-- never given must never be indistinguishable from an answer of zero. Every
-- stored answer therefore carries a status, and a row's absence means "not
-- asked" rather than "none".

CREATE TABLE benefits_profiles (
  user_id     TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  -- The field-path vocabulary this profile's answers were recorded against.
  -- A future vocabulary change migrates answers rather than reinterpreting them.
  vocabulary_version INTEGER NOT NULL DEFAULT 1,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One row per collected repeating group entry: a household member, a job, an
-- income source. The group's presence here is what separates "no jobs" from
-- "we have not asked about jobs" — the latter has no benefits_profile_answers
-- row for the group path at all.
CREATE TABLE benefits_group_rows (
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  group_path  TEXT NOT NULL,
  row_id      TEXT NOT NULL,
  position    INTEGER NOT NULL CHECK (position >= 0),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, group_path, row_id)
);

CREATE INDEX benefits_group_rows_order_idx
  ON benefits_group_rows (user_id, group_path, position);

-- Answers are keyed by field path rather than spread across a column per
-- question. The field vocabulary in internal/domain/benefits is this table's
-- schema: it decides which paths exist, what kind each carries and which
-- choices are allowed, and every write is validated against it before it gets
-- here. That keeps a new question to a vocabulary entry instead of a migration,
-- and keeps the mapping files addressing paths rather than columns.
--
-- row_id is '' for a scalar answer and the group row's id for a member of a
-- repeating group.
CREATE TABLE benefits_profile_answers (
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  field_path   TEXT NOT NULL,
  row_id       TEXT NOT NULL DEFAULT '',
  group_path   TEXT NOT NULL DEFAULT '',
  status       TEXT NOT NULL CHECK (status IN ('unknown', 'provided', 'none', 'refused')),
  kind         TEXT NOT NULL CHECK (kind IN ('text', 'number', 'money', 'date', 'boolean', 'choice', 'list')),
  source       TEXT NOT NULL CHECK (source IN ('user', 'profile', 'derived', 'mapping_constant')),

  value_text   TEXT,
  value_number DOUBLE PRECISION,
  -- Money is stored in minor units so a household's income never drifts by a
  -- rounding error.
  value_cents  BIGINT,
  value_date   DATE,
  value_bool   BOOLEAN,
  value_list   TEXT[],

  -- Sensitive answers — Social Security numbers, immigration status, case
  -- numbers — are encrypted with a key held only by the server, and their
  -- plaintext column stays NULL. value_hint holds at most the last four digits,
  -- which is all the API ever returns.
  value_encrypted BYTEA,
  value_hint      TEXT,

  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),

  PRIMARY KEY (user_id, field_path, row_id),

  -- An encrypted answer must not also be sitting in the clear.
  CONSTRAINT benefits_answers_encrypted_check
    CHECK (value_encrypted IS NULL OR value_text IS NULL),
  -- A group member must name its group; a scalar must not.
  CONSTRAINT benefits_answers_group_check
    CHECK ((row_id = '' AND group_path = '') OR (row_id <> '' AND group_path <> ''))
);

CREATE INDEX benefits_profile_answers_group_idx
  ON benefits_profile_answers (user_id, group_path, row_id);

-- One autofill run against one version of one government form.
CREATE TABLE benefits_applications (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- The exact mapping this application was filled from. Government forms are
  -- revised; a completed PDF must stay explainable against the mapping that
  -- produced it, not whichever one is current.
  form_id       TEXT NOT NULL,
  form_version  TEXT NOT NULL,
  form_revision INTEGER NOT NULL,
  -- draft             just started, not yet filled
  -- needs_information  filled as far as it can be; the app must ask for more
  -- ready_for_review   everything required is present; awaiting the applicant
  -- completed          the applicant approved it and the PDF is flattened
  -- failed             a fill or render failed; the reason is on the run
  -- superseded         replaced by a newer run against the same form
  status        TEXT NOT NULL CHECK (status IN ('draft', 'needs_information', 'ready_for_review', 'completed', 'failed', 'superseded')),
  -- Why a run failed, for the applicant and for support. Never a field value.
  failure_reason TEXT NOT NULL DEFAULT '',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  approved_at   TIMESTAMPTZ,
  CONSTRAINT benefits_applications_completed_check
    CHECK ((status = 'completed') = (approved_at IS NOT NULL))
);

CREATE INDEX benefits_applications_user_idx ON benefits_applications (user_id, updated_at DESC);

-- The audit trail: which profile answer fed which box on the form.
--
-- It deliberately does not store the value that was written. The answer already
-- lives in benefits_profile_answers and on the document itself; a third copy
-- would be a third thing to protect and a third thing to leak. `detail` carries
-- the reason a field was skipped or rejected and never echoes an answer.
CREATE TABLE benefits_application_fields (
  application_id TEXT NOT NULL REFERENCES benefits_applications(id) ON DELETE CASCADE,
  field_id       TEXT NOT NULL,
  outcome        TEXT NOT NULL CHECK (outcome IN ('filled', 'missing', 'problem', 'skipped')),
  field_path     TEXT NOT NULL DEFAULT '',
  value_source   TEXT NOT NULL DEFAULT '',
  page           INTEGER NOT NULL DEFAULT 0,
  detail         TEXT NOT NULL DEFAULT '',
  is_sensitive   BOOLEAN NOT NULL DEFAULT false,
  PRIMARY KEY (application_id, field_id)
);

-- Generated PDFs. A draft is the fillable version the applicant reviews; a
-- final is the flattened one they approved. Both contain the household's full
-- application data, so both are served only through the authenticated route
-- and both carry a purge date.
CREATE TABLE benefits_documents (
  id             TEXT PRIMARY KEY,
  application_id TEXT NOT NULL REFERENCES benefits_applications(id) ON DELETE CASCADE,
  user_id        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind           TEXT NOT NULL CHECK (kind IN ('draft', 'final')),
  storage_key    TEXT NOT NULL UNIQUE,
  sha256         TEXT NOT NULL,
  byte_size      BIGINT NOT NULL CHECK (byte_size > 0),
  is_flattened   BOOLEAN NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  purge_after    TIMESTAMPTZ
);

CREATE INDEX benefits_documents_application_idx ON benefits_documents (application_id, kind, created_at DESC);
CREATE INDEX benefits_documents_purge_idx ON benefits_documents (purge_after) WHERE purge_after IS NOT NULL;

-- +goose Down
DROP TABLE IF EXISTS benefits_documents;
DROP TABLE IF EXISTS benefits_application_fields;
DROP TABLE IF EXISTS benefits_applications;
DROP TABLE IF EXISTS benefits_profile_answers;
DROP TABLE IF EXISTS benefits_group_rows;
DROP TABLE IF EXISTS benefits_profiles;
