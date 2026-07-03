-- Migration: 012 Add Twelve Data Telemetry Fields
-- Date: 2026-07-03

ALTER TABLE public.provider_telemetry
ADD COLUMN IF NOT EXISTS provider_name TEXT,
ADD COLUMN IF NOT EXISTS provider_version TEXT,
ADD COLUMN IF NOT EXISTS provider_latency INTEGER,
ADD COLUMN IF NOT EXISTS provider_health INTEGER,
ADD COLUMN IF NOT EXISTS provider_type TEXT CHECK (provider_type IN ('REST', 'WebSocket')),
ADD COLUMN IF NOT EXISTS request_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS failure_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_success TIMESTAMP WITH TIME ZONE;

COMMENT ON COLUMN public.provider_telemetry.provider_type IS 'Indicates whether feed connection type is REST or WebSocket';
