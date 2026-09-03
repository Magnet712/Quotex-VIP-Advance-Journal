-- Migration: Add recovery_pin_hash column to users table
-- Enables self-service password recovery using a secure 4-to-6 digit PIN.

ALTER TABLE public.users 
ADD COLUMN IF NOT EXISTS recovery_pin_hash TEXT;
