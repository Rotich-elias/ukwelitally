-- Explainable confidence scores and OCR evidence.
--
-- The original confidence score was calculated before the vote figures
-- existed and used hard-coded assumptions, which made almost every submission
-- land on the same number. The score is now recalculated from persisted
-- evidence and its components are stored, so the dashboard can explain why a
-- submission scored what it did.
--
-- OCR is optional. When GOOGLE_VISION_API_KEY is configured the uploaded form
-- photo is read and its OCR confidence contributes to the score. Without the
-- key the app records that OCR was unavailable instead of pretending it ran.

ALTER TABLE submissions
  ADD COLUMN IF NOT EXISTS confidence_breakdown JSONB;

ALTER TABLE submissions
  ADD COLUMN IF NOT EXISTS confidence_updated_at TIMESTAMPTZ;

COMMENT ON COLUMN submissions.confidence_breakdown IS
  'Per-component confidence evidence: GPS, photos, OCR, arithmetic, timeliness and anomalies.';

ALTER TABLE submission_photos
  ADD COLUMN IF NOT EXISTS ocr_text TEXT;

ALTER TABLE submission_photos
  ADD COLUMN IF NOT EXISTS ocr_confidence INTEGER
    CHECK (ocr_confidence BETWEEN 0 AND 100);

ALTER TABLE submission_photos
  ADD COLUMN IF NOT EXISTS ocr_engine VARCHAR(50);

ALTER TABLE submission_photos
  ADD COLUMN IF NOT EXISTS ocr_processed_at TIMESTAMPTZ;

COMMENT ON COLUMN submission_photos.ocr_text IS
  'Raw text returned by the OCR engine for the form photo.';
COMMENT ON COLUMN submission_photos.ocr_confidence IS
  'OCR engine confidence (0-100). NULL means OCR has not run on this photo.';

CREATE INDEX IF NOT EXISTS idx_submission_photos_ocr
  ON submission_photos(submission_id)
  WHERE ocr_processed_at IS NOT NULL;

INSERT INTO audit_logs (action, entity_type, entity_id, new_values)
VALUES (
  'database_migration',
  'schema',
  29,
  '{"migration": "confidence_and_ocr"}'
);
