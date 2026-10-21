-- Submission windows, candidate access status and observer fallback approvals
--
-- Three separate concepts are introduced here, because the existing schema
-- conflated them:
--
--   1. Account status      -> users.active          (an account may be suspended)
--   2. Purchased access    -> candidates.access_status (the SaaS entitlement)
--   3. Submission permission -> submission_windows    (who may submit results, when)
--
-- On top of that, submissions gain an explicit origin (agent / observer) and
-- a review status, and a new selected_results table records WHICH submission
-- is the authoritative result for a polling station and position. That is
-- what makes a candidate approved observer fallback distinguishable from an
-- agent primary result.

-- ---------------------------------------------------------------------------
-- 1. Candidate access status (the platform's SaaS entitlement)
-- ---------------------------------------------------------------------------
-- Separate from users.active, which only describes the login account, and
-- from candidates.payment_status, which only records money received.
--
-- The platform administrator activates, suspends or revokes a candidate's
-- access here. It does NOT open submission windows: that stays with the
-- candidate.

ALTER TABLE candidates
  ADD COLUMN IF NOT EXISTS access_status VARCHAR(20) NOT NULL DEFAULT 'active';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'candidates_access_status_check'
  ) THEN
    ALTER TABLE candidates
      ADD CONSTRAINT candidates_access_status_check
      CHECK (access_status IN ('active', 'suspended', 'revoked'));
  END IF;
END $$;

COMMENT ON COLUMN candidates.access_status IS
  'Purchased access entitlement: active, suspended or revoked. Independent of users.active and of the reporting window.';

CREATE INDEX IF NOT EXISTS idx_candidates_access_status ON candidates(access_status);

-- ---------------------------------------------------------------------------
-- 2. Reporting windows (candidate controlled)
-- ---------------------------------------------------------------------------
-- One row per candidate and scope. The window is the submission permission:
-- a window that is closed, scheduled for the future or expired rejects every
-- new agent or observer submission for that scope.
--
-- `position` is the scope key. It is NULL for "every position this candidate
-- runs for", which keeps the table usable when elections or reporting
-- sessions are introduced later.
--
-- Timestamps are stored as TIMESTAMPTZ so the server time zone can never
-- change the meaning of a schedule.

CREATE TABLE IF NOT EXISTS submission_windows (
  id SERIAL PRIMARY KEY,
  candidate_id INTEGER NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  position VARCHAR(50),
  status VARCHAR(20) NOT NULL DEFAULT 'closed'
    CHECK (status IN ('closed', 'open', 'scheduled')),
  opens_at TIMESTAMPTZ,
  closes_at TIMESTAMPTZ,
  opened_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  opened_at TIMESTAMPTZ,
  closed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  closed_at TIMESTAMPTZ,
  schedule_cancelled_at TIMESTAMPTZ,
  schedule_cancelled_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT submission_windows_schedule_order
    CHECK (opens_at IS NULL OR closes_at IS NULL OR closes_at > opens_at)
);

-- One window per candidate and scope.
CREATE UNIQUE INDEX IF NOT EXISTS idx_submission_windows_candidate_scope
  ON submission_windows (candidate_id, COALESCE(position, ''));

CREATE INDEX IF NOT EXISTS idx_submission_windows_candidate ON submission_windows(candidate_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'update_submission_windows_updated_at'
  ) THEN
    CREATE TRIGGER update_submission_windows_updated_at
      BEFORE UPDATE ON submission_windows
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

COMMENT ON TABLE submission_windows IS
  'Candidate controlled reporting window. Closed by default; the owning candidate opens, schedules or closes it.';

-- ---------------------------------------------------------------------------
-- 3. Explicit submission origin and fallback review status
-- ---------------------------------------------------------------------------
-- submission_origin records WHO produced the submission. An observer result
-- can therefore never be mistaken for an agent result.
--
-- review_status is only meaningful for observer submissions:
--   pending_review    -> waiting for the candidate to decide
--   approved_fallback -> the candidate approved it as the fallback result
--   rejected_fallback -> the candidate rejected it
--
-- The original submitted values are never modified: the rows are preserved
-- exactly as they were received.

ALTER TABLE submissions
  ADD COLUMN IF NOT EXISTS submission_origin VARCHAR(20) NOT NULL DEFAULT 'agent';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
     WHERE c.conname = 'submissions_origin_check'
       AND n.nspname = current_schema()
  ) THEN
    ALTER TABLE submissions
      ADD CONSTRAINT submissions_origin_check
      CHECK (submission_origin IN ('agent', 'observer', 'admin'));
  END IF;
