-- +goose Up
-- Magic verification links for signup email verification (September 2026).
-- Replaces one-time codes for signup: the email carries a Verify button that
-- opens GET /auth/verify?token=... on the API, which consumes the link and
-- stamps users.account_verified_at. One-time codes stay for account recovery
-- and email/phone changes.
--
-- The plain token is never stored: token_hash holds salt$sha256(salt ||
-- token). token_prefix (the first 8 hex chars, plaintext) exists for lookup
-- because the verify handler is unauthenticated — the token itself is the
-- credential. Consumed/expired links stay in the table so issuance stays
-- auditable; lookups only ever touch unconsumed links.
CREATE TABLE verification_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  token_prefix TEXT NOT NULL,
  purpose TEXT NOT NULL DEFAULT 'signup',
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_verification_links_prefix
  ON verification_links (token_prefix, consumed_at);

-- +goose Down
DROP INDEX idx_verification_links_prefix;
DROP TABLE verification_links;
