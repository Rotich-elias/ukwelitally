-- Add submission_reviews table for admin review tracking
CREATE TABLE IF NOT EXISTS submission_reviews (
  id SERIAL PRIMARY KEY,
  submission_id INTEGER REFERENCES submissions(id) ON DELETE CASCADE,
  reviewer_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(20) NOT NULL CHECK (action IN ('approve', 'reject', 'request_revision')),
  review_notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_submission_reviews_submission ON submission_reviews(submission_id);
CREATE INDEX idx_submission_reviews_reviewer ON submission_reviews(reviewer_id);

-- Add index for flagged submissions for faster admin queries
CREATE INDEX IF NOT EXISTS idx_submissions_status ON submissions(status);
CREATE INDEX IF NOT EXISTS idx_submissions_has_discrepancy ON submissions(has_discrepancy);
