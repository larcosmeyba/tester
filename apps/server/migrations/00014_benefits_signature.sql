-- +goose Up
-- Benefits submission Phase 1: the applicant's typed signature and the
-- confirmation number from the official portal.
--
-- signed_name / signed_at are the record of what the applicant typed on the
-- review screen and when they approved. The signature is never pre-filled:
-- the server accepts only what the applicant typed, and approval is refused
-- while the name is blank or the attestation is not accepted.
--
-- confirmation_number / confirmation_recorded_at are what the applicant
-- received after applying on the official portal, recorded verbatim. The
-- number is user-supplied data, trimmed and never validated against anything
-- external — Help The Hive never submits and never checks a portal.
ALTER TABLE benefits_applications
  ADD COLUMN signed_name TEXT,
  ADD COLUMN signed_at TIMESTAMPTZ,
  ADD COLUMN confirmation_number TEXT,
  ADD COLUMN confirmation_recorded_at TIMESTAMPTZ;

-- +goose Down
ALTER TABLE benefits_applications
  DROP COLUMN confirmation_recorded_at,
  DROP COLUMN confirmation_number,
  DROP COLUMN signed_at,
  DROP COLUMN signed_name;
