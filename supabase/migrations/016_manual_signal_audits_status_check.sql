-- ============================================================
-- Migration: 016_manual_signal_audits_status_check.sql
-- Purpose  : Update manual_signal_audits status check constraint
--            to allow new lifecycle statuses (SCANNING, FAILED)
--            that were introduced after the initial migration.
-- ============================================================

ALTER TABLE public.manual_signal_audits
DROP CONSTRAINT IF EXISTS manual_signal_audits_status_check;

ALTER TABLE public.manual_signal_audits
ADD CONSTRAINT manual_signal_audits_status_check
CHECK (
  status IN (
    'SCANNING',
    'PENDING',
    'NO TRADE',
    'FAILED',
    'WIN',
    'LOSS',
    'REFUND'
  )
);
