-- Make the registered-voter roll-up cheap for a bulk import.
--
-- Migration 020 created row-level triggers on polling_stations. Every single
-- inserted or updated station recomputed the totals of every county,
-- constituency and ward, so a national file of ~46,000 stations made the
-- database do work proportional to rows x parents and the request timed out.
--
-- The triggers are now statement-level: one statement pays for the roll-up
-- once. A bulk import can also set the transaction-local
-- `ukwelitally.bulk_import` flag, in which case the trigger does nothing and
-- the import calls sync_registered_voters_from_stations() once at the end.
-- Single-row operations keep the immediate roll-up.

CREATE OR REPLACE FUNCTION trigger_sync_registered_voters()
RETURNS TRIGGER AS $$
BEGIN
  IF current_setting('ukwelitally.bulk_import', true) = 'on' THEN
    RETURN NULL;
  END IF;

  PERFORM sync_registered_voters_from_stations();
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_registered_voters_ins ON polling_stations;
DROP TRIGGER IF EXISTS trg_sync_registered_voters_upd ON polling_stations;
DROP TRIGGER IF EXISTS trg_sync_registered_voters_del ON polling_stations;

CREATE TRIGGER trg_sync_registered_voters_ins
  AFTER INSERT ON polling_stations
  FOR EACH STATEMENT
  EXECUTE FUNCTION trigger_sync_registered_voters();

CREATE TRIGGER trg_sync_registered_voters_upd
  AFTER UPDATE ON polling_stations
  FOR EACH STATEMENT
  EXECUTE FUNCTION trigger_sync_registered_voters();

CREATE TRIGGER trg_sync_registered_voters_del
  AFTER DELETE ON polling_stations
  FOR EACH STATEMENT
  EXECUTE FUNCTION trigger_sync_registered_voters();
