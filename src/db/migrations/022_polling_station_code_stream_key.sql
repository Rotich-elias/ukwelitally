-- A polling station is keyed by its IEBC code together with its stream.
--
-- The initial schema declared `code VARCHAR(50) NOT NULL UNIQUE`, which makes a
-- code a global identifier. That contradicts the official IEBC station list:
-- the list is one row per stream, and a station split into streams can repeat
-- the station code (the stream distinguishes the rows). With the code unique on
-- its own the second stream of a station is rejected, so the constraint has to
-- go.
--
-- The code stays mandatory, but its uniqueness is now scoped to the code and
-- the stream together. The uniqueness on (ward_id, name, stream) added in 021
-- already distinguishes the streams of a station by name; this migration makes
-- the code follow the same rule so a file keyed by code and stream imports as
-- the official list is written.
--
-- The index is built on (code, COALESCE(stream, '')) so a NULL stream is one
-- value rather than many (Postgres treats every NULL as distinct). A station
-- without a stream therefore still has one row per code.

ALTER TABLE polling_stations
  DROP CONSTRAINT IF EXISTS polling_stations_code_key;

-- The equivalent index, in case the constraint was created as a bare index.
DROP INDEX IF EXISTS polling_stations_code_key;

CREATE UNIQUE INDEX IF NOT EXISTS polling_stations_code_stream_key
  ON polling_stations (code, COALESCE(stream, ''));
