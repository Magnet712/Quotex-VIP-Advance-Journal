/**
 * OTC Data Layer — Router / Public API
 *
 * This is the single entry point for candle data throughout the app.
 * The strategy engine, signal saver, and result tracker all call this
 * module. They never import SimulatedFeed or OTCFeedProvider directly.
 *
 * Routing logic:
 *   1. Read signal_mode from Supabase system_settings
 *   2. If SIMULATION → use SimulatedFeed
 *   3. If LIVE_OTC   → try OTCFeedProvider
 *                       on failure → fallback to SimulatedFeed
 *                       set fallback = true in result
 *
 * EXISTING STRATEGY IS UNTOUCHED — this file only provides candles.
 */

import { simulatedFeed }                   from './simulated_feed';
import { otcFeedProvider, OTCFeedUnavailableError } from './otc_feed';
import type { OTCCandle, SignalMode, CandleRouterResult } from './types';

// ─── Read current signal mode from Supabase ────────────────────────────────
// This is a server-side only utility (uses service key implicitly via anon).
// Falls back to SIMULATION if Supabase is unreachable.
async function readSignalMode(): Promise<SignalMode> {
  try {
    // Dynamic import to avoid bundling server-only code on client
    const { createClient } = await import('@/lib/supabase/server');
    const supabase = await createClient();

    const { data, error } = await supabase
      .from('system_settings')
      .select('value')
      .eq('key', 'signal_mode')
      .single();

    if (error || !data) return 'SIMULATION';
    return (data.value as SignalMode) ?? 'SIMULATION';
  } catch {
    // If Supabase is unreachable, default to safe simulation mode
    return 'SIMULATION';
  }
}

// ─── Main data router ──────────────────────────────────────────────────────
/**
 * Get the latest candle for a pair, routing to the correct feed based
 * on the current admin-controlled signal mode.
 *
 * @param pair - e.g. "EUR/USD"
 * @param timeframe - e.g. "1m"
 * @returns CandleRouterResult with candle, source info, and fallback flag
 */
export async function getLatestCandle(
  pair: string,
  timeframe = '1m'
): Promise<CandleRouterResult> {
  const mode = await readSignalMode();

  if (mode === 'LIVE_OTC') {
    try {
      const candle = await otcFeedProvider.getLatestCandle(pair, timeframe);
      return { candle, source: 'live_otc', isLive: true, fallback: false };
    } catch (err) {
      if (err instanceof OTCFeedUnavailableError) {
        // Expected: live feed not connected → fallback gracefully
        console.warn(`[OTC Router] Live feed unavailable for ${pair}. Using simulation fallback.`);
      } else {
        console.error(`[OTC Router] Unexpected error for ${pair}:`, err);
      }
      // Fallback to simulation
      const candle = await simulatedFeed.getLatestCandle(pair, timeframe);
      return { candle, source: 'simulation', isLive: false, fallback: true };
    }
  }

  // Default: SIMULATION mode
  const candle = await simulatedFeed.getLatestCandle(pair, timeframe);
  return { candle, source: 'simulation', isLive: false, fallback: false };
}

/**
 * Get a candle at a specific timestamp for a pair.
 * Used for result calculation: fetches the expiry-minute candle.
 *
 * @param pair - e.g. "EUR/USD"
 * @param at   - target timestamp (start of the minute)
 */
export async function getCandleAtTime(
  pair: string,
  at: Date,
  timeframe = '1m'
): Promise<OTCCandle | null> {
  const mode = await readSignalMode();
  const to   = new Date(at.getTime() + 60000); // +1 minute window

  try {
    if (mode === 'LIVE_OTC') {
      try {
        const candles = await otcFeedProvider.getCandleRange(pair, at, to, timeframe);
        return candles[0] ?? null;
      } catch {
        // Fallthrough to simulation
      }
    }
    const candles = await simulatedFeed.getCandleRange(pair, at, to, timeframe);
    return candles[0] ?? null;
  } catch {
    return null;
  }
}

// ─── Re-export types for convenience ──────────────────────────────────────
export type { OTCCandle, SignalMode, CandleRouterResult } from './types';
