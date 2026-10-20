-- Application column gaps
--
-- The application code - and the scripts/assign-candidate-numbers.js helper -
-- reference four columns that no migration has ever created. They exist in the
-- databases this schema was developed against, but they were never captured
-- in a migration, so a fresh install (a new Neon database, for example) is
-- missing them and the matching API routes fail with
-- "column ... does not exist".
--
-- Every statement below is additive, so this migration is safe to run against
-- a database that already has the columns.

-- 1. Ballot candidate number, e.g. 'CAND-2026-00001'.
--    Written by POST /api/ballot-candidates, POST /api/candidates/import and
--    scripts/assign-candidate-numbers.js.
--
--    Deliberately NOT unique. The generator is an unlocked "read the highest
--    number, add one" operation, and assign-candidate-numbers.js restarts its
--    counter at 00001 without checking numbers that already exist. A unique
--    index would turn those benign duplicates into hard failures, so the
--    column is left non-unique on purpose.
ALTER TABLE candidates
  ADD COLUMN IF NOT EXISTS candidate_number VARCHAR(50);

--    Index for the generator's "highest number for this year" lookup. This
--    mirrors the existing idx_candidate_votes_name style (non-unique).
CREATE INDEX IF NOT EXISTS idx_candidates_candidate_number
  ON candidates(candidate_number);

-- 2. Ballot candidate archival flag.
--    Written by POST /api/ballot-candidates/bulk-update. Nothing filters on
--    it, so no index is created for it.
ALTER TABLE candidates
  ADD COLUMN IF NOT EXISTS archived BOOLEAN NOT NULL DEFAULT FALSE;

-- 3. candidates.updated_at.
--    Unlike users, submissions and results, the candidates table has neither
--    an updated_at column nor a trigger. POST
--    /api/ballot-candidates/bulk-update sets it explicitly.
ALTER TABLE candidates
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

--    Keep it in step with the other tables. The function is created by
--    migration 001, so it is available here. The trigger is guarded because
--    PostgreSQL has no CREATE TRIGGER IF NOT EXISTS.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'update_candidates_updated_at'
      AND tgrelid = 'candidates'::regclass
  ) THEN
    CREATE TRIGGER update_candidates_updated_at BEFORE UPDATE ON candidates
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

-- 4. Bulk-operation audit trail.
--    INSERT INTO audit_logs (..., entity_ids, ...) is used by the four bulk
--    admin routes (users and ballot candidates, update and delete) and always
--    carries a JSON array of numeric ids. JSONB matches the neighbouring
--    old_values and new_values columns.
ALTER TABLE audit_logs
  ADD COLUMN IF NOT EXISTS entity_ids JSONB;

-- 5. Guard against a silent type mismatch.
--    ADD COLUMN IF NOT EXISTS is a no-op when the column already exists, so a
--    database that was set up by hand could keep a column with a different
--    type. That would fail later at runtime instead of here, so the existing
--    definitions are checked explicitly. On a fresh database the columns do
--    not exist yet and this block does nothing.
--
--    information_schema reports the base type, so a length difference (for
--    example varchar(50) versus varchar(100)) is not flagged. Only a
--    different type family is, which is the case that would break the
--    application.
DO $$
DECLARE
  expected_row record;
  actual_col   record;
BEGIN
  FOR expected_row IN
    SELECT * FROM (VALUES
      ('candidates', 'candidate_number', 'character varying'),
      ('candidates', 'archived',           'boolean'),
      ('candidates', 'updated_at',         'timestamp without time zone'),
      ('audit_logs', 'entity_ids',         'jsonb')
    ) AS exp(table_name, column_name, data_type)
  LOOP
    SELECT c.data_type INTO actual_col
      FROM information_schema.columns c
     WHERE c.table_schema = current_schema()
       AND c.table_name = expected_row.table_name
       AND c.column_name = expected_row.column_name;

    IF FOUND AND actual_col.data_type <> expected_row.data_type THEN
      RAISE EXCEPTION
        'Column %.% exists with type "%" but migration 015 expects "%". '
        'Reconcile the definition before running this migration.',
        expected_row.table_name, expected_row.column_name,
        actual_col.data_type, expected_row.data_type
        USING HINT = 'Alter the column manually, or drop it and re-run the migration.';
    END IF;
  END LOOP;
END $$;

-- Audit log
INSERT INTO audit_logs (action, entity_type, entity_id, new_values)
VALUES ('database_migration', 'schema', 15, '{"migration": "app_column_gaps"}');
