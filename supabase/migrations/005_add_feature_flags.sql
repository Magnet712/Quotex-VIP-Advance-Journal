-- ============================================================
-- Migration: 005_add_feature_flags.sql
-- Purpose  : Seed default feature flags inside system_settings.
-- ============================================================

INSERT INTO public.system_settings (key, value) VALUES
  ('feature_flag_premium_signals', 'true'),
  ('feature_flag_ai_review', 'true'),
  ('feature_flag_checklists', 'true'),
  ('feature_flag_pricing_page', 'true')
ON CONFLICT (key) DO NOTHING;
