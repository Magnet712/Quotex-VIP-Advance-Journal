-- Migration: 009_signal_audit_metadata.sql
-- Add audit and version metadata columns to public.signals table.
-- Nullable constraints guarantee complete backward compatibility for old inserts.

ALTER TABLE public.signals 
ADD COLUMN IF NOT EXISTS provider_name TEXT,
ADD COLUMN IF NOT EXISTS provider_version TEXT,
ADD COLUMN IF NOT EXISTS provider_latency INTEGER,
ADD COLUMN IF NOT EXISTS provider_health INTEGER,
ADD COLUMN IF NOT EXISTS market_data_layer_version TEXT DEFAULT '1.4.0',
ADD COLUMN IF NOT EXISTS data_origin TEXT;

-- Create index for fast provenance filtering
CREATE INDEX IF NOT EXISTS idx_signals_data_origin ON public.signals(data_origin);
CREATE INDEX IF NOT EXISTS idx_signals_provider_name ON public.signals(provider_name);
