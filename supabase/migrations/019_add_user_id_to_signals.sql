-- ============================================================
-- Migration: 019_add_user_id_to_signals
-- Purpose  : Add user_id column to signals table and enforce
--            user-scoped RLS for per-user signal isolation.
--            No existing data lost — user_id is nullable for
--            legacy records; new inserts require it via RLS.
-- ============================================================

-- 1. Add user_id column (nullable to preserve existing rows)
ALTER TABLE public.signals
ADD COLUMN user_id UUID REFERENCES public.users(id) ON DELETE CASCADE;

-- 2. Index for fast user-scoped queries
CREATE INDEX IF NOT EXISTS idx_signals_user_id ON public.signals(user_id);

-- 3. Drop old user-level policies that allowed global access
--    (admin policy "Admins can manage signals" is kept as-is)
DROP POLICY IF EXISTS "Approved users can read signals" ON public.signals;
DROP POLICY IF EXISTS "Authenticated users can insert signals" ON public.signals;
DROP POLICY IF EXISTS "Authenticated users can update signal results" ON public.signals;

-- 4. RLS: users read only their own signals
--    Admins are covered by the existing "Admins can manage signals" policy
CREATE POLICY "Users read own signals"
    ON public.signals
    FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

-- 5. RLS: users insert with their own user_id
CREATE POLICY "Users insert own signals"
    ON public.signals
    FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = user_id);

-- 6. RLS: users update only their own signals
CREATE POLICY "Users update own signals"
    ON public.signals
    FOR UPDATE
    TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);
