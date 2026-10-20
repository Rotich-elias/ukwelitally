-- Migration to add payment tracking for candidates
-- This allows admins to track payment status for system user candidates

-- Add payment columns to candidates table
ALTER TABLE candidates
  ADD COLUMN payment_status VARCHAR(50) DEFAULT 'pending',
  ADD COLUMN payment_amount DECIMAL(10, 2),
  ADD COLUMN payment_date TIMESTAMP,
  ADD COLUMN payment_reference VARCHAR(100),
  ADD COLUMN payment_notes TEXT;

-- Add check constraint for payment status
ALTER TABLE candidates ADD CONSTRAINT candidates_payment_status_check
  CHECK (payment_status IN ('pending', 'partial', 'paid', 'refunded', 'waived'));

-- Create payments table for detailed payment history
CREATE TABLE IF NOT EXISTS candidate_payments (
  id SERIAL PRIMARY KEY,
  candidate_id INTEGER NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  amount DECIMAL(10, 2) NOT NULL,
  payment_method VARCHAR(50),
  payment_reference VARCHAR(100),
  payment_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  recorded_by INTEGER REFERENCES users(id),
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Add indexes
CREATE INDEX idx_candidates_payment_status ON candidates(payment_status);
CREATE INDEX idx_candidate_payments_candidate_id ON candidate_payments(candidate_id);
CREATE INDEX idx_candidate_payments_date ON candidate_payments(payment_date);

-- Add comments
COMMENT ON COLUMN candidates.payment_status IS 'Payment status: pending, partial, paid, refunded, waived';
COMMENT ON COLUMN candidates.payment_amount IS 'Expected/total payment amount';
COMMENT ON COLUMN candidates.payment_date IS 'Date payment was completed';
COMMENT ON COLUMN candidates.payment_reference IS 'Payment transaction reference';
COMMENT ON COLUMN candidates.payment_notes IS 'Additional payment notes';

COMMENT ON TABLE candidate_payments IS 'Detailed payment history for candidates';
COMMENT ON COLUMN candidate_payments.amount IS 'Amount paid in this transaction';
COMMENT ON COLUMN candidate_payments.payment_method IS 'e.g., Cash, M-Pesa, Bank Transfer, Cheque';
COMMENT ON COLUMN candidate_payments.recorded_by IS 'Admin user who recorded this payment';

-- Audit log
INSERT INTO audit_logs (action, entity_type, entity_id, new_values)
VALUES ('database_migration', 'schema', 5, '{"description": "Added payment tracking for candidates"}');

-- Sample payment methods for reference
-- 'Cash', 'M-Pesa', 'Bank Transfer', 'Cheque', 'Card'
