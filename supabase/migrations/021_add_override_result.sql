-- ============================================================
-- Migration: 021_add_override_result
-- Purpose  : Add override_result column to signals and
--            manual_signal_audits tables. When a user clicks
--            ST or MTG on a LOSS in the timeline, the result
--            is overridden to WIN across all dashboard views.
-- ============================================================

ALTER TABLE public.signals
ADD COLUMN override_result TEXT DEFAULT NULL;

ALTER TABLE public.manual_signal_audits
ADD COLUMN override_result TEXT DEFAULT NULL;
