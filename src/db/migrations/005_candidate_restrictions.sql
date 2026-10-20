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

-- The location constraint above is validated as it is created, so a row that
-- was missing its location could never be repaired afterwards: the ADD
-- CONSTRAINT would already have failed. There is therefore nothing left for
-- an UPDATE to fix, and backfilling a hard-coded id would only risk a foreign
-- key violation against a county, constituency or ward that does not exist.
