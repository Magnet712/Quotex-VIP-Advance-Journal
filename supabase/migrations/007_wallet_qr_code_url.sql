-- Migration: Add qr_code_url column to wallet_settings table
-- Allows admins to upload a custom deposit QR image or fallback to auto-generated QR.

ALTER TABLE public.wallet_settings 
ADD COLUMN IF NOT EXISTS qr_code_url TEXT;