END $$;

ALTER TABLE submissions
  ADD COLUMN IF NOT EXISTS review_status VARCHAR(30);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
     WHERE c.conname = 'submissions_review_status_check'
       AND n.nspname = current_schema()
  ) THEN
    ALTER TABLE submissions
      ADD CONSTRAINT submissions_review_status_check
      CHECK (
        review_status IS NULL OR
        review_status IN ('pending_review', 'approved_fallback', 'rejected_fallback')
      );
  END IF;
END $$;

ALTER TABLE submissions
  ADD COLUMN IF NOT EXISTS review_reason TEXT;
ALTER TABLE submissions
  ADD COLUMN IF NOT EXISTS reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE submissions
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;

-- 3b. The reporting scope that authorised an observer submission.
--
-- An observer reports a race at a polling station. This column records the
-- candidate whose reporting window authorised the submission, so the
-- authorisation is always tied to an explicit reporting scope instead of an
-- unrelated open window.
ALTER TABLE submissions
  ADD COLUMN IF NOT EXISTS scope_candidate_id INTEGER REFERENCES candidates(id) ON DELETE SET NULL;

-- 3c. Versioned corrections.
--
-- A correction no longer replaces the original submission. The new
-- submission points at the one it corrects, the original points back at its
-- replacement, and both rows keep their figures and evidence.
ALTER TABLE submissions
  ADD COLUMN IF NOT EXISTS supersedes_submission_id INTEGER REFERENCES submissions(id) ON DELETE SET NULL;

ALTER TABLE submissions
  ADD COLUMN IF NOT EXISTS superseded_by_submission_id INTEGER REFERENCES submissions(id) ON DELETE SET NULL;

ALTER TABLE submissions
  ADD COLUMN IF NOT EXISTS revision_number INTEGER NOT NULL DEFAULT 1;

ALTER TABLE submissions
  ADD COLUMN IF NOT EXISTS revision_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_submissions_scope_candidate ON submissions(scope_candidate_id);
CREATE INDEX IF NOT EXISTS idx_submissions_supersedes ON submissions(supersedes_submission_id);
CREATE INDEX IF NOT EXISTS idx_submissions_superseded_by ON submissions(superseded_by_submission_id);

COMMENT ON COLUMN submissions.supersedes_submission_id IS
  'The submission this one corrects. The original is kept, never overwritten.';
COMMENT ON COLUMN submissions.superseded_by_submission_id IS
  'The approved correction that replaced this submission. NULL while this version is still current.';
COMMENT ON COLUMN submissions.revision_number IS
  'Version of this submission. 1 is the original, 2 the first correction, and so on.';
COMMENT ON COLUMN submissions.revision_reason IS
  'Why the submitter corrected the previous version.';
COMMENT ON COLUMN submissions.scope_candidate_id IS
  'The candidate whose reporting window authorised an observer submission.';

-- The uniqueness index from migration 014 has to allow a correction to be
-- stored next to the submission it corrects. The revision number keeps the
-- guarantee that a single version cannot be stored twice.
DROP INDEX IF EXISTS idx_submissions_user_station_candidate_type;

CREATE UNIQUE INDEX idx_submissions_user_station_candidate_type
  ON submissions (user_id, polling_station_id, submission_type, COALESCE(candidate_id, -1), revision_number);

CREATE INDEX IF NOT EXISTS idx_submissions_origin ON submissions(submission_origin);
CREATE INDEX IF NOT EXISTS idx_submissions_review_status ON submissions(review_status);

COMMENT ON COLUMN submissions.submission_origin IS
  'Who produced the submission: agent (primary result), observer (alternative result) or admin.';
COMMENT ON COLUMN submissions.review_status IS
  'Observer review state: pending_review, approved_fallback or rejected_fallback. NULL for agent submissions.';

-- Existing observer submissions are re-labelled so historical data keeps its
-- meaning. Only submissions that are still awaiting a decision are marked as
-- pending a review; an already verified or rejected one keeps that state.
UPDATE submissions s
   SET submission_origin = 'observer',
       review_status = CASE
         WHEN s.status = 'pending' THEN 'pending_review'
         WHEN s.status = 'rejected' THEN 'rejected_fallback'
         ELSE s.review_status
       END
  FROM users u
 WHERE u.id = s.user_id
   AND u.role = 'observer';

-- ---------------------------------------------------------------------------
-- 4. Selected result per polling station and position
-- ---------------------------------------------------------------------------
-- Records the one submission that counts as the result for a station and
-- position. An agent primary result and a candidate approved observer
-- fallback are both recorded here, and the `source` column keeps them
-- distinguishable.
--
-- The unique constraint makes it impossible for two submissions to be the
-- selected result for the same station and position.

