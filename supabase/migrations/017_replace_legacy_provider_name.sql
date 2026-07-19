-- ============================================================
-- Migration: 017_replace_legacy_provider_name.sql
-- Purpose  : One-time cleanup of historical provider values
--            in the manual_signal_audits table.
--
--            Replaces the legacy provider value 'LIVE_MARKET'
--            with 'TWELVE DATA' in all historical rows.
--
--            Only affects rows with provider = 'LIVE_MARKET'.
--            Does NOT modify rows already containing 'TWELVE DATA'.
--            Does NOT modify any other provider values.
--            Does NOT change timestamps, status, results, or
--            confidence values.
-- ============================================================

-- Safely update historical provider values
UPDATE public.manual_signal_audits
SET provider = 'TWELVE DATA'
WHERE provider = 'LIVE_MARKET';

-- Verify the update (outputs count of affected rows)
DO $$
DECLARE
  affected_rows INTEGER;
  remaining_legacy INTEGER;
  current_values TEXT[];
BEGIN
  SELECT COUNT(*) INTO affected_rows
  FROM public.manual_signal_audits
  WHERE provider = 'LIVE_MARKET';

  SELECT COUNT(*) INTO remaining_legacy
  FROM public.manual_signal_audits
  WHERE provider = 'LIVE_MARKET';

  SELECT ARRAY_AGG(DISTINCT provider) INTO current_values
  FROM public.manual_signal_audits;

  RAISE NOTICE 'Migration 017: Rows updated from LIVE_MARKET → TWELVE DATA: %', affected_rows;
  RAISE NOTICE 'Migration 017: Rows still using LIVE_MARKET (should be 0): %', remaining_legacy;
  RAISE NOTICE 'Migration 017: Distinct provider values in table: %', current_values;
END $$;
