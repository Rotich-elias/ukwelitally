-- Token revocation support.
--
-- Every JWT carries the user's current token_version. Authentication checks
-- the value against the database on every request, so deactivating a user,
-- changing their role, or resetting their password can invalidate all of
-- their existing sessions immediately instead of waiting for the token to
-- expire.
--
-- Existing sessions keep working until the next security change: old tokens
-- do not contain a tokenVersion, and are treated as version 1.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 1;

COMMENT ON COLUMN users.token_version IS
  'Incremented whenever the account is deactivated, its role changes, or its password is reset. JWTs carrying an older version are rejected.';

INSERT INTO audit_logs (action, entity_type, entity_id, new_values)
VALUES ('database_migration', 'schema', 26, '{"migration": "user_token_version"}');
