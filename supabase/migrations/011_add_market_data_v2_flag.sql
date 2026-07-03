-- Migration: 011_add_market_data_v2_flag.sql
-- Register feature flags for the Market Data Layer v2 rollout.

INSERT INTO public.feature_flags (key, value, updated_at)
VALUES 
    ('marketDataV2', 'false', NOW()),
    ('shadowMode', 'true', NOW())
ON CONFLICT (key) DO NOTHING;
