-- Fix position constraints to include women_rep and update logic

-- Drop old constraints
ALTER TABLE candidates DROP CONSTRAINT IF EXISTS candidate_position_location_check;
ALTER TABLE candidates DROP CONSTRAINT IF EXISTS candidates_position_check;

-- Add updated position check with women_rep
ALTER TABLE candidates ADD CONSTRAINT candidates_position_check
  CHECK (position IN ('president', 'governor', 'senator', 'women_rep', 'mp', 'mca'));

-- Add updated location check with women_rep
ALTER TABLE candidates ADD CONSTRAINT candidate_position_location_check CHECK (
  (position = 'president') OR
  (position = 'governor' AND county_id IS NOT NULL) OR
  (position = 'senator' AND county_id IS NOT NULL) OR
  (position = 'women_rep' AND county_id IS NOT NULL) OR
  (position = 'mp' AND constituency_id IS NOT NULL) OR
  (position = 'mca' AND ward_id IS NOT NULL)
);

-- Audit log
INSERT INTO audit_logs (action, entity_type, entity_id, new_values)
VALUES ('database_migration', 'schema', 4, '{"description": "Fixed position constraints to include women_rep"}');

COMMENT ON CONSTRAINT candidates_position_check ON candidates IS 'Valid positions: president, governor, senator, women_rep, mp, mca';
COMMENT ON CONSTRAINT candidate_position_location_check ON candidates IS 'President=no location, Governor/Senator/Women_rep=county, MP=constituency, MCA=ward';