CREATE TABLE IF NOT EXISTS selected_results (
  id SERIAL PRIMARY KEY,
  polling_station_id INTEGER NOT NULL REFERENCES polling_stations(id) ON DELETE CASCADE,
  position VARCHAR(50) NOT NULL,
  submission_id INTEGER NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  source VARCHAR(20) NOT NULL CHECK (source IN ('agent_primary', 'observer_fallback')),
  approved_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (polling_station_id, position)
);

CREATE INDEX IF NOT EXISTS idx_selected_results_submission ON selected_results(submission_id);
CREATE INDEX IF NOT EXISTS idx_selected_results_source ON selected_results(source);

COMMENT ON TABLE selected_results IS
  'The authoritative result per polling station and position. source keeps agent primary results and candidate approved observer fallbacks apart.';

-- Backfill: the verified primary results that already exist become the
-- selected result for their station and position. ON CONFLICT DO NOTHING
-- keeps the first row when two agents reported the same station, which
-- matches the existing aggregation behaviour of counting the station once.
INSERT INTO selected_results (polling_station_id, position, submission_id, source)
SELECT s.polling_station_id, r.position, s.id, 'agent_primary'
  FROM submissions s
  JOIN results r ON r.submission_id = s.id
 WHERE s.status = 'verified'
   AND s.submission_type = 'primary'
   AND s.submission_origin = 'agent'
ON CONFLICT (polling_station_id, position) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 5. Discrepancies must not block the correction workflow
-- ---------------------------------------------------------------------------
-- The revision workflow replaces a flagged submission by deleting it. The
-- discrepancy rows that reference it are kept as a record, so the reference
-- is cleared instead of blocking the delete.

ALTER TABLE discrepancies
  DROP CONSTRAINT IF EXISTS discrepancies_primary_submission_id_fkey;

ALTER TABLE discrepancies
  ADD CONSTRAINT discrepancies_primary_submission_id_fkey
  FOREIGN KEY (primary_submission_id) REFERENCES submissions(id) ON DELETE SET NULL;

ALTER TABLE discrepancies
  DROP CONSTRAINT IF EXISTS discrepancies_backup_submission_id_fkey;

ALTER TABLE discrepancies
  ADD CONSTRAINT discrepancies_backup_submission_id_fkey
  FOREIGN KEY (backup_submission_id) REFERENCES submissions(id) ON DELETE SET NULL;

-- The reviewer of a resolved discrepancy may leave the platform. The record
-- of who resolved it is kept, so the reference is cleared instead of
-- blocking the delete.
ALTER TABLE discrepancies
  DROP CONSTRAINT IF EXISTS discrepancies_resolved_by_fkey;

ALTER TABLE discrepancies
  ADD CONSTRAINT discrepancies_resolved_by_fkey
  FOREIGN KEY (resolved_by) REFERENCES users(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- 6. Keep the reporting view in step with the selected result
-- ---------------------------------------------------------------------------
-- The view exposed "verified primary submissions". It now exposes the
-- selected result instead, so a station that was reported by an approved
-- observer fallback is visible as well. The column list is unchanged, so
-- CREATE OR REPLACE VIEW is allowed.

CREATE OR REPLACE VIEW polling_station_results AS
SELECT
  ps.id AS polling_station_id,
  ps.name AS polling_station_name,
  ps.code AS polling_station_code,
  w.name AS ward_name,
  c.name AS constituency_name,
  co.name AS county_name,
  r.position,
  cv.candidate_name,
  cv.party_name,
  cv.votes,
  r.registered_voters,
  r.total_votes_cast,
  r.valid_votes,
  r.rejected_votes,
  s.submission_type,
  s.confidence_score,
  s.submitted_at
FROM polling_stations ps
JOIN wards w ON ps.ward_id = w.id
JOIN constituencies c ON ps.constituency_id = c.id
JOIN counties co ON ps.county_id = co.id
JOIN selected_results sel ON sel.polling_station_id = ps.id
JOIN submissions s ON s.id = sel.submission_id
JOIN results r ON s.id = r.submission_id
JOIN candidate_votes cv ON r.id = cv.result_id;

-- ---------------------------------------------------------------------------
-- 7. Audit trail
-- ---------------------------------------------------------------------------
INSERT INTO audit_logs (action, entity_type, entity_id, new_values)
VALUES ('database_migration', 'schema', 17, '{"migration": "submission_windows_and_fallbacks"}');
