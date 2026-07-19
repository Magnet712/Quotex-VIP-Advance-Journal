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

// ─── Read current signal mode from Supabase (cached 5 min) ─────────────────
// The signal mode is toggled by admin — never changes mid-session.
// Caching eliminates redundant Supabase queries on every candle fetch.
let _modeCache: { mode: SignalMode; ts: number } | null = null;
const MODE_CACHE_TTL = 300_000; // 5 minutes

async function readSignalMode(): Promise<SignalMode> {
  const now = Date.now();
  if (_modeCache && now - _modeCache.ts < MODE_CACHE_TTL) {
    return _modeCache.mode;
  }

  try {
    const { createClient } = await import('@/lib/supabase/client');
    const supabase = createClient();

    const { data, error } = await supabase
      .from('system_settings')
      .select('value')
      .eq('key', 'signal_mode')
      .single();

    const mode = (error || !data) ? 'SIMULATION' : (data.value as SignalMode) ?? 'SIMULATION';
    _modeCache = { mode, ts: now };
    return mode;
  } catch {
    _modeCache = { mode: 'SIMULATION' as SignalMode, ts: now };
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
        const livePromise = otcFeedProvider.getCandleRange(pair, at, to, timeframe);
        const timeout = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Live provider timeout')), 10_000)
        );
        const candles = await Promise.race([livePromise, timeout]);
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

/**
 * Get a range of candles for a pair over a time window.
 * Used by the indicator engine to compute RSI, moving averages, ATR, etc.
 * Routes to the correct feed based on the current signal mode.
 *
 * @param pair - e.g. "EUR/USD"
 * @param from - start of the range
 * @param to   - end of the range (inclusive)
 * @param timeframe - e.g. "1m"
 * @returns Array of OTCCandle ordered chronologically
 */
export async function getCandleRange(
  pair: string,
  from: Date,
  to: Date,
  timeframe = '1m'
): Promise<OTCCandle[]> {
  const mode = await readSignalMode();

  if (mode === 'LIVE_OTC') {
    try {
      return await otcFeedProvider.getCandleRange(pair, from, to, timeframe);
    } catch (err) {
      if (err instanceof OTCFeedUnavailableError) {
        console.warn(`[OTC Router] Live feed unavailable for ${pair} range fetch. Using simulation fallback.`);
      } else {
        console.error(`[OTC Router] Unexpected error for ${pair} range fetch:`, err);
      }
    }
  }

  return await simulatedFeed.getCandleRange(pair, from, to, timeframe);
}

// ─── Re-export types for convenience ──────────────────────────────────────
export type { OTCCandle, SignalMode, CandleRouterResult } from './types';
