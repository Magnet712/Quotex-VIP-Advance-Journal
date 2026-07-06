-- ============================================================
-- Migration: 015_manual_signal_audits.sql
-- Purpose  : Create table for manual live signal audits.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.manual_signal_audits (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    pair            TEXT        NOT NULL,
    direction       TEXT        NOT NULL CHECK (direction IN ('CALL', 'PUT', 'WAIT')),
    entry_price     NUMERIC     NOT NULL,
    entry_time      TIMESTAMPTZ NOT NULL,
    expiry_time     TIMESTAMPTZ NOT NULL,
    expiry_price    NUMERIC,
    confidence      INTEGER     NOT NULL CHECK (confidence BETWEEN 0 AND 100),
    market_bias     TEXT        NOT NULL,
    signal_strength INTEGER     NOT NULL CHECK (signal_strength BETWEEN 0 AND 100),
    provider        TEXT        NOT NULL,
    status          TEXT        NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'WIN', 'LOSS', 'REFUND', 'NO TRADE')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for user lookup query optimization
CREATE INDEX IF NOT EXISTS idx_manual_signal_audits_user
    ON public.manual_signal_audits (user_id);

-- Index for ordering timeline feed newest first
CREATE INDEX IF NOT EXISTS idx_manual_signal_audits_created
    ON public.manual_signal_audits (created_at DESC);

-- Enable RLS
ALTER TABLE public.manual_signal_audits ENABLE ROW LEVEL SECURITY;

-- Select policy: users can only see their own manual signals
CREATE POLICY "Users can view their own manual signal audits"
    ON public.manual_signal_audits FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

-- Insert policy: users can insert their own manual signals
CREATE POLICY "Users can insert their own manual signal audits"
    ON public.manual_signal_audits FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = user_id);

-- Update policy: users can update their own manual signals (for resolution)
CREATE POLICY "Users can update their own manual signal audits"
    ON public.manual_signal_audits FOR UPDATE
    TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);
