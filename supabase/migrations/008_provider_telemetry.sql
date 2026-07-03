-- Migration: 008_provider_telemetry.sql
-- Create table for tracking market data provider metrics and connection health.

CREATE TABLE IF NOT EXISTS public.provider_telemetry (
    provider_id TEXT PRIMARY KEY,
    latency_ms INTEGER DEFAULT 0,
    reconnect_count INTEGER DEFAULT 0,
    disconnect_count INTEGER DEFAULT 0,
    health_score INTEGER DEFAULT 100,
    last_update TIMESTAMPTZ DEFAULT NOW(),
    active_flag BOOLEAN DEFAULT FALSE,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row-Level Security
ALTER TABLE public.provider_telemetry ENABLE ROW LEVEL SECURITY;

-- Create policies: Service role can write/read all, authenticated clients can read health states.
CREATE POLICY "Allow public read access to provider metrics"
    ON public.provider_telemetry
    FOR SELECT
    TO public
    USING (true);

CREATE POLICY "Allow service_role full control on provider metrics"
    ON public.provider_telemetry
    ALL
    TO service_role
    USING (true)
    WITH CHECK (true);
