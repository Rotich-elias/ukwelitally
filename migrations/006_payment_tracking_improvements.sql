-- Migration to improve payment tracking
-- Add expected_amount and rename payment_amount to be clearer

-- Add expected payment amount column
ALTER TABLE candidates
  ADD COLUMN expected_payment_amount DECIMAL(10, 2);

-- Add comment
COMMENT ON COLUMN candidates.expected_payment_amount IS 'The full/expected payment amount for this candidate';
COMMENT ON COLUMN candidates.payment_amount IS 'DEPRECATED - Use candidate_payments table for tracking individual payments';

-- Update payment_status to be calculated based on payments
COMMENT ON COLUMN candidates.payment_status IS 'Payment status: pending, partial, paid, refunded, waived - should be calculated based on payments';

-- Make sure candidate_payments has proper structure for tracking
COMMENT ON TABLE candidate_payments IS 'Individual payment transactions for candidates - sum these to get total paid';
