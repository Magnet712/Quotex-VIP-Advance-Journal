/**
 * Simulated OTC Feed
 *
 * Wraps the EXISTING seeded-deterministic price generation into the
 * standard OTCCandle format. The strategy engine calls this the same
 * way it would call a live OTC feed — it cannot tell the difference.
 *
 * NOTE: The seeded random logic (sr function) is the SAME algorithm
 * used in the signals page. This feed is the data layer abstraction
 * of what was previously inline in the component.
 *
 * EXISTING STRATEGY IS UNTOUCHED — this file only provides candles.
 */

import type { OTCCandle, CandleProvider } from './types';

// ─── Seeded deterministic random (same as signals page — DO NOT CHANGE) ────
function sr(seed: number): number {
  const x = Math.sin(seed * 9301 + 49297) * 233280;
  return x - Math.floor(x);
}

// ─── OTC pair base prices (mirrors OTC_PAIRS in signals page) ────────────
const PAIR_BASE_PRICES: Record<string, { base: number; pip: number }> = {
  'EUR/USD': { base: 1.08450, pip: 5 },
  'GBP/USD': { base: 1.26500, pip: 5 },
  'USD/JPY': { base: 149.500, pip: 2 },
  'AUD/USD': { base: 0.65200, pip: 5 },
  'USD/CAD': { base: 1.35800, pip: 5 },
  'EUR/JPY': { base: 162.100, pip: 2 },
  'GBP/JPY': { base: 189.200, pip: 2 },
  'EUR/GBP': { base: 0.85700, pip: 5 },
  'NZD/USD': { base: 0.59800, pip: 5 },
  'USD/CHF': { base: 0.90400, pip: 5 },
  'EUR/AUD': { base: 1.66200, pip: 5 },
  'GBP/AUD': { base: 1.93600, pip: 5 },
  'AUD/JPY': { base: 97.500,  pip: 2 },
  'CAD/JPY': { base: 110.200, pip: 2 },
  'CHF/JPY': { base: 165.400, pip: 2 },
  'EUR/CAD': { base: 1.47300, pip: 5 },
  'GBP/CAD': { base: 1.71500, pip: 5 },
  'USD/SGD': { base: 1.34200, pip: 5 },
  'USD/INR': { base: 83.650,  pip: 2 },
  'USD/BRL': { base: 4.98500, pip: 3 },
  'USD/MXN': { base: 17.1500, pip: 3 },
  'EUR/CHF': { base: 0.97800, pip: 5 },
  'GBP/CHF': { base: 1.13200, pip: 5 },
  'AUD/CAD': { base: 0.89600, pip: 5 },
  'AUD/NZD': { base: 1.09100, pip: 5 },
  'NZD/JPY': { base: 89.700,  pip: 2 },
  'GBP/NZD': { base: 2.11500, pip: 5 },
  'EUR/NZD': { base: 1.81200, pip: 5 },
  'CAD/CHF': { base: 0.66600, pip: 5 },
  'USD/ZAR': { base: 18.6500, pip: 3 },
  'USD/TRY': { base: 32.4500, pip: 3 },
  'USD/ARS': { base: 920.00,  pip: 1 },
  'USD/PKR': { base: 278.50,  pip: 1 },
  'USD/BDT': { base: 109.80,  pip: 1 },
};

/**
 * Generates a simulated OHLC candle for a given pair and minute-based seed.
 * Mirrors the price generation used in the signals page (entry price logic).
 * Returns the candle in the standard OTCCandle format.
 */
function buildSimulatedCandle(
  pair: string,
  minuteSeed: number,
  candleTimestamp: Date
): OTCCandle {
  const config = PAIR_BASE_PRICES[pair];
  if (!config) {
    throw new Error(`SimulatedFeed: unknown pair "${pair}"`);
  }

  // Seed is based on pair name hash + minute window (same determinism as strategy)
  const pairHash = pair.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const s = pairHash * 7919 + minuteSeed;

  // Price jitter (same as signals page — line 239-241)
  const priceJitter = (sr(s + 0.9) - 0.5) * config.base * 0.003;
  const close       = parseFloat((config.base + priceJitter).toFixed(config.pip));

  // Simulate OHLC from close (realistic spread)
  const spread = config.base * 0.001;
  const open   = parseFloat((close + (sr(s + 1.1) - 0.5) * spread).toFixed(config.pip));
  const high   = parseFloat((Math.max(open, close) + sr(s + 1.2) * spread).toFixed(config.pip));
  const low    = parseFloat((Math.min(open, close) - sr(s + 1.3) * spread).toFixed(config.pip));

  return {
    pair,
    timeframe: '1m',
    open,
    high,
    low,
    close,
    timestamp: candleTimestamp,
    source:    'simulation',
  };
}

// ─── Simulated Feed Provider Implementation ────────────────────────────────
export class SimulatedFeed implements CandleProvider {
  /**
   * Returns the latest simulated candle for a pair.
   * Uses the current minute as the seed — same as the signals page.
   */
  async getLatestCandle(pair: string, timeframe = '1m'): Promise<OTCCandle> {
    const now        = new Date();
    const minuteSeed = Math.floor(Date.now() / 60000);
    // Timestamp = start of this minute
    const candleTs   = new Date(Math.floor(now.getTime() / 60000) * 60000);
    return buildSimulatedCandle(pair, minuteSeed, candleTs);
  }

  /**
   * Returns simulated candles for a time range.
   * Each minute gets its own seeded candle.
   */
  async getCandleRange(
    pair: string,
    from: Date,
    to: Date,
    timeframe = '1m'
  ): Promise<OTCCandle[]> {
    const candles: OTCCandle[] = [];
    const startMs = Math.floor(from.getTime() / 60000) * 60000;
    const endMs   = Math.floor(to.getTime()   / 60000) * 60000;

    for (let ms = startMs; ms <= endMs; ms += 60000) {
      const seed = Math.floor(ms / 60000);
      const ts   = new Date(ms);
      candles.push(buildSimulatedCandle(pair, seed, ts));
    }

    return candles;
  }
}

// ─── Singleton export ──────────────────────────────────────────────────────
export const simulatedFeed = new SimulatedFeed();
