-- ============================================================
-- Migration: 022_add_rejection_reason.sql
-- Purpose  : Add rejection_reason to public.users so rejected
--            registration requests carry a human-readable reason
--            that the user sees on their status screen.
-- ============================================================

ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS rejection_reason TEXT;