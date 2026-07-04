-- ============================================================
-- Migration: 013_add_referred_by_column.sql
-- Purpose  : Add referred_by_trader_id to public.users to support
--            in-app milestone-based referral premium tracking.
-- ============================================================

ALTER TABLE public.users 
ADD COLUMN IF NOT EXISTS referred_by_trader_id TEXT;
