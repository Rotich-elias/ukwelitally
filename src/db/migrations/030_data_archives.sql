-- Archived resets.
--
-- Administrators need to clear test data and dry-run results before a real
-- election. A reset must never silently destroy the record of what was
-- cleared, so every reset first writes the rows it is about to remove into an
-- archive. The archive is the audit trail: it keeps the election or opinion
-- poll data as JSON, together with who ran the reset and when.
--
-- Only results and poll data are archived and removed. Users, candidates,
-- agents, observers and polling stations are never deleted by a reset.

CREATE TABLE IF NOT EXISTS data_archives (
  id SERIAL PRIMARY KEY,
  kind VARCHAR(40) NOT NULL CHECK (kind IN ('election', 'opinion_polls')),
  label VARCHAR(255),
  notes TEXT,
  archived_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  record_counts JSONB NOT NULL DEFAULT '{}'::jsonb,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_data_archives_kind_created
  ON data_archives(kind, created_at DESC);

COMMENT ON TABLE data_archives IS
  'JSON snapshot of data removed by an administrator reset. Keeps a permanent record of test/dry-run data that was cleared.';

INSERT INTO audit_logs (action, entity_type, entity_id, new_values)
VALUES (
  'database_migration',
  'schema',
  30,
  '{"migration": "data_archives"}'
);
