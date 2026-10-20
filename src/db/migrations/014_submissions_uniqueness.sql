-- Submission uniqueness constraint
--
-- A user must not be able to submit more than one result set for the same
-- polling station, submission type and candidate. This index already exists
-- in the production database but was never captured in a migration, so a
-- fresh install would be missing it.
--
-- It is created defensively: if the index already exists the statement is a
-- no-op.

CREATE UNIQUE INDEX IF NOT EXISTS idx_submissions_user_station_candidate_type
  ON submissions (user_id, polling_station_id, submission_type, COALESCE(candidate_id, -1));

-- Audit log
INSERT INTO audit_logs (action, entity_type, entity_id, new_values)
VALUES ('database_migration', 'schema', 14, '{"migration": "submissions_uniqueness"}');
