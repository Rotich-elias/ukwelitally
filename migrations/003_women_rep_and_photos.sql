-- Migration to add women representative position and profile photos for candidates
-- This adds the 6th position type and allows ballot candidates to have profile pictures

-- Add profile_photo column for candidates (if not exists)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'candidates' AND column_name = 'profile_photo') THEN
    ALTER TABLE candidates ADD COLUMN profile_photo VARCHAR(500);
  END IF;
END $$;

-- Update the position enum check constraint if it exists
-- Note: We'll handle position validation at the application layer for flexibility

-- Update comments
COMMENT ON COLUMN candidates.profile_photo IS 'URL or path to candidate profile photo (optional)';

-- Add some helpful indexes
CREATE INDEX IF NOT EXISTS idx_candidates_position ON candidates(position);

-- Audit log
INSERT INTO audit_logs (action, entity_type, entity_id, new_values)
VALUES ('database_migration', 'schema', 3, '{"description": "Added women rep position and profile photos"}');

-- Migration complete
-- Valid positions are now: president, governor, senator, women_rep, mp, mca
