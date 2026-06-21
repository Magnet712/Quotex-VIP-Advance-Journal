-- Alter entry_price and exit_price to be optional
ALTER TABLE public.trades 
  ALTER COLUMN entry_price DROP NOT NULL,
  ALTER COLUMN exit_price DROP NOT NULL;

-- Add new columns for advanced metrics and session-based trade entry
ALTER TABLE public.trades
  ADD COLUMN IF NOT EXISTS emotional_state TEXT,
  ADD COLUMN IF NOT EXISTS trade_quality TEXT,
  ADD COLUMN IF NOT EXISTS execution_grade TEXT,
  ADD COLUMN IF NOT EXISTS session TEXT,
  ADD COLUMN IF NOT EXISTS initial_balance NUMERIC,
  ADD COLUMN IF NOT EXISTS target NUMERIC,
  ADD COLUMN IF NOT EXISTS results TEXT,
  ADD COLUMN IF NOT EXISTS percentage NUMERIC;
