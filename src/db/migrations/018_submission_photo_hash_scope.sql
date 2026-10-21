-- Submission photo duplicates are scoped to a submission
--
-- The hash of an uploaded photo is unique across the whole table, so the
-- same image can only ever be attached to one submission in the entire
-- platform. That breaks the correction workflow: an agent who corrects a
-- submission and re-uploads the same Form 34A photo has the photo silently
-- dropped, because the hash is already taken by the earlier version.
--
-- The hash exists to stop the same image being attached twice to the SAME
-- submission. The application already filters duplicates inside a request, so
-- the database constraint only has to cover that case.
--
-- The change is forward only and keeps every existing row: the unique
-- constraint is replaced by a unique index over (submission_id, hash).

ALTER TABLE submission_photos
  DROP CONSTRAINT IF EXISTS submission_photos_hash_key;

CREATE UNIQUE INDEX IF NOT EXISTS idx_submission_photos_submission_hash
  ON submission_photos (submission_id, hash);

COMMENT ON COLUMN submission_photos.hash IS
  'SHA-256 of the file. Unique per submission, so a correction may re-use the photo of the version it replaces.';

-- Audit log
INSERT INTO audit_logs (action, entity_type, entity_id, new_values)
VALUES ('database_migration', 'schema', 18, '{"migration": "submission_photo_hash_scope"}');
