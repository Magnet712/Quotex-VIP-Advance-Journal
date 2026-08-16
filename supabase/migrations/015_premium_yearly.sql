-- ============================================================
-- Migration: 015_premium_yearly.sql
-- Purpose  : Introduce the Premium Yearly plan ($169 / 365 days)
--            replacing the one-time Lifetime plan for NEW sales.
--            Existing lifetime holders keep access (grandfathered):
--            their subscriptions have expires_at = NULL which the
--            expiry cron (014) never matches.
-- ============================================================

-- 1. Add the new yearly plan to pricing_settings (enabled for purchase)
INSERT INTO public.pricing_settings (id, name, price, currency, discount, enabled)
VALUES ('premium_yearly', 'Premium Yearly', 169, 'USD', 0, TRUE)
ON CONFLICT (id) DO NOTHING;

-- 2. Seed the yearly price key in system_settings for public pricing display
INSERT INTO public.system_settings (key, value) VALUES ('price_premium_yearly', '$169')
ON CONFLICT (key) DO NOTHING;

-- 3. Disable the Lifetime plan for NEW purchases only.
--    The row is NOT deleted (payment_requests/subscriptions FK reference it)
--    and active lifetime holders are unaffected.
UPDATE public.pricing_settings SET enabled = FALSE, updated_at = NOW()
WHERE id = 'premium_lifetime';