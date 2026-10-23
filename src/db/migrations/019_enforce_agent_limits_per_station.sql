-- Enforce agent assignment limits per polling station
-- Only 1 primary agent per polling station
-- Maximum 2 backup agents (is_primary = false) per polling station

CREATE OR REPLACE FUNCTION check_agent_limits()
RETURNS TRIGGER AS $$
DECLARE
  primary_count INTEGER;
  backup_count INTEGER;
BEGIN
  IF NEW.polling_station_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.is_primary IS TRUE THEN
    SELECT COUNT(*) INTO primary_count
    FROM agents
    WHERE polling_station_id = NEW.polling_station_id
      AND is_primary = TRUE
      AND id <> COALESCE(NEW.id, -1);
    
    IF primary_count >= 1 THEN
      RAISE EXCEPTION 'Only 1 primary agent allowed per polling station';
    END IF;
  ELSE
    SELECT COUNT(*) INTO backup_count
    FROM agents
    WHERE polling_station_id = NEW.polling_station_id
      AND is_primary = FALSE
      AND id <> COALESCE(NEW.id, -1);
    
    IF backup_count >= 2 THEN
      RAISE EXCEPTION 'Maximum 2 backup agents allowed per polling station';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_check_agent_limits ON agents;
CREATE TRIGGER trg_check_agent_limits
  BEFORE INSERT OR UPDATE ON agents
  FOR EACH ROW
  EXECUTE FUNCTION check_agent_limits();
