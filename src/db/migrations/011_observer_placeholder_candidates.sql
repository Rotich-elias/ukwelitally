-- Observer placeholder candidates
--
-- Observers submit results for a POSITION (presidential) rather than for a
-- specific candidate, but submissions.candidate_id is NOT NULL. To satisfy that
-- constraint each position needs a designated "observer submissions"
-- placeholder candidate.
--
-- These placeholders are NOT ballot entries: they must never appear in the
-- candidate list used to tally votes, and they must never be matched when
-- aggregating results.

-- 1. Flag placeholder candidates
ALTER TABLE candidates
  ADD COLUMN IF NOT EXISTS is_placeholder BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN candidates.is_placeholder IS
  'True for internal placeholder candidates used to attach observer submissions. Never a real ballot entry.';

-- 2. Relax the location constraint so placeholders (which have no electoral
--    area) can be inserted. Real candidates keep their existing requirement.
ALTER TABLE candidates
  DROP CONSTRAINT IF EXISTS candidate_position_location_check;

ALTER TABLE candidates
  ADD CONSTRAINT candidate_position_location_check CHECK (
    is_placeholder = true OR
    (position = 'president') OR
    (position = 'governor' AND county_id IS NOT NULL) OR
    (position = 'senator' AND county_id IS NOT NULL) OR
    (position = 'women_rep' AND county_id IS NOT NULL) OR
    (position = 'mp' AND constituency_id IS NOT NULL) OR
    (position = 'mca' AND ward_id IS NOT NULL)
  );

-- 3. Mark the pre-existing observer submission placeholder.
UPDATE candidates
SET is_placeholder = TRUE
WHERE full_name ILIKE '%Observer Submissions%'
  AND is_system_user = FALSE;

-- 4. Ensure a placeholder exists for every position observers can cover.
--    ON CONFLICT is not usable here (no unique index on full_name), so the
--    INSERT is guarded by a NOT EXISTS check.
INSERT INTO candidates (full_name, position, is_system_user, is_placeholder)
SELECT
  initcap(REPLACE(p.position, '_', ' ')) || ' Election - Observer Submissions',
  p.position,
  FALSE,
  TRUE
FROM (VALUES
  ('president'),
  ('governor'),
  ('senator'),
  ('women_rep'),
  ('mp'),
  ('mca')
) AS p(position)
WHERE NOT EXISTS (
  SELECT 1 FROM candidates c
  WHERE c.position = p.position AND c.is_placeholder = TRUE
);

-- 5. Placeholder candidates are not real ballot entries, so they must not be
--    returned by the ballot candidate list.
CREATE INDEX IF NOT EXISTS idx_candidates_is_placeholder ON candidates(is_placeholder);

-- 6. The result position must accept every valid position.
ALTER TABLE results
  DROP CONSTRAINT IF EXISTS results_position_check;

ALTER TABLE results
  ADD CONSTRAINT results_position_check
  CHECK (position IN ('president', 'governor', 'senator', 'women_rep', 'mp', 'mca'));

COMMENT ON CONSTRAINT results_position_check ON results IS
  'Valid positions: president, governor, senator, women_rep, mp, mca';

-- 7. Audit log
INSERT INTO audit_logs (action, entity_type, entity_id, new_values)
VALUES ('database_migration', 'schema', 11, '{"migration": "observer_placeholder_candidates"}');
