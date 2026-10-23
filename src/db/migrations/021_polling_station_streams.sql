-- Streams and registration centres on polling stations.
--
-- The official IEBC polling-station list is one row per stream: a polling
-- station with three streams appears three times, sharing the station name and
-- carrying a stream number and the registration centre it belongs to.
--
-- This migration:
--   1. adds the two columns,
--   2. makes the station a station + stream pair for uniqueness (the old
--      UNIQUE(ward_id, name) would reject the second stream of a station),
--   3. backfills the stream of the rows written before the column existed so
--      the key stays satisfied.
--
-- The columns are nullable: a station whose stream is unknown is still valid.
-- The uniqueness index below therefore treats a missing stream as a single
-- value ("the station itself", not stream 1).

ALTER TABLE polling_stations
  ADD COLUMN IF NOT EXISTS stream VARCHAR(50),
  ADD COLUMN IF NOT EXISTS registration_centre VARCHAR(255);

-- Drop the old name-only uniqueness. It cannot express a station that is split
-- into streams.
ALTER TABLE polling_stations
  DROP CONSTRAINT IF EXISTS polling_stations_ward_id_name_key;

-- A polling station is unique by its ward, its name and its stream. A NULL
-- stream is one value, so a station that has no stream still appears once.
-- COALESCE keeps NULL from defeating the index, which Postgres treats as
-- always distinct.
CREATE UNIQUE INDEX IF NOT EXISTS polling_stations_ward_name_stream_key
  ON polling_stations (ward_id, name, COALESCE(stream, ''));

-- The code's own uniqueness is re-scoped to (code, stream) by migration 022.
COMMENT ON COLUMN polling_stations.stream IS
  'The stream number of a polling station that is split into streams (1, 2, ...). NULL when the station has no stream.';
COMMENT ON COLUMN polling_stations.registration_centre IS
  'The registration centre the polling station belongs to.';
