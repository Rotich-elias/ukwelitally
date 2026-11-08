-- Public (account-free) opinion polls.
--
-- Anyone may create an opinion poll from the public site. Anonymous polls
-- have no owning user account, so `created_by` must accept NULL. A poll that
-- does have an owner keeps the existing cascade: deleting the account removes
-- the polls it created. Anonymous polls are moderated and archived by an
-- administrator.

ALTER TABLE opinion_polls ALTER COLUMN created_by DROP NOT NULL;

COMMENT ON COLUMN opinion_polls.created_by IS
  'User who created the poll. NULL for polls created without an account.';

INSERT INTO audit_logs (action, entity_type, entity_id, new_values)
VALUES (
  'database_migration',
  'schema',
  31,
  '{"migration": "anonymous_opinion_polls"}'
);
