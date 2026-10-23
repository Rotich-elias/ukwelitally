-- Ward codes can be longer than 10 characters.
--
-- The initial schema declared `wards.code` as VARCHAR(10), but ward codes in
-- real files can exceed that (for example a 14 digit identifier). Widen the
-- column to VARCHAR(50), the same limit polling_stations.code already uses.
--
-- Codes are stored and matched as text, so this only relaxes the length
-- check. Existing values are unchanged.

ALTER TABLE wards
  ALTER COLUMN code TYPE VARCHAR(50);
