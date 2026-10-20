-- Refresh all_candidates_view so observer placeholder candidates are excluded
--
-- The view was created in migration 003, before `is_placeholder` existed
-- (migration 011). A placeholder row has is_system_user = false, so it
-- satisfied the view's "ballot candidate" branch and was returned by the
-- view.
--
-- Excluding placeholders here matches the intended application behaviour:
-- every candidate listing in the application already excludes them
-- (is_system_user = false AND is_placeholder = false) and vote aggregation
-- excludes them too (src/app/api/results/aggregate/route.ts).
--
-- The column list is unchanged on purpose: CREATE OR REPLACE VIEW requires
-- the same column names, types and order as the view it replaces.

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
WHERE c.is_placeholder = false
  AND ((c.is_system_user = true AND u.active = true) OR c.is_system_user = false);

-- Audit log
INSERT INTO audit_logs (action, entity_type, entity_id, new_values)
VALUES ('database_migration', 'schema', 16, '{"migration": "all_candidates_view_refresh"}');
