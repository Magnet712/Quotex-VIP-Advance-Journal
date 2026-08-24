-- ============================================================
-- Migration: 023_discount_countdown.sql
-- Purpose  : Add discount_ends_at column to pricing_settings
--            so admin can set a real expiry deadline for any
--            active discount. NULL = no countdown shown.
-- ============================================================

ALTER TABLE public.pricing_settings
  ADD COLUMN IF NOT EXISTS discount_ends_at TIMESTAMPTZ NULL DEFAULT NULL;

COMMENT ON COLUMN public.pricing_settings.discount_ends_at IS
  'UTC timestamp when the active discount expires. NULL = no expiry / no countdown shown on pricing page.';
