-- Candidate vote integrity constraints
--
-- candidate_votes previously had no uniqueness guarantee, so the same
-- candidate could be inserted multiple times for a single result. That
-- double counts votes during aggregation. Add the constraint and clean up any
-- existing duplicates by merging their vote counts.

-- 1. Merge duplicate rows per (result_id, candidate_name) keeping the lowest id.
UPDATE candidate_votes cv
SET votes = merged.total_votes
FROM (
  SELECT
    result_id,
    candidate_name,
    MIN(id) AS keep_id,
    SUM(votes) AS total_votes
  FROM candidate_votes
  GROUP BY result_id, candidate_name
  HAVING COUNT(*) > 1
) merged
WHERE cv.result_id = merged.result_id
  AND cv.candidate_name = merged.candidate_name
  AND cv.id = merged.keep_id;

DELETE FROM candidate_votes cv
USING (
  SELECT
    result_id,
    candidate_name,
    MIN(id) AS keep_id
  FROM candidate_votes
  GROUP BY result_id, candidate_name
  HAVING COUNT(*) > 1
) merged
WHERE cv.result_id = merged.result_id
  AND cv.candidate_name = merged.candidate_name
  AND cv.id <> merged.keep_id;

-- 2. Enforce one row per candidate per result.
ALTER TABLE candidate_votes
  DROP CONSTRAINT IF EXISTS candidate_votes_result_candidate_key;

ALTER TABLE candidate_votes
  ADD CONSTRAINT candidate_votes_result_candidate_key
  UNIQUE (result_id, candidate_name);

COMMENT ON CONSTRAINT candidate_votes_result_candidate_key ON candidate_votes IS
  'One vote row per candidate per result. Prevents double counting during aggregation.';

-- 3. Audit log
INSERT INTO audit_logs (action, entity_type, entity_id, new_values)
VALUES ('database_migration', 'schema', 12, '{"migration": "candidate_votes_integrity"}');
