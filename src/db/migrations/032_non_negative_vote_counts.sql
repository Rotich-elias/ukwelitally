-- Non-negative vote counts.
--
-- The results API validates figures, but the database itself accepted
-- negative vote counts. A negative count for a rival, counted in the public
-- tally, subtracts votes from them. These constraints make that impossible
-- whatever code path writes the figures.
--
-- The constraints are added NOT VALID: they are enforced for every new or
-- updated row straight away, without failing the migration on any existing
-- row. To also check existing rows, run after reviewing them:
--   ALTER TABLE results VALIDATE CONSTRAINT results_vote_counts_non_negative;
--   ALTER TABLE candidate_votes VALIDATE CONSTRAINT candidate_votes_votes_non_negative;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'results_vote_counts_non_negative'
  ) THEN
    ALTER TABLE results
      ADD CONSTRAINT results_vote_counts_non_negative
      CHECK (
        registered_voters >= 0
        AND total_votes_cast >= 0
        AND valid_votes >= 0
        AND rejected_votes >= 0
      ) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'candidate_votes_votes_non_negative'
  ) THEN
    ALTER TABLE candidate_votes
      ADD CONSTRAINT candidate_votes_votes_non_negative
      CHECK (votes >= 0) NOT VALID;
  END IF;
END $$;

INSERT INTO audit_logs (action, entity_type, entity_id, new_values)
VALUES ('database_migration', 'schema', 32, '{"migration": "non_negative_vote_counts"}');
