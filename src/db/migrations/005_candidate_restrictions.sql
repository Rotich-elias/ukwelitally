-- Migration: Add location restrictions to candidates table
-- This ensures candidates can only access their electoral area

-- Add location restriction columns to candidates table
ALTER TABLE candidates
ADD COLUMN IF NOT EXISTS county_id INTEGER REFERENCES counties(id),
ADD COLUMN IF NOT EXISTS constituency_id INTEGER REFERENCES constituencies(id),
ADD COLUMN IF NOT EXISTS ward_id INTEGER REFERENCES wards(id);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_candidates_county ON candidates(county_id);
CREATE INDEX IF NOT EXISTS idx_candidates_constituency ON candidates(constituency_id);
CREATE INDEX IF NOT EXISTS idx_candidates_ward ON candidates(ward_id);

-- Add check constraint to ensure position matches assigned location
ALTER TABLE candidates
ADD CONSTRAINT candidate_position_location_check CHECK (
  (position = 'president') OR
  (position = 'governor' AND county_id IS NOT NULL) OR
  (position = 'senator' AND county_id IS NOT NULL) OR
  (position = 'mp' AND constituency_id IS NOT NULL) OR
  (position = 'mca' AND ward_id IS NOT NULL)
);

-- Comment on columns
COMMENT ON COLUMN candidates.county_id IS 'County restriction for Governor/Senator positions';
COMMENT ON COLUMN candidates.constituency_id IS 'Constituency restriction for MP position';
COMMENT ON COLUMN candidates.ward_id IS 'Ward restriction for MCA position';

-- Update existing candidates to set county/constituency/ward based on position
-- This is a safe operation since we don't have real data yet
UPDATE candidates SET county_id = 1 WHERE position IN ('governor', 'senator') AND county_id IS NULL;
UPDATE candidates SET constituency_id = 1 WHERE position = 'mp' AND constituency_id IS NULL;
UPDATE candidates SET ward_id = 1 WHERE position = 'mca' AND ward_id IS NULL;
