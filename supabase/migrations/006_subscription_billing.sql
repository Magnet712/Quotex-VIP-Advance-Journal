-- ============================================================
-- Migration: 006_subscription_billing.sql
-- Purpose  : Create tables for SaaS subscription management,
--            USDT wallets configurations, payment audit trails,
--            and in-app notifications.
-- ============================================================

-- 1. TABLE: pricing_settings
CREATE TABLE IF NOT EXISTS public.pricing_settings (
    id          TEXT        PRIMARY KEY, -- e.g., 'free', 'vip', 'premium_monthly', 'premium_6months', 'premium_lifetime'
    name        TEXT        NOT NULL,
    price       NUMERIC     NOT NULL DEFAULT 0,
    currency    TEXT        NOT NULL DEFAULT 'USD',
    discount    NUMERIC     NOT NULL DEFAULT 0,
    enabled     BOOLEAN     NOT NULL DEFAULT TRUE,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.pricing_settings ENABLE ROW LEVEL SECURITY;

-- Policies for pricing_settings
CREATE POLICY "Admins can manage pricing_settings"
    ON public.pricing_settings FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM public.admins WHERE id = auth.uid()))
    WITH CHECK (EXISTS (SELECT 1 FROM public.admins WHERE id = auth.uid()));

CREATE POLICY "Authenticated users can read pricing_settings"
    ON public.pricing_settings FOR SELECT TO authenticated
    USING (true);

-- Seed default plans
INSERT INTO public.pricing_settings (id, name, price, currency, discount, enabled)
VALUES 
  ('free', 'Free Account', 0, 'USD', 0, TRUE),
  ('vip', 'VIP Journal', 0, 'USD', 0, TRUE),
  ('premium_monthly', 'Premium Monthly', 19, 'USD', 0, TRUE),
  ('premium_6months', 'Premium 6 Months', 99, 'USD', 0, TRUE),
  ('premium_lifetime', 'Premium Lifetime', 199, 'USD', 0, TRUE)
ON CONFLICT (id) DO NOTHING;


-- 2. TABLE: wallet_settings
CREATE TABLE IF NOT EXISTS public.wallet_settings (
    network       TEXT        PRIMARY KEY, -- 'USDT_TRC20', 'USDT_BEP20'
    display_name  TEXT        NOT NULL,
    address       TEXT        NOT NULL,
    enabled       BOOLEAN     NOT NULL DEFAULT TRUE,
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.wallet_settings ENABLE ROW LEVEL SECURITY;

-- Policies for wallet_settings
CREATE POLICY "Admins can manage wallet_settings"
    ON public.wallet_settings FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM public.admins WHERE id = auth.uid()))
    WITH CHECK (EXISTS (SELECT 1 FROM public.admins WHERE id = auth.uid()));

CREATE POLICY "Authenticated users can read wallet_settings"
    ON public.wallet_settings FOR SELECT TO authenticated
    USING (true);

-- Seed default wallet settings
INSERT INTO public.wallet_settings (network, display_name, address, enabled)
VALUES
  ('USDT_TRC20', 'USDT (TRC-20)', 'TXxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', TRUE),
  ('USDT_BEP20', 'USDT (BEP-20)', '0x0000000000000000000000000000000000000000', TRUE)
ON CONFLICT (network) DO NOTHING;


-- 3. TABLE: payment_requests
CREATE TABLE IF NOT EXISTS public.payment_requests (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    plan_id         TEXT        NOT NULL REFERENCES public.pricing_settings(id),
    amount          NUMERIC     NOT NULL,
    currency        TEXT        NOT NULL DEFAULT 'USDT',
    network         TEXT        NOT NULL,
    wallet_address  TEXT        NOT NULL,
    txn_hash        TEXT,
    status          TEXT        NOT NULL DEFAULT 'PENDING' 
                    CHECK (status IN ('PENDING', 'PROCESSING', 'CONFIRMED', 'EXPIRED', 'FAILED')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at      TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '1 hour'),
    confirmed_at    TIMESTAMPTZ
);

