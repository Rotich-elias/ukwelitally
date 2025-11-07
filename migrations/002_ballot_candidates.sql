-- Migration to support ballot candidates (non-system candidates)
-- This allows tracking ALL candidates in a race, not just system users

-- Make user_id nullable (ballot candidates won't have user accounts)
ALTER TABLE candidates
  ALTER COLUMN user_id DROP NOT NULL;

-- Add full_name column for ballot candidates (system candidates get name from users table)
ALTER TABLE candidates
  ADD COLUMN full_name VARCHAR(255);

-- Add is_system_user flag to easily distinguish
ALTER TABLE candidates
  ADD COLUMN is_system_user BOOLEAN DEFAULT false;

-- Update existing candidates to be marked as system users
UPDATE candidates
SET is_system_user = true
WHERE user_id IS NOT NULL;

-- Update UNIQUE constraint to allow multiple ballot candidates
ALTER TABLE candidates
  DROP CONSTRAINT IF EXISTS candidates_user_id_key;

-- Add check constraint: system users must have user_id, ballot candidates must have full_name
ALTER TABLE candidates
  ADD CONSTRAINT candidates_user_or_name_check
  CHECK (
    (user_id IS NOT NULL AND is_system_user = true) OR
    (full_name IS NOT NULL AND is_system_user = false)
  );

-- Create index for better query performance
CREATE INDEX idx_candidates_is_system_user ON candidates(is_system_user);

-- Update the view to include both types of candidates
CREATE OR REPLACE VIEW all_candidates_view AS
SELECT
  c.id,
  COALESCE(u.full_name, c.full_name) as candidate_name,
  c.position,
  c.party_name,
  c.party_abbreviation,
  c.is_system_user,
  c.user_id,
  c.county_id,
  c.constituency_id,
  c.ward_id,
  co.name as county_name,
  con.name as constituency_name,
  w.name as ward_name
FROM candidates c
LEFT JOIN users u ON c.user_id = u.id
LEFT JOIN counties co ON c.county_id = co.id
LEFT JOIN constituencies con ON c.constituency_id = con.id
LEFT JOIN wards w ON c.ward_id = w.id
WHERE (c.is_system_user = true AND u.active = true) OR c.is_system_user = false;

-- Audit log
INSERT INTO audit_logs (action, entity_type, entity_id, new_values)
VALUES ('database_migration', 'schema', 2, '{"description": "Added support for ballot candidates"}');

-- Migration complete
COMMENT ON COLUMN candidates.full_name IS 'Full name for ballot candidates (non-system users only)';
COMMENT ON COLUMN candidates.is_system_user IS 'True if candidate owns/uses the system, false if just on ballot';
