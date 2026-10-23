-- Compute registered voters from polling stations as source of truth
-- Create views and helper functions to roll up

CREATE OR REPLACE VIEW ward_registered_voters AS
SELECT w.id AS ward_id,
       COALESCE(SUM(ps.registered_voters), 0) AS registered_voters,
       COUNT(ps.id) AS station_count
FROM wards w
LEFT JOIN polling_stations ps ON ps.ward_id = w.id
GROUP BY w.id;

CREATE OR REPLACE VIEW constituency_registered_voters AS
SELECT c.id AS constituency_id,
       COALESCE(SUM(ps.registered_voters), 0) AS registered_voters,
       COUNT(ps.id) AS station_count
FROM constituencies c
LEFT JOIN polling_stations ps ON ps.constituency_id = c.id
GROUP BY c.id;

CREATE OR REPLACE VIEW county_registered_voters AS
SELECT co.id AS county_id,
       COALESCE(SUM(ps.registered_voters), 0) AS registered_voters,
       COUNT(ps.id) AS station_count
FROM counties co
LEFT JOIN polling_stations ps ON ps.county_id = co.id
GROUP BY co.id;

-- Function to sync all parent registered_voters from stations
CREATE OR REPLACE FUNCTION sync_registered_voters_from_stations()
RETURNS TABLE(counties_updated INTEGER, constituencies_updated INTEGER, wards_updated INTEGER) AS $$
DECLARE
  c_upd INTEGER := 0;
  cons_upd INTEGER := 0;
  w_upd INTEGER := 0;
BEGIN
  UPDATE counties co
  SET registered_voters = COALESCE(cv.registered_voters, 0)
  FROM county_registered_voters cv
  WHERE cv.county_id = co.id;

  GET DIAGNOSTICS c_upd = ROW_COUNT;

  UPDATE constituencies con
  SET registered_voters = COALESCE(cnv.registered_voters, 0)
  FROM constituency_registered_voters cnv
  WHERE cnv.constituency_id = con.id;

  GET DIAGNOSTICS cons_upd = ROW_COUNT;

  UPDATE wards w
  SET registered_voters = COALESCE(wv.registered_voters, 0)
  FROM ward_registered_voters wv
  WHERE wv.ward_id = w.id;

  GET DIAGNOSTICS w_upd = ROW_COUNT;

  RETURN QUERY SELECT c_upd, cons_upd, w_upd;
END;
$$ LANGUAGE plpgsql;

-- Function to sync on station changes
CREATE OR REPLACE FUNCTION trigger_sync_registered_voters()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' OR TG_OP = 'DELETE' THEN
    PERFORM sync_registered_voters_from_stations();
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_registered_voters_ins ON polling_stations;
DROP TRIGGER IF EXISTS trg_sync_registered_voters_upd ON polling_stations;
DROP TRIGGER IF EXISTS trg_sync_registered_voters_del ON polling_stations;

CREATE TRIGGER trg_sync_registered_voters_ins
  AFTER INSERT ON polling_stations
  FOR EACH ROW
  EXECUTE FUNCTION trigger_sync_registered_voters();

CREATE TRIGGER trg_sync_registered_voters_upd
  AFTER UPDATE OF registered_voters, ward_id, constituency_id, county_id ON polling_stations
  FOR EACH ROW
  EXECUTE FUNCTION trigger_sync_registered_voters();

CREATE TRIGGER trg_sync_registered_voters_del
  AFTER DELETE ON polling_stations
  FOR EACH ROW
  EXECUTE FUNCTION trigger_sync_registered_voters();

-- Initial sync
SELECT * FROM sync_registered_voters_from_stations();
