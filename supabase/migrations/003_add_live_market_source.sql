-- ============================================================
-- Migration: 003_add_live_market_source.sql
-- Purpose  : Modify the source check constraint on public.signals
--            table to allow 'live_market' signals from webhooks.
-- ============================================================

-- Drop the old constraint
ALTER TABLE public.signals 
DROP CONSTRAINT IF EXISTS signals_source_check;

-- Create the updated check constraint
ALTER TABLE public.signals 
ADD CONSTRAINT signals_source_check 
CHECK (source IN ('simulation', 'live_otc', 'live_market'));
