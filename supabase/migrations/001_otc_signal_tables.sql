-- ============================================================
-- Migration: 001_otc_signal_tables.sql
-- Purpose  : Add OTC candle storage, signal tracking, and
--            admin signal mode control to Quotex VIP Journal.
--
-- Run this in the Supabase SQL Editor AFTER the base schema.sql
-- ============================================================

-- Enable UUID extension (safe to run again if already enabled)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";


-- ============================================================
-- TABLE: system_settings
-- Stores key/value admin configuration (e.g. signal_mode).
-- ============================================================
CREATE TABLE IF NOT EXISTS public.system_settings (
    key        TEXT PRIMARY KEY,
    value      TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed default signal mode to SIMULATION
INSERT INTO public.system_settings (key, value)
VALUES ('signal_mode', 'SIMULATION')
ON CONFLICT (key) DO NOTHING;

ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

-- Admins can read and write settings
CREATE POLICY "Admins can manage system_settings"
    ON public.system_settings
    FOR ALL
    TO authenticated
    USING (EXISTS (SELECT 1 FROM public.admins WHERE id = auth.uid()))
    WITH CHECK (EXISTS (SELECT 1 FROM public.admins WHERE id = auth.uid()));

-- All authenticated users can READ settings (to know current signal mode)
CREATE POLICY "Authenticated users can read system_settings"
    ON public.system_settings
    FOR SELECT
    TO authenticated
    USING (true);


-- ============================================================
-- TABLE: otc_candles
-- Stores every OTC candle processed by the signal engine.
-- source values: 'simulation' | 'live_otc' | 'manual'
-- ============================================================
CREATE TABLE IF NOT EXISTS public.otc_candles (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    pair        TEXT        NOT NULL,
    timeframe   TEXT        NOT NULL DEFAULT '1m',
    open        NUMERIC     NOT NULL,
    high        NUMERIC     NOT NULL,
    low         NUMERIC     NOT NULL,
    close       NUMERIC     NOT NULL,
    timestamp   TIMESTAMPTZ NOT NULL,
    source      TEXT        NOT NULL DEFAULT 'simulation'
                CHECK (source IN ('simulation', 'live_otc', 'manual')),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for fast lookups by pair + timeframe + time range
CREATE INDEX IF NOT EXISTS idx_otc_candles_pair_ts
    ON public.otc_candles (pair, timeframe, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_otc_candles_source
    ON public.otc_candles (source);

ALTER TABLE public.otc_candles ENABLE ROW LEVEL SECURITY;

-- Admins can do everything
CREATE POLICY "Admins can manage otc_candles"
    ON public.otc_candles
    FOR ALL
    TO authenticated
    USING (EXISTS (SELECT 1 FROM public.admins WHERE id = auth.uid()))
    WITH CHECK (EXISTS (SELECT 1 FROM public.admins WHERE id = auth.uid()));

-- Approved users can read candles
CREATE POLICY "Approved users can read otc_candles"
    ON public.otc_candles
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.users
            WHERE id = auth.uid() AND status = 'approved'
        )
    );

-- Service role can insert (used by server actions)
CREATE POLICY "Service role can insert otc_candles"
    ON public.otc_candles
    FOR INSERT
    TO authenticated
    WITH CHECK (true);


-- ============================================================
-- TABLE: signals
-- Stores every generated signal from creation to final result.
-- Signals are NEVER deleted — permanent record for credibility.
--
-- Signal lifecycle:
--   PENDING → WIN | LOSS
--
-- direction values : 'CALL' | 'PUT'
-- result values    : 'PENDING' | 'WIN' | 'LOSS'
-- source values    : 'simulation' | 'live_otc'
-- ============================================================
CREATE TABLE IF NOT EXISTS public.signals (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    pair            TEXT        NOT NULL,
    timeframe       TEXT        NOT NULL DEFAULT '1m',
    direction       TEXT        NOT NULL CHECK (direction IN ('CALL', 'PUT')),
    entry_price     NUMERIC     NOT NULL,
    entry_time      TIMESTAMPTZ NOT NULL,
    expiry_time     TIMESTAMPTZ,                    -- set when signal saved
    expiry_price    NUMERIC,                        -- filled after expiry
    strategy_name   TEXT        NOT NULL,
    confidence      INTEGER     NOT NULL CHECK (confidence BETWEEN 0 AND 100),
    risk_level      TEXT,                           -- 'LOW' | 'MEDIUM' | 'HIGH'
    result          TEXT        NOT NULL DEFAULT 'PENDING'
                    CHECK (result IN ('PENDING', 'WIN', 'LOSS')),
    source          TEXT        NOT NULL DEFAULT 'simulation'
                    CHECK (source IN ('simulation', 'live_otc')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for fast filtering on the Signal History page
CREATE INDEX IF NOT EXISTS idx_signals_pair
    ON public.signals (pair);

CREATE INDEX IF NOT EXISTS idx_signals_result
    ON public.signals (result);

CREATE INDEX IF NOT EXISTS idx_signals_source
    ON public.signals (source);

CREATE INDEX IF NOT EXISTS idx_signals_strategy
    ON public.signals (strategy_name);

CREATE INDEX IF NOT EXISTS idx_signals_entry_time
    ON public.signals (entry_time DESC);

ALTER TABLE public.signals ENABLE ROW LEVEL SECURITY;

-- Admins can do everything
CREATE POLICY "Admins can manage signals"
    ON public.signals
    FOR ALL
    TO authenticated
    USING (EXISTS (SELECT 1 FROM public.admins WHERE id = auth.uid()))
    WITH CHECK (EXISTS (SELECT 1 FROM public.admins WHERE id = auth.uid()));

-- Approved users can read signals (premium access to history)
CREATE POLICY "Approved users can read signals"
    ON public.signals
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.users
            WHERE id = auth.uid() AND status = 'approved'
        )
    );

-- Server actions can insert signals (non-admin authenticated users)
CREATE POLICY "Authenticated users can insert signals"
    ON public.signals
    FOR INSERT
    TO authenticated
    WITH CHECK (true);

-- Server actions can update result/expiry_price (result tracking)
CREATE POLICY "Authenticated users can update signal results"
    ON public.signals
    FOR UPDATE
    TO authenticated
    USING (true)
    WITH CHECK (true);


-- ============================================================
-- HELPER VIEW: signal_performance
-- Pre-aggregates WIN/LOSS stats for performance analytics.
-- ============================================================
CREATE OR REPLACE VIEW public.signal_performance AS
SELECT
    source,
    COUNT(*)                                                    AS total_signals,
    COUNT(*) FILTER (WHERE result = 'WIN')                      AS wins,
    COUNT(*) FILTER (WHERE result = 'LOSS')                     AS losses,
    COUNT(*) FILTER (WHERE result = 'PENDING')                  AS pending,
    ROUND(
        COUNT(*) FILTER (WHERE result = 'WIN')::NUMERIC
        / NULLIF(COUNT(*) FILTER (WHERE result IN ('WIN','LOSS')), 0) * 100,
        2
    )                                                           AS accuracy_pct
FROM public.signals
GROUP BY source;