ALTER TABLE public.payment_requests ENABLE ROW LEVEL SECURITY;

-- Policies for payment_requests
CREATE POLICY "Admins can select and update all payment_requests"
    ON public.payment_requests FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM public.admins WHERE id = auth.uid()))
    WITH CHECK (EXISTS (SELECT 1 FROM public.admins WHERE id = auth.uid()));

CREATE POLICY "Users can manage own payment_requests"
    ON public.payment_requests FOR ALL TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());


-- 4. TABLE: subscriptions
CREATE TABLE IF NOT EXISTS public.subscriptions (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    plan_id       TEXT        NOT NULL REFERENCES public.pricing_settings(id),
    status        TEXT        NOT NULL DEFAULT 'ACTIVE'
                  CHECK (status IN ('ACTIVE', 'EXPIRED', 'CANCELLED')),
    activated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at    TIMESTAMPTZ, -- null indicates lifetime
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

-- Policies for subscriptions
CREATE POLICY "Admins can manage all subscriptions"
    ON public.subscriptions FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM public.admins WHERE id = auth.uid()))
    WITH CHECK (EXISTS (SELECT 1 FROM public.admins WHERE id = auth.uid()));

CREATE POLICY "Users can read own subscriptions"
    ON public.subscriptions FOR SELECT TO authenticated
    USING (user_id = auth.uid());


-- 5. TABLE: subscription_logs
CREATE TABLE IF NOT EXISTS public.subscription_logs (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    plan_id     TEXT        NOT NULL REFERENCES public.pricing_settings(id),
    action      TEXT        NOT NULL CHECK (action IN ('ACTIVATED', 'EXPIRED', 'DEACTIVATED', 'CANCELLED')),
    details     TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.subscription_logs ENABLE ROW LEVEL SECURITY;

-- Policies for subscription_logs
CREATE POLICY "Admins can manage all subscription_logs"
    ON public.subscription_logs FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM public.admins WHERE id = auth.uid()))
    WITH CHECK (EXISTS (SELECT 1 FROM public.admins WHERE id = auth.uid()));

CREATE POLICY "Users can view own subscription_logs"
    ON public.subscription_logs FOR SELECT TO authenticated
    USING (user_id = auth.uid());


-- 6. TABLE: payment_audit_logs
CREATE TABLE IF NOT EXISTS public.payment_audit_logs (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    payment_request_id  UUID        REFERENCES public.payment_requests(id) ON DELETE SET NULL,
    user_id             UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    txn_hash            TEXT        NOT NULL UNIQUE,
    network             TEXT        NOT NULL,
    amount              NUMERIC     NOT NULL,
    status              TEXT        NOT NULL,
    verification_source TEXT        NOT NULL DEFAULT 'automatic',
    confirmed_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.payment_audit_logs ENABLE ROW LEVEL SECURITY;

-- Policies for payment_audit_logs
CREATE POLICY "Admins can manage payment_audit_logs"
    ON public.payment_audit_logs FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM public.admins WHERE id = auth.uid()))
    WITH CHECK (EXISTS (SELECT 1 FROM public.admins WHERE id = auth.uid()));

CREATE POLICY "Users can select own payment_audit_logs"
    ON public.payment_audit_logs FOR SELECT TO authenticated
    USING (user_id = auth.uid());


-- 7. TABLE: notification_logs
CREATE TABLE IF NOT EXISTS public.notification_logs (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    title       TEXT        NOT NULL,
    message     TEXT        NOT NULL,
    is_read     BOOLEAN     NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.notification_logs ENABLE ROW LEVEL SECURITY;

-- Policies for notification_logs
CREATE POLICY "Users can manage own notification_logs"
    ON public.notification_logs FOR ALL TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());
