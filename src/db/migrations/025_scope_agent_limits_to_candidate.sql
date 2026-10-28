-- Scope the agent assignment limits to each candidate's team.
--
-- Migration 019 enforced one primary and two backup agents per polling
-- station across the whole database. That meant the first team to assign a
-- primary agent at a station used the only primary slot, and every other
-- team had to fall back to a backup agent (or could not assign anyone). A
-- presidential team could therefore prevent an MCA team from staffing the
-- same station.
--
-- The limits belong to a team: each candidate may have one primary agent and
-- two backup agents at a polling station. Teams are independent.

CREATE OR REPLACE FUNCTION check_agent_limits()
RETURNS TRIGGER AS $$
DECLARE
  primary_count INTEGER;
  backup_count INTEGER;
BEGIN
  -- An agent without a station or without a candidate team is not part of a
  -- station allocation and is not subject to these limits.
  IF NEW.polling_station_id IS NULL OR NEW.candidate_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.is_primary IS TRUE THEN
    SELECT COUNT(*) INTO primary_count
    FROM agents
    WHERE candidate_id = NEW.candidate_id
      AND polling_station_id = NEW.polling_station_id
      AND is_primary = TRUE
      AND id <> COALESCE(NEW.id, -1);

    IF primary_count >= 1 THEN
      RAISE EXCEPTION 'Only 1 primary agent allowed per polling station for a candidate team';
    END IF;
  ELSE
    SELECT COUNT(*) INTO backup_count
    FROM agents
    WHERE candidate_id = NEW.candidate_id
      AND polling_station_id = NEW.polling_station_id
      AND is_primary = FALSE
      AND id <> COALESCE(NEW.id, -1);

    IF backup_count >= 2 THEN
      RAISE EXCEPTION 'Maximum 2 backup agents allowed per polling station for a candidate team';
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

-- Audit log
INSERT INTO audit_logs (action, entity_type, entity_id, new_values)
VALUES ('database_migration', 'schema', 25, '{"migration": "scope_agent_limits_to_candidate"}');
