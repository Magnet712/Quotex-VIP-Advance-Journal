-- ============================================================
-- Migration: 004_add_premium_access.sql
-- Purpose  : Add premium access tier and seed pricing setup.
-- ============================================================

-- 1. Add premium_access column to public.users table
ALTER TABLE public.users 
ADD COLUMN IF NOT EXISTS premium_access BOOLEAN NOT NULL DEFAULT FALSE;

-- 2. Seed price settings keys in system_settings if they don't exist
INSERT INTO public.system_settings (key, value) VALUES
  ('price_premium_monthly', '$19'),
  ('price_premium_6months', '$99'),
  ('price_premium_lifetime', '$199')
ON CONFLICT (key) DO NOTHING;
