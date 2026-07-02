-- 1. Drop the text CHECK constraint if it exists to allow new payment states
ALTER TABLE public.payment_requests DROP CONSTRAINT IF EXISTS payment_requests_status_check;

-- 2. Add diagnostics and confirmations columns to payment_requests table
ALTER TABLE public.payment_requests ADD COLUMN IF NOT EXISTS confirmation_count INTEGER DEFAULT 0;
ALTER TABLE public.payment_requests ADD COLUMN IF NOT EXISTS transition_logs TEXT[] DEFAULT '{}';
