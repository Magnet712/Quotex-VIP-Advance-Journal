-- ============================================================
-- Migration: 020_add_razorpay_columns.sql
-- Purpose  : Add Razorpay-specific columns to payment_requests
-- ============================================================

ALTER TABLE public.payment_requests ADD COLUMN IF NOT EXISTS razorpay_order_id TEXT;
ALTER TABLE public.payment_requests ADD COLUMN IF NOT EXISTS razorpay_payment_id TEXT;
ALTER TABLE public.payment_requests ADD COLUMN IF NOT EXISTS razorpay_signature TEXT;

-- Allow 'RAZORPAY' as a valid network value (no CHECK constraint to worry about — already dropped in 007)
