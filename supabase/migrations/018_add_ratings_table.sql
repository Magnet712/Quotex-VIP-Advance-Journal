-- ============================================================
-- Migration: 018_add_ratings_table.sql
-- Purpose  : User ratings for member-driven trust signals
-- ============================================================

-- 1. Create ratings table (1 rating per user, upsert)
CREATE TABLE IF NOT EXISTS public.ratings (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  rating SMALLINT NOT NULL CHECK (rating >= 1 AND rating <= 5),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id)
);

-- 2. Index for fast average query
CREATE INDEX IF NOT EXISTS idx_ratings_user_id ON public.ratings(user_id);

-- 3. Enable RLS
ALTER TABLE public.ratings ENABLE ROW LEVEL SECURITY;

-- 4. RLS: users can insert/update their own rating
CREATE POLICY "users_manage_own_rating"
  ON public.ratings
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 5. RLS: anyone can read ratings (for public average display)
CREATE POLICY "public_read_ratings"
  ON public.ratings
  FOR SELECT
  USING (true);
