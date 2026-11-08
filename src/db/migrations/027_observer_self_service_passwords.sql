-- Observer self-service passwords.
--
-- Volunteers can choose their own password when they register. The hash is
-- stored on the registration and copied to the observer account when an
-- administrator approves the volunteer, so the observer can sign in straight
-- away instead of waiting for a generated password to be shared with them.
--
-- Registrations created before this migration have no password hash. Those
-- rows keep the existing behaviour: approval generates a password and shows
-- it to the administrator once.

ALTER TABLE volunteer_registrations
  ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255);

ALTER TABLE volunteer_registrations
  ADD COLUMN IF NOT EXISTS password_set_at TIMESTAMPTZ;

COMMENT ON COLUMN volunteer_registrations.password_hash IS
  'bcrypt hash chosen by the volunteer at registration. Copied to users.password_hash on approval. Never selected by the admin listing.';

COMMENT ON COLUMN volunteer_registrations.password_set_at IS
  'When the volunteer chose their password. NULL for registrations that predate self-service passwords.';

CREATE INDEX IF NOT EXISTS idx_volunteer_registrations_password_set
  ON volunteer_registrations (id)
  WHERE password_hash IS NOT NULL;

INSERT INTO audit_logs (action, entity_type, entity_id, new_values)
VALUES (
  'database_migration',
  'schema',
  27,
  '{"migration": "observer_self_service_passwords"}'
);
