-- Migration: 010_provider_telemetry_status.sql
-- Add status column to track explicit connection state machine.

ALTER TABLE public.provider_telemetry
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'INITIALIZING';
