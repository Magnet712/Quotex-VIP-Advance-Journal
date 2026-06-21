-- Quotex Advance Journal Database Schema
-- Run this in the Supabase SQL Editor to set up your tables and policies.

-- Enable UUID extension if not enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

----------------------------------------------------
-- TABLES
----------------------------------------------------

-- 1. Admins Table (Must be created before users and policies)
CREATE TABLE IF NOT EXISTS public.admins (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT UNIQUE NOT NULL,
    role TEXT NOT NULL DEFAULT 'admin',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Users Table (Trader Profiles)
CREATE TABLE IF NOT EXISTS public.users (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    trader_id TEXT UNIQUE NOT NULL,
    username TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    vip_access BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Trading Journal Table
CREATE TABLE IF NOT EXISTS public.trades (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    trade_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    asset TEXT NOT NULL,
    strategy TEXT NOT NULL,
    entry_price NUMERIC NOT NULL,
    exit_price NUMERIC NOT NULL,
    profit_loss NUMERIC NOT NULL, -- Positive for profit, negative for loss
    screenshot_url TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

----------------------------------------------------
-- ROW LEVEL SECURITY (RLS)
----------------------------------------------------

ALTER TABLE public.admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trades ENABLE ROW LEVEL SECURITY;

-- ADMINS POLICIES
CREATE POLICY "Admins can view admins" 
    ON public.admins 
    FOR SELECT 
    TO authenticated 
    USING (auth.uid() = id OR EXISTS (SELECT 1 FROM public.admins WHERE id = auth.uid()));

CREATE POLICY "Admins can insert admins" 
    ON public.admins 
    FOR INSERT 
    TO authenticated 
    WITH CHECK (EXISTS (SELECT 1 FROM public.admins WHERE id = auth.uid()));

-- USERS POLICIES
CREATE POLICY "Users can view their own profile" 
    ON public.users 
    FOR SELECT 
    TO authenticated 
    USING (auth.uid() = id OR EXISTS (SELECT 1 FROM public.admins WHERE id = auth.uid()));

CREATE POLICY "Users can insert their own profile during signup" 
    ON public.users 
    FOR INSERT 
    TO authenticated 
    WITH CHECK (auth.uid() = id);

CREATE POLICY "Admins can update user profiles" 
    ON public.users 
    FOR UPDATE 
    TO authenticated 
    USING (EXISTS (SELECT 1 FROM public.admins WHERE id = auth.uid()))
    WITH CHECK (EXISTS (SELECT 1 FROM public.admins WHERE id = auth.uid()));

CREATE POLICY "Admins can delete user profiles" 
    ON public.users 
    FOR DELETE 
    TO authenticated 
    USING (EXISTS (SELECT 1 FROM public.admins WHERE id = auth.uid()));

-- TRADES POLICIES
CREATE POLICY "Users can view their own trades if approved" 
    ON public.trades 
    FOR SELECT 
    TO authenticated 
    USING (
        (auth.uid() = user_id AND EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND status = 'approved'))
        OR EXISTS (SELECT 1 FROM public.admins WHERE id = auth.uid())
    );

CREATE POLICY "Users can insert their own trades if approved" 
    ON public.trades 
    FOR INSERT 
    TO authenticated 
    WITH CHECK (
        auth.uid() = user_id AND EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND status = 'approved')
    );

CREATE POLICY "Users can update their own trades if approved" 
    ON public.trades 
    FOR UPDATE 
    TO authenticated 
    USING (
        auth.uid() = user_id AND EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND status = 'approved')
    )
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own trades if approved" 
    ON public.trades 
    FOR DELETE 
    TO authenticated 
    USING (
        auth.uid() = user_id AND EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND status = 'approved')
    );

----------------------------------------------------
-- STORAGE BUCKETS SETUP (Instructions)
----------------------------------------------------
-- You must create a storage bucket named "trade-screenshots" in the Supabase Dashboard.
-- Set the bucket to PUBLIC or add the following policies for the bucket:
-- 
-- 1. "Allow authenticated users to upload screenshots"
--    ON storage.objects FOR INSERT TO authenticated
--    WITH CHECK (bucket_id = 'trade-screenshots' AND (auth.uid()::text = (storage.foldername(name))[1]));
--
-- 2. "Allow public access to screenshots"
--    ON storage.objects FOR SELECT TO public
--    USING (bucket_id = 'trade-screenshots');


----------------------------------------------------
-- SEED INITIAL ADMIN (Optional Instruction)
----------------------------------------------------
-- To seed an initial admin account:
-- 1. Sign up a user with email "admin@quotex.journal" and your admin password.
-- 2. Find the user ID in the auth.users table.
-- 3. Run:
--    INSERT INTO public.admins (id, email, role) VALUES ('<USER_UUID>', 'admin@quotex.journal', 'admin');
-- 4. In public.users, mark the admin as approved so they have secondary profiles if needed:
--    INSERT INTO public.users (id, trader_id, username, status) VALUES ('<USER_UUID>', 'ADMIN', 'System Admin', 'approved');
