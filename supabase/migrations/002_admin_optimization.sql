-- ============================================================
-- Migration: 002_admin_optimization.sql
-- Purpose  : Add strategy versioning, quality score, and premium signal filtering columns,
--            and seed initial system settings for optimization.
-- ============================================================

-- Alter public.signals table to add strategy version, quality score, and premium status
ALTER TABLE public.signals ADD COLUMN IF NOT EXISTS strategy_version TEXT DEFAULT 'v1.0';
ALTER TABLE public.signals ADD COLUMN IF NOT EXISTS quality_score INTEGER;
ALTER TABLE public.signals ADD COLUMN IF NOT EXISTS is_premium BOOLEAN DEFAULT TRUE;

-- Create index for strategy version for analytics
CREATE INDEX IF NOT EXISTS idx_signals_strategy_version ON public.signals(strategy_version);
CREATE INDEX IF NOT EXISTS idx_signals_is_premium ON public.signals(is_premium);

-- Seed initial configuration settings in system_settings
INSERT INTO public.system_settings (key, value) VALUES
  ('min_confidence', '80'),
  ('allowed_signal_hours', '08:00-12:00,18:00-22:00'),
  ('losing_streak_limit', '3'),
  ('losing_streak_pause_minutes', '15'),
  ('premium_filter_mode', 'PRODUCTION'),
  ('min_quality_score', '80'),
  ('disabled_pairs', ''),
  ('premium_signal_status', 'ACTIVE'),
  ('paused_until', '')
ON CONFLICT (key) DO NOTHING;
