-- +goose Up
-- Benefits renewal alerts: at-most-once send claims.
--
-- Each (renewal_id, stage) pair may be sent at most once. The sweep inserts a
-- claim row and advances the renewal's reminder stage in one transaction that
-- commits BEFORE the Expo HTTP send, so a crashed or retried sweep finds the
-- claim already taken and never sends twice.
--
-- The tradeoff is explicit: a crash between the claim commit and the HTTP send
-- skips that reminder instead of risking a duplicate. The table carries no PII
-- beyond the renewal id it references; deleting the renewal cascades the claim.
CREATE TABLE benefits_renewal_sends (
  renewal_id TEXT NOT NULL REFERENCES benefits_renewals(id) ON DELETE CASCADE,
  stage      INTEGER NOT NULL,
  claimed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (renewal_id, stage)
);

-- +goose Down
DROP TABLE benefits_renewal_sends;
