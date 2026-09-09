-- +goose Up
-- Benefits renewal alerts: what is due, when, and who has been reminded.
--
-- A renewal row keys off the FINAL application (finals are kept indefinitely;
-- the 30-day draft purge is untouched and drafts never produce renewals). The
-- row stores only program, state, form id and dates — no answers, no PII
-- beyond the user id it belongs to. Deleting the application cascades the
-- renewal; deleting the user cascades both.
CREATE TABLE benefits_renewals (
  id                  TEXT PRIMARY KEY,
  user_id             TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  application_id      TEXT NOT NULL REFERENCES benefits_applications(id) ON DELETE CASCADE,
  program             TEXT NOT NULL,
  state               TEXT NOT NULL,
  form_id             TEXT NOT NULL,
  certification_ends_at TIMESTAMPTZ,
  renewal_due_at      TIMESTAMPTZ NOT NULL,
  source              TEXT NOT NULL DEFAULT 'rule-derived'
                      CHECK (source IN ('rule-derived', 'user-confirmed')),
  status              TEXT NOT NULL DEFAULT 'scheduled'
                      CHECK (status IN ('scheduled', 'reminded', 'started', 'done', 'dismissed')),
  reminder_stage      INTEGER NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX benefits_renewals_due_idx ON benefits_renewals (renewal_due_at)
  WHERE status IN ('scheduled', 'reminded');

-- Reference data: typical certification periods per program/state. Never PII.
-- state = '*' is the national default; a state-specific row wins when present.
-- Every default is presented to users as "typical — confirm yours".
CREATE TABLE benefits_program_rules (
  program            TEXT NOT NULL,
  state              TEXT NOT NULL,
  cert_period_months INTEGER,
  source_citation    TEXT NOT NULL,
  notes              TEXT,
  PRIMARY KEY (program, state)
);

INSERT INTO benefits_program_rules (program, state, cert_period_months, source_citation, notes) VALUES
  ('SNAP', '*', 12, '7 CFR 273.10(f)',
   'Typical 12-month certification period. Households with all elderly or disabled members may be certified for 24-36 months; some states certify certain households for 6 months. Presented to users as "typical — confirm yours".'),
  ('Medicaid', '*', 12, '42 CFR 435.916',
   'Annual renewal of eligibility is required. Presented to users as "typical — confirm yours".'),
  ('WIC', '*', 12, '7 CFR 246.7(g)',
   'Certification periods depend on participant category, up to 12 months (children up to one year; infants about every six months). 12 months is the typical maximum. Presented to users as "typical — confirm yours".'),
  ('VA', '*', NULL, 'U.S. Department of Veterans Affairs — disability claims are filed once, then reviewed and decided (va.gov/disability/after-you-file-claim/)',
   'No scheduled renewal — follow-ups only as needed (supplemental or increased claims). A NULL period means no renewal row is scheduled automatically.'),
  ('SSI', '*', NULL, '20 CFR 416.204',
   'SSI redeterminations happen on a scheduled basis at periodic intervals, but the regulation sets no fixed month count — the interval varies by case. The user confirms their own date. A NULL period means no renewal row is scheduled automatically.');

ALTER TABLE preferences
  ADD COLUMN benefits_renewal_notifications_enabled BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN benefits_renewal_discreet_lockscreen BOOLEAN NOT NULL DEFAULT true;

-- +goose Down
ALTER TABLE preferences
  DROP COLUMN benefits_renewal_discreet_lockscreen,
  DROP COLUMN benefits_renewal_notifications_enabled;

DROP TABLE benefits_program_rules;
DROP INDEX benefits_renewals_due_idx;
DROP TABLE benefits_renewals;
