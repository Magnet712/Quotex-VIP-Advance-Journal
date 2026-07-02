-- Extend payment_status enum with new blockchain states
ALTER TYPE payment_status ADD VALUE IF NOT EXISTS 'DETECTED';
ALTER TYPE payment_status ADD VALUE IF NOT EXISTS 'CONFIRMING';
ALTER TYPE payment_status ADD VALUE IF NOT EXISTS 'DUPLICATE';
ALTER TYPE payment_status ADD VALUE IF NOT EXISTS 'REJECTED';

-- Add diagnostics and confirmations columns to payment_requests table
ALTER TABLE payment_requests ADD COLUMN IF NOT EXISTS confirmation_count INTEGER DEFAULT 0;
ALTER TABLE payment_requests ADD COLUMN IF NOT EXISTS transition_logs TEXT[] DEFAULT '{}';
